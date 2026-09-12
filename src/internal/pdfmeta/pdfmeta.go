// Package pdfmeta 读写 PDF 的文档信息（Info 字典里的标题 / 作者 / 主题 / 关键词等）。
//
// 这里直接用 pdfcpu 的上下文 API，而不是 api.AddPropertiesFile：后者拒绝
// Keywords（pdfcpu 把它留给自己的 keywords 命令）也拒绝空值，而本工具需要
// 四个字段一起写、并且允许清空。只有真正改动过的键才会被写，Creator /
// Producer / 时间等一律原样保留。
//
// 输出先落到目标目录里的临时文件，关掉输入句柄后再改名，所以覆盖原文件时
// 也不会留下半个文件。
package pdfmeta

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/log"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"

	"bookmanager/internal/pdfcrypt"
)

var (
	// ErrNoInput 没有选择 PDF 文件。
	ErrNoInput = errors.New("no pdf file")
	// ErrNoOutPath 没有保存位置。
	ErrNoOutPath = errors.New("no output file")
	// ErrNotPDF 不是 PDF 文件（没有 %PDF- 头）。
	ErrNotPDF = errors.New("not a pdf file")
	// ErrEncryptedInPlace 加密的 PDF 不能原地覆盖：那样写出来会丢掉密码保护。
	ErrEncryptedInPlace = errors.New("cannot rewrite an encrypted pdf in place")
	// ErrNoInfoDict PDF 2.0 只用 XMP 记录元数据，pdfcpu 不会为它新建 Info
	// 字典，关键词写不进去。
	ErrNoInfoDict = errors.New("pdf 2.0 file without an info dictionary")
)

// 可编辑字段名（Info 字典里的键），前端表单与之一一对应。
const (
	FieldTitle    = "Title"
	FieldAuthor   = "Author"
	FieldSubject  = "Subject"
	FieldKeywords = "Keywords"
)

// Info 是一个 PDF 的文档信息。
type Info struct {
	Path    string
	Name    string
	Size    int64
	Pages   int
	Version string
	// Encrypted 表示文件本身加密（可能只是权限加密，打开不需要密码）。
	Encrypted bool

	// 四个可编辑字段
	Title    string
	Author   string
	Subject  string
	Keywords []string

	// 只读信息
	Creator      string
	Producer     string
	CreationDate string
	ModDate      string
}

// Options 是保存参数。OutPath 与 Path 相同时就是原地覆盖。
type Options struct {
	Path     string
	Password string
	OutPath  string

	Title    string
	Author   string
	Subject  string
	Keywords []string
}

// Result 是保存结果。
type Result struct {
	Path    string
	Bytes   int64
	Changed []string
	InPlace bool
}

// silenceOnce 关掉 pdfcpu 的控制台日志：这是个 GUI 程序，
// "using AES-256" 之类的输出没有地方可去。
var silenceOnce sync.Once

func silencePDFCPU() {
	silenceOnce.Do(log.DisableLoggers)
}

// Inspect 读出 PDF 的文档信息。加密文件没有给（对的）密码时返回
// pdfcrypt.ErrPasswordRequired，调用方据此提示用户输入密码。
func Inspect(path, password string) (Info, error) {
	path = strings.TrimSpace(path)
	info := Info{Path: path}
	if path == "" {
		return info, ErrNoInput
	}
	silencePDFCPU()

	fi, err := os.Stat(path)
	if err != nil {
		return info, fmt.Errorf("文件读取失败：%w", err)
	}
	if fi.IsDir() || fi.Size() == 0 {
		return info, ErrNotPDF
	}
	info.Name = filepath.Base(path)
	info.Size = fi.Size()

	f, err := os.Open(path)
	if err != nil {
		return info, fmt.Errorf("文件读取失败：%w", err)
	}
	defer f.Close()

	conf := model.NewDefaultConfiguration()
	conf.UserPW = password
	pi, err := api.PDFInfo(f, path, nil, false, conf)
	if err != nil {
		if isPasswordError(err) {
			info.Encrypted = true
			return info, pdfcrypt.ErrPasswordRequired
		}
		if !hasPDFHeader(path) {
			return info, ErrNotPDF
		}
		return info, fmt.Errorf("读取 PDF 失败：%w", err)
	}

	info.Pages = pi.PageCount
	info.Version = pi.Version
	info.Encrypted = pi.Encrypted
	info.Title = pi.Title
	info.Author = pi.Author
	info.Subject = pi.Subject
	info.Keywords = normalizeKeywords(pi.Keywords)
	info.Creator = pi.Creator
	info.Producer = pi.Producer
	info.CreationDate = pi.CreationDate
	info.ModDate = pi.ModificationDate

	if info.Encrypted && password == "" {
		// 有些加密文件在被要求解密之前就把信息报出来了；交给 pdfcrypt 判断
		// 打开密码是否真的为空（只加密权限的文件不用问密码）。
		if _, err := pdfcrypt.Inspect(path, ""); errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			return info, pdfcrypt.ErrPasswordRequired
		}
	}
	return info, nil
}

// Save 把 Options 里的四个字段写进 Info 字典，其余键保持不变。
// OutPath 等于 Path 时原地覆盖原文件。
func Save(opts Options) (Result, error) {
	src := strings.TrimSpace(opts.Path)
	out := strings.TrimSpace(opts.OutPath)
	if src == "" {
		return Result{}, ErrNoInput
	}
	if out == "" {
		return Result{}, ErrNoOutPath
	}

	// 先读一遍：既校验密码，也拿到当前值用来只写改动过的键。
	cur, err := Inspect(src, opts.Password)
	if err != nil {
		return Result{}, err
	}

	inPlace := sameFile(src, out)
	ch := plan(cur, opts)
	if inPlace && len(ch.fields) == 0 {
		// 原地保存但什么都没改：不碰文件
		return Result{Path: out, Bytes: cur.Size, InPlace: true}, nil
	}
	if inPlace && cur.Encrypted {
		// 解密后写回去等于把密码摘掉了，让用户走「清除密码」或另存
		return Result{}, ErrEncryptedInPlace
	}

	input := src
	if cur.Encrypted {
		// 加密文件先解到临时副本，让 pdfcpu 以明文读
		dir, err := os.MkdirTemp("", "bookmanager-pdfmeta-*")
		if err != nil {
			return Result{}, fmt.Errorf("创建临时目录失败：%w", err)
		}
		defer os.RemoveAll(dir)
		dst := filepath.Join(dir, filepath.Base(src))
		if err := pdfcrypt.DecryptTo(src, dst, opts.Password); err != nil {
			if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
				return Result{}, fmt.Errorf("PDF 的密码不正确：%w", err)
			}
			return Result{}, fmt.Errorf("解密失败：%w", err)
		}
		input = dst
	}

	conf := model.NewDefaultConfiguration()
	conf.ValidationMode = model.ValidationRelaxed
	conf.Cmd = model.ADDPROPERTIES

	in, err := os.Open(input)
	if err != nil {
		return Result{}, fmt.Errorf("文件读取失败：%w", err)
	}
	defer in.Close()

	ctx, err := api.ReadValidateAndOptimize(in, conf)
	if err != nil {
		return Result{}, fmt.Errorf("读取 PDF 失败：%w", translate(err))
	}

	if len(ch.props) > 0 {
		if err := pdfcpu.PropertiesAdd(ctx, ch.props); err != nil {
			return Result{}, fmt.Errorf("写入文档信息失败：%w", err)
		}
	}
	if len(ch.remove) > 0 {
		if _, err := pdfcpu.PropertiesRemove(ctx, ch.remove); err != nil {
			return Result{}, fmt.Errorf("清除文档信息失败：%w", err)
		}
	}
	if ch.kwOn {
		if err := applyKeywords(ctx, ch.kw); err != nil {
			return Result{}, err
		}
	}

	mode := os.FileMode(0o644)
	if fi, err := os.Stat(out); err == nil {
		mode = fi.Mode().Perm()
	}
	tmp, err := os.CreateTemp(filepath.Dir(out), "."+filepath.Base(out)+".bookmanager-*")
	if err != nil {
		return Result{}, fmt.Errorf("创建临时文件失败：%w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	_ = tmp.Chmod(mode)

	if err := api.WriteContext(ctx, tmp); err != nil {
		tmp.Close()
		return Result{}, fmt.Errorf("写入 PDF 失败：%w", translate(err))
	}
	if err := tmp.Close(); err != nil {
		return Result{}, fmt.Errorf("写入 PDF 失败：%w", err)
	}
	// 改名（覆盖）之前先放开输入句柄：Windows 上被占用的文件替换不了
	in.Close()
	if err := os.Rename(tmpName, out); err != nil {
		return Result{}, fmt.Errorf("保存失败：%w", err)
	}

	res := Result{Path: out, Changed: ch.fields, InPlace: inPlace}
	if fi, err := os.Stat(out); err == nil {
		res.Bytes = fi.Size()
	}
	return res, nil
}

// applyKeywords 把关键词写成 Info 字典的 Keywords，并顺带清掉 XMP 里过期的
// 关键词。pdfcpu 的 KeywordsAdd 是增量语义，所以先把已有列表清空。
func applyKeywords(ctx *model.Context, kw []string) error {
	if ctx.Info == nil && ctx.XRefTable.Version() >= model.V20 {
		// PDF 2.0 的元数据只放在 XMP 里，pdfcpu 不会为它补 Info 字典
		return ErrNoInfoDict
	}
	ctx.KeywordList = types.StringSet{}
	if err := pdfcpu.KeywordsAdd(ctx, kw); err != nil {
		return fmt.Errorf("写入关键词失败：%w", err)
	}
	if len(kw) == 0 {
		// 清空时不留一个空的 Keywords 字符串
		if _, err := pdfcpu.PropertiesRemove(ctx, []string{FieldKeywords}); err != nil {
			return fmt.Errorf("清除关键词失败：%w", err)
		}
	}
	return nil
}

// change 是一次保存里要做的改动。
type change struct {
	props  map[string]string
	remove []string
	kw     []string
	kwOn   bool
	fields []string
}

// plan 比较当前值和目标值，只挑出真正改动过的键。
func plan(cur Info, opts Options) change {
	ch := change{props: map[string]string{}}
	set := func(field, curVal, newVal string) {
		v := strings.TrimSpace(newVal)
		if v == curVal {
			return
		}
		ch.fields = append(ch.fields, field)
		if v == "" {
			ch.remove = append(ch.remove, field)
			return
		}
		ch.props[field] = v
	}
	set(FieldTitle, cur.Title, opts.Title)
	set(FieldAuthor, cur.Author, opts.Author)
	set(FieldSubject, cur.Subject, opts.Subject)
	if kw := normalizeKeywords(opts.Keywords); !sameKeywords(cur.Keywords, kw) {
		ch.fields = append(ch.fields, FieldKeywords)
		ch.kw = kw
		ch.kwOn = true
	}
	return ch
}

// normalizeKeywords 去掉空白项和重复项并排序（pdfcpu 存进 Info 字典时也是
// 有序的，排序后比较起来才稳定）。
func normalizeKeywords(list []string) []string {
	seen := make(map[string]bool, len(list))
	out := make([]string, 0, len(list))
	for _, k := range list {
		k = strings.TrimSpace(k)
		if k == "" || seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func sameKeywords(a, b []string) bool {
	x, y := normalizeKeywords(a), normalizeKeywords(b)
	if len(x) != len(y) {
		return false
	}
	for i := range x {
		if x[i] != y[i] {
			return false
		}
	}
	return true
}

// hasPDFHeader 判断文件开头是否像 PDF（pdfcpu 对坏文件报的错五花八门，
// 统一成 ErrNotPDF 更好提示）。
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

// sameFile 判断两个路径是否指向同一个文件（含同一路径的不同写法）。
func sameFile(a, b string) bool {
	if a == b {
		return true
	}
	pa, err1 := filepath.Abs(a)
	pb, err2 := filepath.Abs(b)
	if err1 != nil || err2 != nil {
		return false
	}
	if strings.EqualFold(filepath.Clean(pa), filepath.Clean(pb)) {
		return true
	}
	fa, err1 := os.Stat(a)
	fb, err2 := os.Stat(b)
	return err1 == nil && err2 == nil && os.SameFile(fa, fb)
}

func isPasswordError(err error) bool {
	return errors.Is(err, pdfcpu.ErrWrongPassword) ||
		errors.Is(err, pdfcpu.ErrOwnerPasswordRequired)
}

// translate 把 pdfcpu 的密码错误映射成 pdfcrypt.ErrPasswordRequired。
func translate(err error) error {
	if err == nil {
		return nil
	}
	if isPasswordError(err) {
		return pdfcrypt.ErrPasswordRequired
	}
	return err
}
