package epub2pdf

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/phpdave11/gofpdf"
)

// ErrNoFont is returned when the book needs CJK glyphs but the machine has no
// TrueType CJK font installed.
var ErrNoFont = errors.New("未找到可用于排版的中文字体，请安装中文字体或设置环境变量 BOOKMANAGER_PDF_FONT 指向一个 .ttf 文件")

// cjkFonts are TrueType fonts that cover CJK, in order of preference.
// TrueType collections (.ttc) are not listed: the embedded font parser only
// understands a bare TrueType file.
var cjkFonts = []string{
	"Deng.ttf",    // 等线 (Windows 10+)
	"simhei.ttf",  // 黑体
	"simkai.ttf",  // 楷体
	"simfang.ttf", // 仿宋
	"msyh.ttf",    // 微软雅黑 (Windows 7)
	"NotoSansCJKsc-Regular.ttf",
	"NotoSansCJK-Regular.ttf",
	"SourceHanSansSC-Regular.ttf",
	"SourceHanSansCN-Regular.ttf",
	"文泉驿正黑.ttf",
}

// latinFonts are the fallbacks used when the text has no CJK runes.
var latinFonts = []string{
	"arial.ttf",
	"segoeui.ttf",
	"DejaVuSans.ttf",
	"LiberationSans-Regular.ttf",
}

// fontDirs are searched in order for the font names above.
var fontDirs = []string{
	`C:\Windows\Fonts`,
	`C:\WINNT\Fonts`,
	"/usr/share/fonts/truetype",
	"/usr/share/fonts/truetype/dejavu",
	"/usr/share/fonts/truetype/liberation",
	"/usr/share/fonts/truetype/noto",
	"/usr/share/fonts/opentype/noto",
	"/usr/share/fonts/wenquanyi",
	"/Library/Fonts",
	"/System/Library/Fonts",
}

// pdfFont is a loaded TrueType font ready to be embedded into the PDF.
type pdfFont struct {
	path string
	data []byte
}

// pickFont returns a font able to render text: a CJK font when the text has
// CJK runes, otherwise the first available font of any kind. EMBED_FONT (or
// BOOKMANAGER_PDF_FONT) overrides the search.
func pickFont(text string) (pdfFont, error) {
	for _, env := range []string{"BOOKMANAGER_PDF_FONT", "BOOKMANAGER_FONT"} {
		if custom := strings.TrimSpace(os.Getenv(env)); custom != "" {
			f, err := loadFont(custom)
			if err == nil {
				return f, nil
			}
		}
	}
	names := cjkFonts
	if !hasCJK(text) {
		names = append(append([]string{}, cjkFonts...), latinFonts...)
	}
	for _, dir := range append(fontDirs, extraFontDirs()...) {
		for _, name := range names {
			if f, err := loadFont(filepath.Join(dir, name)); err == nil {
				return f, nil
			}
		}
	}
	return pdfFont{}, ErrNoFont
}

// extraFontDirs adds the per-user font directories (a user-installed font is
// not visible in C:\Windows\Fonts).
func extraFontDirs() []string {
	dirs := []string{}
	if local := os.Getenv("LOCALAPPDATA"); local != "" {
		dirs = append(dirs, filepath.Join(local, "Microsoft", "Windows", "Fonts"))
	}
	if home, err := os.UserHomeDir(); err == nil {
		dirs = append(dirs, filepath.Join(home, ".fonts"), filepath.Join(home, "Library", "Fonts"))
	}
	return dirs
}

// loadFont reads and validates a TrueType font file. Only glyf-flavoured
// TrueType files are accepted (no .ttc collections, no CFF/OTTO fonts).
func loadFont(path string) (pdfFont, error) {
	data, err := os.ReadFile(path)
	if err != nil || len(data) < 12 {
		return pdfFont{}, errors.New("font not readable: " + path)
	}
	if !isTrueType(data) {
		return pdfFont{}, errors.New("not a plain TrueType font: " + path)
	}
	if !fontLoads(data) {
		return pdfFont{}, errors.New("font cannot be embedded: " + path)
	}
	return pdfFont{path: path, data: data}, nil
}

// fontLoads checks that the embedded font parser accepts the file (it needs a
// glyf table and a format 4 unicode cmap).
func fontLoads(data []byte) bool {
	probe := gofpdf.New("P", "mm", "A4", "")
	probe.AddUTF8FontFromBytes("probe", "", data)
	probe.AddPage()
	probe.SetFont("probe", "", 11)
	probe.Cell(10, 5, "中")
	return probe.Ok()
}

// isTrueType reports whether data starts with a bare TrueType (or OpenType
// with glyf outlines) table directory.
func isTrueType(data []byte) bool {
	if len(data) < 4 {
		return false
	}
	switch {
	case bytes.Equal(data[:4], []byte{0x00, 0x01, 0x00, 0x00}): // TrueType
		return true
	case bytes.Equal(data[:4], []byte("true")):
		return true
	case bytes.Equal(data[:4], []byte("ttcf")): // collection: unsupported
		return false
	case bytes.Equal(data[:4], []byte("OTTO")): // CFF outlines: unsupported
		return false
	}
	return false
}

// hasCJK reports whether s contains runes that need a CJK font.
func hasCJK(s string) bool {
	for _, r := range s {
		if unicode.Is(unicode.Han, r) || unicode.Is(unicode.Hiragana, r) ||
			unicode.Is(unicode.Katakana, r) || unicode.Is(unicode.Hangul, r) ||
			unicode.Is(unicode.Bopomofo, r) {
			return true
		}
		// 全角标点（，。、“”等）也走中文字体
		if r >= 0x3000 && r <= 0x303F {
			return true
		}
	}
	return false
}
