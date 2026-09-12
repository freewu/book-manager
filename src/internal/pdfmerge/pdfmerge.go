// Package pdfmerge 把多个 PDF 合并成一个新文件（底层用 pdfcpu 的 MergeCreateFile）。
//
// 与 pdfcrypt 的分工：加密的输入先解到临时副本（保留原文件名，这样 pdfcpu 生成的
// 书签目录才是用户看到的书名），再把明文副本交给 pdfcpu 合并。合并结果只在写完后
// 才替换目标文件（pdfcpu 的 staged output），所以失败不会留下半个文件。
package pdfmerge

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/log"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"

	"bookmanager/internal/pdfcrypt"
)

var (
	// ErrNoFiles - 没有可合并的文件
	ErrNoFiles = errors.New("no pdf files to merge")
	// ErrNoOutPath - 没有给输出文件
	ErrNoOutPath = errors.New("no output file for the merged pdf")
	// ErrNotPDF - 不是 PDF（没有 %PDF- 头）
	ErrNotPDF = errors.New("not a pdf file")
	// ErrSameFile - 输出文件就是输入文件之一
	ErrSameFile = errors.New("output file is one of the input files")
)

// FileInfo 描述一个待合并的输入文件。Error 非空表示这个文件有问题
// （不是 PDF / 缺密码…），UI 直接按行展示，不影响其他文件。
type FileInfo struct {
	Path          string `json:"path"`
	Name          string `json:"name"`
	Size          int64  `json:"size"`
	Pages         int    `json:"pages"`
	Encrypted     bool   `json:"encrypted"`
	NeedsPassword bool   `json:"needs_password"`
	Error         string `json:"error"`
}

// Options 是合并参数。Files 的顺序就是合并顺序；Passwords 只需要给加密的文件。
type Options struct {
	Files     []string
	Passwords map[string]string
	OutPath   string
	// Bookmarks 为 true 时按文件名生成一份顶层书签目录。
	Bookmarks bool
}

// Result 是合并结果。
type Result struct {
	Path  string
	Files int
	Pages int
	Bytes int64
}

// 进度阶段：先逐个检查/解密输入文件，再交给 pdfcpu 合并。
const (
	PhasePrepare = "prepare"
	PhaseMerge   = "merge"
)

// ProgressFunc 在准备每个文件和开始合并时被调用。
type ProgressFunc func(current, total int, name, phase string)

// silenceOnce 关掉 pdfcpu 的控制台日志：这是 GUI，日志没地方去。
var silenceOnce sync.Once

func silencePDFCPU() {
	silenceOnce.Do(log.DisableLoggers)
}

// Inspect 报告一个输入文件的信息。不返回 error：问题放在 FileInfo.Error 里，
// 这样一个坏文件不会让整份列表读不出来。
func Inspect(path, password string) FileInfo {
	info, err := inspect(path, password)
	if err != nil {
		info.Error = err.Error()
	}
	return info
}

func inspect(path, password string) (FileInfo, error) {
	silencePDFCPU()

	info := FileInfo{Path: path, Name: filepath.Base(path)}
	md, err := pdfcrypt.Inspect(path, password)
	info.Size = md.Size
	if err != nil {
		if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			info.Encrypted = true
			info.NeedsPassword = true
			return info, nil
		}
		if !hasPDFHeader(path) {
			return info, ErrNotPDF
		}
		return info, err
	}
	info.Pages = md.Pages
	info.Encrypted = md.Encrypted
	// 加密的文件在合并前一定要先解密成临时副本，所以没给密码就提醒用户填。
	// 给了密码（且是对的）就不再提醒——Merge 仍然会按 Encrypted 去解密。
	info.NeedsPassword = md.Encrypted && password == ""
	return info, nil
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

// Merge 按 opts.Files 的顺序合并成一个新 PDF。
func Merge(opts Options, onProgress ProgressFunc) (Result, error) {
	files := make([]string, 0, len(opts.Files))
	for _, f := range opts.Files {
		if f = strings.TrimSpace(f); f != "" {
			files = append(files, f)
		}
	}
	if len(files) == 0 {
		return Result{}, ErrNoFiles
	}
	out := strings.TrimSpace(opts.OutPath)
	if out == "" {
		return Result{}, ErrNoOutPath
	}
	for _, f := range files {
		if sameFile(f, out) {
			return Result{}, ErrSameFile
		}
	}

	// 解密出来的副本都放在这里，函数返回时一起清掉
	tmpDir, err := os.MkdirTemp("", "bookmanager-pdfmerge-*")
	if err != nil {
		return Result{}, err
	}
	defer os.RemoveAll(tmpDir)

	total := len(files)
	res := Result{Files: total}
	inputs := make([]string, 0, total)
	for i, f := range files {
		name := filepath.Base(f)
		report(onProgress, i, total, name, PhasePrepare)

		info, err := inspect(f, opts.Passwords[f])
		if err != nil {
			switch {
			case errors.Is(err, ErrNotPDF):
				return Result{}, fmt.Errorf("《%s》不是有效的 PDF 文件", name)
			case errors.Is(err, pdfcrypt.ErrPasswordRequired):
				return Result{}, fmt.Errorf("《%s》已加密，需要先输入打开密码", name)
			default:
				return Result{}, fmt.Errorf("《%s》读取失败：%w", name, err)
			}
		}
		res.Pages += info.Pages

		if !info.Encrypted {
			inputs = append(inputs, f)
			continue
		}
		// 一个文件一个子目录 + 原文件名：pdfcpu 用文件名做书签，别让它看到临时名
		dir := filepath.Join(tmpDir, fmt.Sprintf("%03d", i))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return Result{}, err
		}
		dst := filepath.Join(dir, name)
		if err := pdfcrypt.DecryptTo(f, dst, opts.Passwords[f]); err != nil {
			if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
				return Result{}, fmt.Errorf("《%s》的密码不正确", name)
			}
			return Result{}, fmt.Errorf("《%s》解密失败：%w", name, err)
		}
		inputs = append(inputs, dst)
	}

	report(onProgress, total, total, "", PhaseMerge)

	conf := model.NewDefaultConfiguration()
	// 只有一个文件时不要给它套一层无意义的书签
	conf.CreateBookmarks = opts.Bookmarks && total > 1
	if err := api.MergeCreateFile(inputs, out, false, conf); err != nil {
		return Result{}, fmt.Errorf("合并失败：%w", translate(err))
	}

	res.Path = out
	if fi, err := os.Stat(out); err == nil {
		res.Bytes = fi.Size()
	}
	return res, nil
}

func report(fn ProgressFunc, current, total int, name, phase string) {
	if fn != nil {
		fn(current, total, name, phase)
	}
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

func translate(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, pdfcpu.ErrWrongPassword) || errors.Is(err, pdfcpu.ErrOwnerPasswordRequired) {
		return pdfcrypt.ErrPasswordRequired
	}
	return err
}
