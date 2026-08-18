package parser

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"bookmanager/internal/models"
)

func makeEpub(t *testing.T, dir string) string {
	t.Helper()
	path := filepath.Join(dir, "test-book.epub")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)

	container := `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
	w, _ := zw.Create("META-INF/container.xml")
	w.Write([]byte(container))

	opf := `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>测试书籍标题</dc:title>
    <dc:creator>张三</dc:creator>
    <dc:publisher>人民出版社</dc:publisher>
    <dc:language>zh</dc:language>
    <dc:description>这是一本用于测试的电子书。</dc:description>
    <meta name="cover" content="cover-img"/>
  </metadata>
  <manifest>
    <item id="cover-img" href="images/cover.jpg" media-type="image/jpeg"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`
	w, _ = zw.Create("OEBPS/content.opf")
	w.Write([]byte(opf))

	// a tiny 1x1 JPEG padded to look like a real cover
	jpg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00}, bytes.Repeat([]byte{0x00}, 256)...)
	jpg = append(jpg, 0xFF, 0xD9)
	w, _ = zw.Create("OEBPS/images/cover.jpg")
	w.Write(jpg)

	w, _ = zw.Create("OEBPS/text/ch1.xhtml")
	w.Write([]byte(`<html xmlns="http://www.w3.org/1999/xhtml"><head/><body><h1>第一章</h1><p>测试内容</p></body></html>`))

	zw.Close()
	f.Close()
	return path
}

func TestParseEPUB(t *testing.T) {
	dir := t.TempDir()
	path := makeEpub(t, dir)
	meta := &models.BookMeta{}
	if err := ParseEPUB(path, meta); err != nil {
		t.Fatalf("parse epub: %v", err)
	}
	if meta.Title != "测试书籍标题" {
		t.Errorf("title = %q, want 测试书籍标题", meta.Title)
	}
	if meta.Author != "张三" {
		t.Errorf("author = %q, want 张三", meta.Author)
	}
	if meta.Publisher != "人民出版社" {
		t.Errorf("publisher = %q", meta.Publisher)
	}
	if meta.Language != "zh" {
		t.Errorf("language = %q", meta.Language)
	}
	if len(meta.Cover) == 0 || meta.CoverExt != ".jpg" {
		t.Errorf("cover not extracted: len=%d ext=%q", len(meta.Cover), meta.CoverExt)
	}
}

func TestParsePDF(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.pdf")
	content := []byte(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 5 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
4 0 obj
<< /Title (Hello World) /Author (Jane Doe) /Subject (A test) >>
endobj
trailer
<< /Info 4 0 R >>
%%EOF`)
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}
	meta := &models.BookMeta{}
	if err := ParsePDF(path, meta); err != nil {
		t.Fatalf("parse pdf: %v", err)
	}
	if meta.Title != "Hello World" {
		t.Errorf("title = %q", meta.Title)
	}
	if meta.Author != "Jane Doe" {
		t.Errorf("author = %q", meta.Author)
	}
	if meta.Pages == 0 {
		t.Errorf("pages not detected")
	}
}
