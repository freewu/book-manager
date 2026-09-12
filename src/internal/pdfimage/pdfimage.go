// Package pdfimage 把前端 pdf.js 渲染出来的页面位图落盘成图片文件。
//
// 后端没有 PDF 光栅化能力（纯 Go，不引 CGO），所以「转存图片」由前端用 pdf.js
// 逐页画到 canvas 上编码成 PNG/JPEG，再一页一次交给这里写文件；这里只负责
// 目录准备、文件名规则（前缀 + 补零页码 + 扩展名）与原子落盘。
package pdfimage

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

var (
	// ErrNoDir 输出目录为空。
	ErrNoDir = errors.New("pdfimage: empty output dir")
	// ErrNoData 这一页没有任何图片数据。
	ErrNoData = errors.New("pdfimage: empty image data")
	// ErrBadFormat 只支持 png / jpg。
	ErrBadFormat = errors.New("pdfimage: unsupported image format")
	// ErrBadPage 页码越界（页码从 1 开始，且不能大于总页数）。
	ErrBadPage = errors.New("pdfimage: invalid page number")
)

// Options 描述「写一页图片」。
type Options struct {
	// Dir 输出目录，不存在时会被创建（含多级）。
	Dir string
	// Prefix 文件名前缀，缺省 "page"，非法字符会被替换成下划线。
	Prefix string
	// Format 图片格式："png"、"jpg" / "jpeg"（大小写不敏感）。
	Format string
	// Page 当前页（1 起），Total 是总页数（决定补零位数）。
	Page  int
	Total int
	// Data 是图片文件的原始字节（不是 base64）。
	Data []byte
}

// Result 描述落盘结果。
type Result struct {
	Path string
	Name string
	// Bytes 是写入的字节数。
	Bytes int64
	Page  int
	// Existed 表示写之前同名文件已经存在（这次把它覆盖了）。
	Existed bool
}

// Ext 返回规范化后的扩展名（带点），不支持时返回空串。
func Ext(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "png":
		return ".png"
	case "jpg", "jpeg":
		return ".jpg"
	default:
		return ""
	}
}

// PadWidth 返回页码补零位数：至少 3 位，页数上千时按实际位数。
func PadWidth(total int) int {
	w := len(strconv.Itoa(total))
	if w < 3 {
		w = 3
	}
	return w
}

// FileName 给出「第 page 页 / 共 total 页」的文件名。
func FileName(prefix, ext string, page, total int) string {
	return SanitizePrefix(prefix) + "-" + fmt.Sprintf("%0*d", PadWidth(total), page) + ext
}

// SanitizePrefix 清理文件名前缀：去掉路径分隔符与 Windows 非法字符、
// 去掉首尾空白和结尾的点，空串时退回 "page"。
func SanitizePrefix(prefix string) string {
	var b strings.Builder
	for _, r := range prefix {
		switch {
		case r < 0x20:
			continue
		case strings.ContainsRune(`\/:*?"<>|`, r):
			b.WriteRune('_')
		default:
			b.WriteRune(r)
		}
	}
	out := strings.TrimSpace(b.String())
	out = strings.TrimRight(out, ". ")
	if out == "" {
		return "page"
	}
	return out
}

// Save 把一页图片写到 opts.Dir 下，返回落盘路径。
//
// 文件先写临时名再改名，中途失败不会留下半张图片；同名文件会被覆盖，
// 结果里的 Existed 告诉调用方这次覆盖了几个。
func Save(opts Options) (Result, error) {
	dir := strings.TrimSpace(opts.Dir)
	if dir == "" {
		return Result{}, ErrNoDir
	}
	if len(opts.Data) == 0 {
		return Result{}, ErrNoData
	}
	ext := Ext(opts.Format)
	if ext == "" {
		return Result{}, ErrBadFormat
	}
	if opts.Page < 1 {
		return Result{}, ErrBadPage
	}
	if opts.Total > 0 && opts.Page > opts.Total {
		return Result{}, fmt.Errorf("%w: 第 %d 页 / 共 %d 页", ErrBadPage, opts.Page, opts.Total)
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return Result{}, fmt.Errorf("创建输出目录失败：%w", err)
	}

	name := FileName(opts.Prefix, ext, opts.Page, opts.Total)
	path := filepath.Join(dir, name)
	_, statErr := os.Stat(path)
	existed := statErr == nil

	tmp, err := os.CreateTemp(dir, ".pdfimage-*.tmp")
	if err != nil {
		return Result{}, fmt.Errorf("创建临时文件失败：%w", err)
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(opts.Data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return Result{}, fmt.Errorf("写入图片失败：%w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return Result{}, fmt.Errorf("写入图片失败：%w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		os.Remove(tmpName)
		return Result{}, fmt.Errorf("保存图片失败：%w", err)
	}

	return Result{
		Path:    path,
		Name:    name,
		Bytes:   int64(len(opts.Data)),
		Page:    opts.Page,
		Existed: existed,
	}, nil
}
