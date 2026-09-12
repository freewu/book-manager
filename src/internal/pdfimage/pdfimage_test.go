package pdfimage

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFileName(t *testing.T) {
	cases := []struct {
		prefix string
		format string
		page   int
		total  int
		want   string
	}{
		{"huozhe", "png", 1, 12, "huozhe-001.png"},
		{"huozhe", "PNG", 12, 12, "huozhe-012.png"},
		{"huozhe", "jpeg", 7, 9, "huozhe-007.jpg"},
		{"", "jpg", 3, 1200, "page-0003.jpg"},
		{"三体", "png", 300, 300, "三体-300.png"},
	}
	for _, c := range cases {
		ext := Ext(c.format)
		if got := FileName(c.prefix, ext, c.page, c.total); got != c.want {
			t.Errorf("FileName(%q, %q, %d, %d) = %q, 期望 %q", c.prefix, c.format, c.page, c.total, got, c.want)
		}
	}
	if w := PadWidth(1000); w != 4 {
		t.Errorf("PadWidth(1000) = %d, 期望 4", w)
	}
}

func TestSanitizePrefix(t *testing.T) {
	cases := map[string]string{
		`..\evil/na:me*?`: ".._evil_na_me__",
		"  book  ":        "book",
		"trailing...":     "trailing",
		"":                "page",
		"...":             "page",
		"a\tb":            "ab",
		`C:\Users\Book`:   "C__Users_Book",
	}
	for in, want := range cases {
		if got := SanitizePrefix(in); got != want {
			t.Errorf("SanitizePrefix(%q) = %q, 期望 %q", in, got, want)
		}
	}
}

func TestSaveCreatesDirAndWrites(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "img", "deep")
	res, err := Save(Options{Dir: dir, Prefix: "book", Format: "png", Page: 2, Total: 12, Data: []byte("PNGDATA")})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if res.Name != "book-002.png" || res.Page != 2 || res.Bytes != 7 || res.Existed {
		t.Fatalf("结果异常: %+v", res)
	}
	if res.Path != filepath.Join(dir, "book-002.png") {
		t.Fatalf("路径异常: %s", res.Path)
	}
	got, err := os.ReadFile(res.Path)
	if err != nil || string(got) != "PNGDATA" {
		t.Fatalf("内容异常: %q %v", got, err)
	}
	// 目录里不应该留下临时文件
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Fatalf("目录里多了文件: %v", entries)
	}
}

func TestSaveOverwritesAndReportsExisted(t *testing.T) {
	dir := t.TempDir()
	first, err := Save(Options{Dir: dir, Prefix: "b", Format: "png", Page: 1, Total: 1, Data: []byte("one")})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	second, err := Save(Options{Dir: dir, Prefix: "b", Format: "png", Page: 1, Total: 1, Data: []byte("twotwo")})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if second.Path != first.Path || !second.Existed || second.Bytes != 6 {
		t.Fatalf("覆盖结果异常: %+v", second)
	}
	if got, _ := os.ReadFile(second.Path); string(got) != "twotwo" {
		t.Fatalf("覆盖后内容异常: %q", got)
	}
}

func TestSaveJpgExtension(t *testing.T) {
	dir := t.TempDir()
	res, err := Save(Options{Dir: dir, Prefix: "b", Format: "JPEG", Page: 1, Total: 3, Data: []byte("jpg")})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if !strings.HasSuffix(res.Name, ".jpg") {
		t.Fatalf("扩展名异常: %s", res.Name)
	}
}

func TestSaveGuards(t *testing.T) {
	dir := t.TempDir()
	cases := []struct {
		name string
		opts Options
		want error
	}{
		{"空目录", Options{Format: "png", Page: 1, Data: []byte("x")}, ErrNoDir},
		{"空数据", Options{Dir: dir, Format: "png", Page: 1}, ErrNoData},
		{"格式不支持", Options{Dir: dir, Format: "webp", Page: 1, Data: []byte("x")}, ErrBadFormat},
		{"页码为 0", Options{Dir: dir, Format: "png", Page: 0, Data: []byte("x")}, ErrBadPage},
		{"页码越界", Options{Dir: dir, Format: "png", Page: 5, Total: 3, Data: []byte("x")}, ErrBadPage},
	}
	for _, c := range cases {
		if _, err := Save(c.opts); !errors.Is(err, c.want) {
			t.Errorf("%s: err = %v, 期望 %v", c.name, err, c.want)
		}
	}
}
