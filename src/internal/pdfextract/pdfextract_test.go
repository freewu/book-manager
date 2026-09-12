package pdfextract

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ledongthuc/pdf"

	"bookmanager/internal/pdfcrypt"
)

// samplePDF 生成一个 pages 页的最小合法 PDF（每页文字为 p1、p2…，
// 用来验证提取出来的页序）。
func samplePDF(pages int) []byte {
	kids := make([]string, 0, pages)
	objects := []string{
		"", // 1: catalog（下面填）
		"", // 2: pages（下面填）
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", // 3
	}
	for i := 0; i < pages; i++ {
		pageObj := len(objects) + 1
		contentObj := pageObj + 1
		kids = append(kids, fmt.Sprintf("%d 0 R", pageObj))
		stream := fmt.Sprintf("BT /F1 24 Tf 20 100 Td (p%d) Tj ET", i+1)
		objects = append(objects,
			fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents %d 0 R "+
				"/Resources << /Font << /F1 3 0 R >> >> >>", contentObj),
			fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream),
		)
	}
	objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"
	objects[1] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), pages)

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects)+1)
	for i, body := range objects {
		offsets[i+1] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, body)
	}
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objects)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objects); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R /ID [<0102030405060708090a0b0c0d0e0f10> <0102030405060708090a0b0c0d0e0f10>] >>\n",
		len(objects)+1)
	fmt.Fprintf(&buf, "startxref\n%d\n%%%%EOF\n", xref)
	return buf.Bytes()
}

func writePDF(t *testing.T, name string, pages int) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, samplePDF(pages), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

// pageTexts 用 ledongthuc/pdf 读出每一页的文字。
func pageTexts(t *testing.T, path string) []string {
	t.Helper()
	f, r, err := pdf.Open(path)
	if err != nil {
		t.Fatalf("open pdf: %v", err)
	}
	defer f.Close()
	out := make([]string, 0, r.NumPage())
	for i := 1; i <= r.NumPage(); i++ {
		txt, err := r.Page(i).GetPlainText(nil)
		if err != nil {
			t.Fatalf("page %d text: %v", i, err)
		}
		out = append(out, strings.TrimSpace(txt))
	}
	return out
}

func TestInspect(t *testing.T) {
	p := writePDF(t, "a.pdf", 3)
	pages, enc, err := Inspect(p, "")
	if err != nil || pages != 3 || enc {
		t.Fatalf("pages=%d enc=%v err=%v", pages, enc, err)
	}
}

func TestInspectNotPDF(t *testing.T) {
	p := filepath.Join(t.TempDir(), "x.txt")
	_ = os.WriteFile(p, []byte("hello"), 0o644)
	if _, _, err := Inspect(p, ""); !errors.Is(err, ErrNotPDF) {
		t.Fatalf("want ErrNotPDF, got %v", err)
	}
}

func TestInspectEncrypted(t *testing.T) {
	p := writePDF(t, "a.pdf", 2)
	if _, err := pdfcrypt.Protect(p, pdfcrypt.Options{UserPassword: "secret"}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := Inspect(p, ""); !errors.Is(err, pdfcrypt.ErrPasswordRequired) {
		t.Fatalf("want ErrPasswordRequired, got %v", err)
	}
	pages, enc, err := Inspect(p, "secret")
	if err != nil || pages != 2 || !enc {
		t.Fatalf("pages=%d enc=%v err=%v", pages, enc, err)
	}
}

func TestExtractKeepsOrderAscending(t *testing.T) {
	src := writePDF(t, "src.pdf", 5)
	out := filepath.Join(t.TempDir(), "out.pdf")
	res, err := Extract(Options{Path: src, Pages: []int{4, 1, 3, 3, 0}, OutPath: out})
	if err != nil {
		t.Fatal(err)
	}
	want := []int{1, 3, 4}
	if len(res.Pages) != len(want) {
		t.Fatalf("pages=%v", res.Pages)
	}
	for i := range want {
		if res.Pages[i] != want[i] {
			t.Fatalf("pages=%v want %v", res.Pages, want)
		}
	}
	if res.Bytes == 0 {
		t.Fatal("empty output")
	}
	got := pageTexts(t, out)
	if strings.Join(got, ",") != "p1,p3,p4" {
		t.Fatalf("texts=%v", got)
	}
}

func TestExtractSinglePage(t *testing.T) {
	src := writePDF(t, "src.pdf", 4)
	out := filepath.Join(t.TempDir(), "one.pdf")
	if _, err := Extract(Options{Path: src, Pages: []int{2}, OutPath: out}); err != nil {
		t.Fatal(err)
	}
	got := pageTexts(t, out)
	if len(got) != 1 || got[0] != "p2" {
		t.Fatalf("texts=%v", got)
	}
}

func TestExtractEncryptedInput(t *testing.T) {
	src := writePDF(t, "src.pdf", 3)
	if _, err := pdfcrypt.Protect(src, pdfcrypt.Options{UserPassword: "pw"}); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "out.pdf")
	if _, err := Extract(Options{Path: src, Pages: []int{1}, OutPath: out}); !errors.Is(err, pdfcrypt.ErrPasswordRequired) {
		t.Fatalf("want ErrPasswordRequired, got %v", err)
	}
	if _, err := os.Stat(out); err == nil {
		t.Fatal("output should not exist")
	}
	res, err := Extract(Options{Path: src, Password: "pw", Pages: []int{2, 3}, OutPath: out})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Pages) != 2 {
		t.Fatalf("pages=%v", res.Pages)
	}
	got := pageTexts(t, out)
	if strings.Join(got, ",") != "p2,p3" {
		t.Fatalf("texts=%v", got)
	}
	// 提取结果不带密码
	if _, enc, err := Inspect(out, ""); err != nil || enc {
		t.Fatalf("enc=%v err=%v", enc, err)
	}
}

func TestExtractWrongPassword(t *testing.T) {
	src := writePDF(t, "src.pdf", 2)
	if _, err := pdfcrypt.Protect(src, pdfcrypt.Options{UserPassword: "right"}); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "out.pdf")
	if _, err := Extract(Options{Path: src, Password: "wrong", Pages: []int{1}, OutPath: out}); err == nil {
		t.Fatal("want error")
	}
}

func TestExtractGuards(t *testing.T) {
	src := writePDF(t, "src.pdf", 2)
	out := filepath.Join(t.TempDir(), "out.pdf")

	if _, err := Extract(Options{Pages: []int{1}, OutPath: out}); !errors.Is(err, ErrNoInput) {
		t.Fatalf("want ErrNoInput, got %v", err)
	}
	if _, err := Extract(Options{Path: src, OutPath: out}); !errors.Is(err, ErrNoPages) {
		t.Fatalf("want ErrNoPages, got %v", err)
	}
	if _, err := Extract(Options{Path: src, Pages: []int{1}}); !errors.Is(err, ErrNoOutPath) {
		t.Fatalf("want ErrNoOutPath, got %v", err)
	}
	if _, err := Extract(Options{Path: src, Pages: []int{1}, OutPath: src}); !errors.Is(err, ErrSameFile) {
		t.Fatalf("want ErrSameFile, got %v", err)
	}
	if _, err := Extract(Options{Path: src, Pages: []int{9}, OutPath: out}); err == nil {
		t.Fatal("want out-of-range error")
	}
	if _, err := os.Stat(out); err == nil {
		t.Fatal("no output should be written on failure")
	}
}

func TestExtractAllPages(t *testing.T) {
	src := writePDF(t, "src.pdf", 3)
	out := filepath.Join(t.TempDir(), "all.pdf")
	if _, err := Extract(Options{Path: src, Pages: []int{1, 2, 3}, OutPath: out}); err != nil {
		t.Fatal(err)
	}
	if got := pageTexts(t, out); strings.Join(got, ",") != "p1,p2,p3" {
		t.Fatalf("texts=%v", got)
	}
}
