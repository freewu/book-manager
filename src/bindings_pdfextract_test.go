package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcrypt"
)

// tmpPDF 在临时目录里生成一份 name 的 pages 页 PDF（复用合并测试的生成器）。
func tmpPDF(t *testing.T, name string, pages int) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), name)
	writeTestPDF(t, p, pages)
	return p
}

// tmpEncPDF 同上，但加一个打开密码。
func tmpEncPDF(t *testing.T, name string, pages int) string {
	t.Helper()
	p := tmpPDF(t, name, pages)
	if _, err := pdfcrypt.Protect(p, pdfcrypt.Options{UserPassword: "secret"}); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestReadPdfDataBinding(t *testing.T) {
	app := &App{}
	p := tmpPDF(t, "read.pdf", 2)

	b64, err := app.ReadPdfData(p)
	if err != nil {
		t.Fatal(err)
	}
	if len(b64) < 100 {
		t.Fatalf("base64 too short: %d", len(b64))
	}
	if _, err := app.ReadPdfData("  "); err == nil {
		t.Fatal("empty path should fail")
	}
	if _, err := app.ReadPdfData(filepath.Join(t.TempDir(), "nope.pdf")); err == nil {
		t.Fatal("missing file should fail")
	}
}

func TestPdfExtractInspectBinding(t *testing.T) {
	app := &App{}
	p := tmpPDF(t, "ins.pdf", 3)

	info := app.PdfExtractInspect(p, "")
	if info.Error != "" || info.Pages != 3 || info.Encrypted || info.NeedsPassword {
		t.Fatalf("%+v", info)
	}
	if info.Name != "ins.pdf" || info.Size == 0 {
		t.Fatalf("%+v", info)
	}

	if got := app.PdfExtractInspect("", ""); got.Error == "" {
		t.Fatal("empty path should carry an error")
	}
	if got := app.PdfExtractInspect(filepath.Join(t.TempDir(), "nope.pdf"), ""); got.Error == "" {
		t.Fatal("missing file should carry an error")
	}
}

func TestPdfExtractInspectEncryptedBinding(t *testing.T) {
	app := &App{}
	p := tmpEncPDF(t, "enc.pdf", 3)

	if got := app.PdfExtractInspect(p, ""); !got.NeedsPassword || got.Pages != 0 {
		t.Fatalf("%+v", got)
	}
	got := app.PdfExtractInspect(p, "secret")
	if got.Error != "" || got.Pages != 3 || !got.Encrypted || got.NeedsPassword {
		t.Fatalf("%+v", got)
	}
}

func TestExtractPdfPagesBinding(t *testing.T) {
	app := &App{}
	p := tmpPDF(t, "src.pdf", 4)
	out := filepath.Join(t.TempDir(), "out.pdf")

	res, err := app.ExtractPdfPages(models.PdfExtractOptions{
		Path:    p,
		Pages:   []int{2, 1},
		OutPath: out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Path != out || len(res.Pages) != 2 || res.Pages[0] != 1 || res.Pages[1] != 2 {
		t.Fatalf("%+v", res)
	}
	if res.Bytes == 0 {
		t.Fatal("empty output")
	}
	if _, err := os.Stat(out); err != nil {
		t.Fatal(err)
	}
}

func TestExtractPdfPagesEncryptedBinding(t *testing.T) {
	app := &App{}
	p := tmpEncPDF(t, "enc.pdf", 3)
	out := filepath.Join(t.TempDir(), "out.pdf")

	if _, err := app.ExtractPdfPages(models.PdfExtractOptions{Path: p, Pages: []int{1}, OutPath: out}); err == nil {
		t.Fatal("missing password should fail")
	}
	res, err := app.ExtractPdfPages(models.PdfExtractOptions{
		Path:     p,
		Password: "secret",
		Pages:    []int{3},
		OutPath:  out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Pages) != 1 || res.Pages[0] != 3 {
		t.Fatalf("%+v", res)
	}
}

func TestExtractPdfPagesGuardsBinding(t *testing.T) {
	app := &App{}
	p := tmpPDF(t, "src.pdf", 2)
	out := filepath.Join(t.TempDir(), "out.pdf")

	cases := []struct {
		name string
		opts models.PdfExtractOptions
		want string
	}{
		{"no file", models.PdfExtractOptions{Pages: []int{1}, OutPath: out}, "请先选择要提取页面的 PDF 文件"},
		{"no pages", models.PdfExtractOptions{Path: p, OutPath: out}, "请先选择要提取的页面"},
		{"no out", models.PdfExtractOptions{Path: p, Pages: []int{1}}, "请选择新 PDF 的保存位置"},
		{"same file", models.PdfExtractOptions{Path: p, Pages: []int{1}, OutPath: p}, "保存位置不能是原文件"},
	}
	for _, c := range cases {
		_, err := app.ExtractPdfPages(c.opts)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("%s: err=%v want %q", c.name, err, c.want)
		}
	}
}
