// Package pdfextract 把 PDF 里选中的页面提取成一个新文件（底层用 pdfcpu 的 CollectFile）。
//
// 与 pdfcrypt 的分工：加密的输入先解到临时副本，再把明文副本交给 pdfcpu 提取。
// pdfcpu 是「临时文件写完再替换」，失败不会留下半个文件。
package pdfextract

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/log"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"

	"bookmanager/internal/pdfcrypt"
)

var (
	// ErrNoInput - 没有输入文件
	ErrNoInput = errors.New("no pdf file to extract from")
	// ErrNoPages - 没有选任何页面
	ErrNoPages = errors.New("no pages selected")
	// ErrNoOutPath - 没有给输出文件
	ErrNoOutPath = errors.New("no output file for the extracted pdf")
	// ErrNotPDF - 不是 PDF（没有 %PDF- 头）
	ErrNotPDF = errors.New("not a pdf file")
	// ErrSameFile - 输出文件就是输入文件
	ErrSameFile = errors.New("output file is the input file")
)

// Options 是提取参数。Pages 是 1 起的页码，可以乱序/重复，内部会排序去重。
type Options struct {
	Path     string
	Password string
	Pages    []int
	OutPath  string
}

// Result 是提取结果。
type Result struct {
	Path  string
	Pages []int
	Bytes int64
}

// Inspect 返回 PDF 的页数与是否加密（加密文件需要正确的打开密码才能读出页数）。
func Inspect(path, password string) (pages int, encrypted bool, err error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return 0, false, ErrNoInput
	}
	silencePDFCPU()

	md, err := pdfcrypt.Inspect(path, password)
	if err != nil {
		if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			return 0, true, fmt.Errorf("PDF 已加密，需要先输入打开密码：%w", pdfcrypt.ErrPasswordRequired)
		}
		if !hasPDFHeader(path) {
			return 0, false, ErrNotPDF
		}
		return 0, false, fmt.Errorf("读取 PDF 失败：%w", err)
	}
	return md.Pages, md.Encrypted, nil
}

// Extract 把 opts.Pages 里的页面按页码升序提取成新 PDF。
func Extract(opts Options) (Result, error) {
	src := strings.TrimSpace(opts.Path)
	out := strings.TrimSpace(opts.OutPath)
	if out == "" {
		return Result{}, ErrNoOutPath
	}
	pages := normalize(opts.Pages)
	if len(pages) == 0 {
		return Result{}, ErrNoPages
	}
	total, enc, err := Inspect(src, opts.Password)
	if err != nil {
		return Result{}, err
	}
	if sameFile(src, out) {
		return Result{}, ErrSameFile
	}
	for _, p := range pages {
		if p > total {
			return Result{}, fmt.Errorf("第 %d 页超出了范围（共 %d 页）", p, total)
		}
	}

	// 加密文件先解到临时副本再提取（pdfcpu 只认一个打开密码）
	input := src
	if enc {
		tmpDir, err := os.MkdirTemp("", "bookmanager-pdfextract-*")
		if err != nil {
			return Result{}, err
		}
		defer os.RemoveAll(tmpDir)
		dst := filepath.Join(tmpDir, filepath.Base(src))
		if err := pdfcrypt.DecryptTo(src, dst, opts.Password); err != nil {
			if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
				return Result{}, fmt.Errorf("PDF 的密码不正确：%w", err)
			}
			return Result{}, fmt.Errorf("解密失败：%w", err)
		}
		input = dst
	}

	// 一页一个 token：pdfcpu 的收集顺序就是输出顺序，这里按升序输出
	sel := make([]string, 0, len(pages))
	for _, p := range pages {
		sel = append(sel, strconv.Itoa(p))
	}

	conf := model.NewDefaultConfiguration()
	if err := api.CollectFile(input, out, sel, conf); err != nil {
		return Result{}, fmt.Errorf("提取页面失败：%w", translate(err))
	}

	res := Result{Path: out, Pages: pages}
	if fi, err := os.Stat(out); err == nil {
		res.Bytes = fi.Size()
	}
	return res, nil
}

// normalize 排序去重，只保留正整数。
func normalize(pages []int) []int {
	seen := make(map[int]bool, len(pages))
	out := make([]int, 0, len(pages))
	for _, p := range pages {
		if p < 1 || seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	sort.Ints(out)
	return out
}

// hasPDFHeader 看文件前面有没有 %PDF- 头（规范允许头之前有少量垃圾字节）。
func hasPDFHeader(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	buf := make([]byte, 1024)
	n, _ := f.Read(buf)
	return strings.Contains(string(buf[:n]), "%PDF-")
}

// sameFile 判断两个路径是否指向同一个文件（大小写、相对路径都算）。
func sameFile(a, b string) bool {
	if a == "" || b == "" {
		return false
	}
	fa, err := filepath.Abs(a)
	if err != nil {
		fa = a
	}
	fb, err := filepath.Abs(b)
	if err != nil {
		fb = b
	}
	if strings.EqualFold(fa, fb) {
		return true
	}
	ia, err1 := os.Stat(fa)
	ib, err2 := os.Stat(fb)
	return err1 == nil && err2 == nil && os.SameFile(ia, ib)
}

// silenceOnce 关掉 pdfcpu 的控制台日志：这是 GUI，日志没地方去。
var silenceOnce sync.Once

func silencePDFCPU() {
	silenceOnce.Do(log.DisableLoggers)
}

func translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pdfcpu.ErrWrongPassword) || errors.Is(err, pdfcpu.ErrOwnerPasswordRequired) {
		return pdfcrypt.ErrPasswordRequired
	}
	return err
}
