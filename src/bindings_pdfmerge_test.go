package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcrypt"
	"bookmanager/internal/pdfmerge"
)

// writeTestPDF builds a minimal valid pages-page PDF (one text object per page)
// for the merge binding tests.
func writeTestPDF(t *testing.T, path string, pages int) {
	t.Helper()
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"", // pages tree, filled in below
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}
	kids := make([]string, 0, pages)
	for i := 0; i < pages; i++ {
		contentObj := len(objects) + 2
		kids = append(kids, fmt.Sprintf("%d 0 R", len(objects)+1))
		stream := fmt.Sprintf("BT /F1 24 Tf 20 100 Td (page %d) Tj ET", i+1)
		objects = append(objects,
			fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents %d 0 R "+
				"/Resources << /Font << /F1 3 0 R >> >> >>", contentObj),
			fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream),
		)
	}
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

	if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestPdfMergeInspectBinding(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.pdf")
	b := filepath.Join(dir, "b.pdf")
	writeTestPDF(t, a, 2)
	writeTestPDF(t, b, 3)
	locked := filepath.Join(dir, "locked.pdf")
	writeTestPDF(t, locked, 1)
	if _, err := pdfcrypt.Protect(locked, pdfcrypt.Options{UserPassword: "pw"}); err != nil {
		t.Fatalf("protect: %v", err)
	}
	bad := filepath.Join(dir, "bad.pdf")
	if err := os.WriteFile(bad, []byte("not a pdf at all"), 0o644); err != nil {
		t.Fatal(err)
	}

	app := &App{}
	list := app.PdfMergeInspect([]string{a, b, locked, bad}, nil)
	if len(list) != 4 {
		t.Fatalf("len = %d, want 4: %+v", len(list), list)
	}
	if list[0].Pages != 2 || list[1].Pages != 3 {
		t.Errorf("pages = %d/%d, want 2/3", list[0].Pages, list[1].Pages)
	}
	if list[0].Name != "a.pdf" || list[0].Size == 0 || list[0].Error != "" {
		t.Errorf("first = %+v", list[0])
	}
	if !list[2].Encrypted || !list[2].NeedsPassword {
		t.Errorf("encrypted file not flagged: %+v", list[2])
	}
	if list[3].Error == "" {
		t.Errorf("non-pdf file should carry an error: %+v", list[3])
	}

	// 给出密码后不再要求密码，并能读出页数
	list = app.PdfMergeInspect([]string{locked}, map[string]string{locked: "pw"})
	if list[0].NeedsPassword || list[0].Pages != 1 || list[0].Error != "" {
		t.Errorf("with password = %+v", list[0])
	}
}

func TestMergePdfsBinding(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.pdf")
	b := filepath.Join(dir, "b.pdf")
	writeTestPDF(t, a, 2)
	writeTestPDF(t, b, 3)
	out := filepath.Join(dir, "merged.pdf")

	app := &App{}
	res, err := app.MergePdfs(models.PdfMergeOptions{
		Files:     []string{a, b},
		OutPath:   out,
		Bookmarks: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Path != out || res.Files != 2 || res.Pages != 5 || res.Bytes <= 0 {
		t.Errorf("result = %+v", res)
	}
	if _, err := os.Stat(out); err != nil {
		t.Errorf("merged file: %v", err)
	}
	if res.Added {
		t.Error("added = true, want false without add_to_shelf")
	}

	// 合并结果本身是未加密的
	info := pdfmerge.Inspect(out, "")
	if info.Error != "" || info.Pages != 5 || info.Encrypted {
		t.Errorf("inspect merged = %+v", info)
	}
}

// 加密的输入要带密码才能合并。
func TestMergePdfsEncryptedBinding(t *testing.T) {
	dir := t.TempDir()
	plain := filepath.Join(dir, "plain.pdf")
	locked := filepath.Join(dir, "locked.pdf")
	writeTestPDF(t, plain, 1)
	writeTestPDF(t, locked, 2)
	if _, err := pdfcrypt.Protect(locked, pdfcrypt.Options{UserPassword: "pw"}); err != nil {
		t.Fatalf("protect: %v", err)
	}
	out := filepath.Join(dir, "merged.pdf")

	app := &App{}
	if _, err := app.MergePdfs(models.PdfMergeOptions{Files: []string{plain, locked}, OutPath: out}); err == nil {
		t.Error("want an error when the password is missing")
	} else if !strings.Contains(err.Error(), "密码") {
		t.Errorf("error = %v, want a password message", err)
	}

	res, err := app.MergePdfs(models.PdfMergeOptions{
		Files:     []string{plain, locked},
		Passwords: map[string]string{locked: "pw"},
		OutPath:   out,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Pages != 3 {
		t.Errorf("pages = %d, want 3", res.Pages)
	}
}

// 参数不对时报出可读的错误，而不是 pdfcpu 的原始消息。
func TestMergePdfsGuardsBinding(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.pdf")
	writeTestPDF(t, a, 1)
	app := &App{}

	if _, err := app.MergePdfs(models.PdfMergeOptions{OutPath: filepath.Join(dir, "x.pdf")}); err == nil {
		t.Error("want an error without files")
	} else if !strings.Contains(err.Error(), "PDF") {
		t.Errorf("error = %v", err)
	}
	if _, err := app.MergePdfs(models.PdfMergeOptions{Files: []string{a}}); err == nil {
		t.Error("want an error without an output path")
	} else if !strings.Contains(err.Error(), "保存") {
		t.Errorf("error = %v", err)
	}
	if _, err := app.MergePdfs(models.PdfMergeOptions{Files: []string{a}, OutPath: a}); err == nil {
		t.Error("want an error when the output is an input")
	} else if !strings.Contains(err.Error(), "输出文件") {
		t.Errorf("error = %v", err)
	}
	if _, err := app.MergePdfs(models.PdfMergeOptions{}); err == nil {
		t.Error("want an error for empty options")
	}
}

// 没有选文件时也不应该 panic。
func TestMergePdfsNoFile(t *testing.T) {
	app := &App{}
	if _, err := app.MergePdfs(models.PdfMergeOptions{Files: []string{"", "  "}, OutPath: "x.pdf"}); err == nil {
		t.Fatal("want an error when nothing is selected")
	}
}
