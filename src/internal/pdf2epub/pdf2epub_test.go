package pdf2epub

import (
	"archive/zip"
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"bookmanager/internal/parser"
)

// textPDF builds a two page PDF with a heading, two body lines that belong to
// the same paragraph and a page number at the bottom of every page.
func textPDF() []byte {
	page1 := strings.Join([]string{
		"BT /F1 24 Tf 20 150 Td (Chapter One) Tj ET",
		"BT /F1 12 Tf 20 120 Td (Hello world this is a test paragraph that wraps) Tj ET",
		"BT /F1 12 Tf 20 106 Td (across two lines.) Tj ET",
		"BT /F1 10 Tf 100 20 Td (1) Tj ET",
	}, "\n")
	page2 := strings.Join([]string{
		"BT /F1 24 Tf 20 150 Td (Chapter Two) Tj ET",
		"BT /F1 12 Tf 20 120 Td (The second page has its own text.) Tj ET",
		"BT /F1 10 Tf 100 20 Td (2) Tj ET",
	}, "\n")

	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
		streamObj(page1),
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
		streamObj(page2),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}
	return buildPDF(objects)
}

// emptyPDF builds a single page PDF without any text (a "scan").
func emptyPDF() []byte {
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
		streamObj("0 0 1 rg 0 0 200 200 re f"),
	}
	return buildPDF(objects)
}

func streamObj(content string) string {
	data := content + "\n"
	return fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", len(data), data)
}

func buildPDF(objects []string) []byte {
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
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	return buf.Bytes()
}

func writeFile(t *testing.T, dir, name string, data []byte) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

func convertTextPDF(t *testing.T, opts Options) (Result, *zip.ReadCloser) {
	t.Helper()
	dir := t.TempDir()
	if opts.SourcePath == "" {
		opts.SourcePath = writeFile(t, dir, "source.pdf", textPDF())
	}
	if opts.OutDir == "" {
		opts.OutDir = dir
	}
	if opts.Title == "" {
		opts.Title = "Test Book"
	}
	res, err := Convert(opts)
	if err != nil {
		t.Fatalf("convert: %v", err)
	}
	zr, err := zip.OpenReader(res.Path)
	if err != nil {
		t.Fatalf("open epub: %v", err)
	}
	t.Cleanup(func() { zr.Close() })
	return res, zr
}

func entry(t *testing.T, zr *zip.ReadCloser, name string) string {
	t.Helper()
	for _, f := range zr.File {
		if f.Name != name {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("open %s: %v", name, err)
		}
		defer rc.Close()
		data, err := io.ReadAll(rc)
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		return string(data)
	}
	t.Fatalf("%s missing from epub (have %v)", name, names(zr))
	return ""
}

func names(zr *zip.ReadCloser) []string {
	out := make([]string, 0, len(zr.File))
	for _, f := range zr.File {
		out = append(out, f.Name)
	}
	return out
}

func TestConvertWritesReadableEPUB(t *testing.T) {
	res, zr := convertTextPDF(t, Options{Author: "Tester", Language: "zh-CN"})

	if res.Pages != 2 {
		t.Errorf("pages = %d, want 2", res.Pages)
	}
	if res.Bytes == 0 {
		t.Error("bytes = 0")
	}
	if res.Dropped != 2 {
		t.Errorf("dropped = %d, want 2 page numbers", res.Dropped)
	}
	if res.Chars < 60 {
		t.Errorf("chars = %d, want the extracted text", res.Chars)
	}

	// mimetype has to be the first entry and stored uncompressed.
	if zr.File[0].Name != "mimetype" {
		t.Errorf("first entry = %s, want mimetype", zr.File[0].Name)
	}
	if zr.File[0].Method != zip.Store {
		t.Errorf("mimetype method = %d, want Store", zr.File[0].Method)
	}
	if got := entry(t, zr, "mimetype"); got != "application/epub+zip" {
		t.Errorf("mimetype = %q", got)
	}

	if !strings.Contains(entry(t, zr, "META-INF/container.xml"), "OEBPS/content.opf") {
		t.Error("container.xml does not point at the package file")
	}

	page1 := entry(t, zr, "OEBPS/text/p0001.xhtml")
	if !strings.Contains(page1, `<h2 id="h1">Chapter One</h2>`) {
		t.Errorf("heading missing:\n%s", page1)
	}
	if !strings.Contains(page1, "<p>Hello world this is a test paragraph that wraps across two lines.</p>") {
		t.Errorf("wrapped paragraph not joined:\n%s", page1)
	}
	if strings.Contains(page1, "<p>1</p>") {
		t.Errorf("page number not dropped:\n%s", page1)
	}
	if !strings.Contains(entry(t, zr, "OEBPS/text/p0002.xhtml"), "The second page has its own text.") {
		t.Error("second page text missing")
	}

	opf := entry(t, zr, "OEBPS/content.opf")
	for _, want := range []string{
		`<dc:title>Test Book</dc:title>`,
		"<dc:creator>Tester</dc:creator>",
		"<dc:language>zh</dc:language>",
		`<item id="p0001" href="text/p0001.xhtml"`,
		`<itemref idref="p0002"/>`,
		`properties="nav"`,
	} {
		if !strings.Contains(opf, want) {
			t.Errorf("opf misses %s", want)
		}
	}
	if nav := entry(t, zr, "OEBPS/nav.xhtml"); !strings.Contains(nav, "Chapter One") || !strings.Contains(nav, "Chapter Two") {
		t.Errorf("nav = %s", nav)
	}
	if ncx := entry(t, zr, "OEBPS/toc.ncx"); !strings.Contains(ncx, "Chapter Two") {
		t.Errorf("ncx = %s", ncx)
	}

	// The book has to be readable by the app's own EPUB parser.
	meta, err := parser.Parse(res.Path, "epub")
	if err != nil {
		t.Fatalf("parse generated epub: %v", err)
	}
	if meta.Title != "Test Book" || meta.Author != "Tester" || meta.Language != "zh" {
		t.Errorf("parsed meta = %+v", meta)
	}
}

func TestConvertEmbedsCover(t *testing.T) {
	cover := pngBytes(t)
	res, zr := convertTextPDF(t, Options{Cover: cover, CoverExt: ".png"})

	opf := entry(t, zr, "OEBPS/content.opf")
	if !strings.Contains(opf, `href="images/cover.png" media-type="image/png" properties="cover-image"`) {
		t.Errorf("cover item missing:\n%s", opf)
	}
	if !strings.Contains(opf, `<itemref idref="cover"/>`) || !strings.Contains(opf, `<meta name="cover" content="cover-image"/>`) {
		t.Error("cover not wired into the spine")
	}
	if got := entry(t, zr, "OEBPS/images/cover.png"); len(got) != len(cover) {
		t.Errorf("cover bytes = %d, want %d", len(got), len(cover))
	}

	meta, err := parser.Parse(res.Path, "epub")
	if err != nil {
		t.Fatalf("parse epub: %v", err)
	}
	if !bytes.Equal(meta.Cover, cover) {
		t.Errorf("parser cover = %d bytes, want %d", len(meta.Cover), len(cover))
	}
	if meta.CoverExt != ".png" && meta.CoverExt != "png" {
		t.Errorf("cover ext = %q", meta.CoverExt)
	}
}

func TestConvertNoText(t *testing.T) {
	dir := t.TempDir()
	src := writeFile(t, dir, "scan.pdf", emptyPDF())
	if _, err := Convert(Options{SourcePath: src, OutDir: dir, Title: "Scan"}); err != ErrNoText {
		t.Fatalf("err = %v, want ErrNoText", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "Scan.epub")); !os.IsNotExist(err) {
		t.Error("an empty epub was written for a text-less pdf")
	}
}

func TestConvertDefaultsOutDirAndName(t *testing.T) {
	dir := t.TempDir()
	src := writeFile(t, dir, "my book.pdf", textPDF())
	res, err := Convert(Options{SourcePath: src, Title: "My:Book?"})
	if err != nil {
		t.Fatalf("convert: %v", err)
	}
	if want := filepath.Join(dir, "My Book.epub"); res.Path != want {
		t.Errorf("path = %s, want %s", res.Path, want)
	}

	// A second run must not overwrite the first file.
	res2, err := Convert(Options{SourcePath: src, Title: "My:Book?"})
	if err != nil {
		t.Fatalf("second convert: %v", err)
	}
	if want := filepath.Join(dir, "My Book (2).epub"); res2.Path != want {
		t.Errorf("path = %s, want %s", res2.Path, want)
	}
}

func TestConvertProgress(t *testing.T) {
	var done, total, chars int
	calls := 0
	_, _ = convertTextPDF(t, Options{Progress: func(d, tt, c int) {
		done, total, chars, calls = d, tt, c, calls+1
	}})
	if calls != 2 || done != 2 || total != 2 || chars == 0 {
		t.Errorf("progress = calls %d, done %d, total %d, chars %d", calls, done, total, chars)
	}
}

func pngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 32, 32))
	for y := 0; y < 32; y++ {
		for x := 0; x < 32; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 8), G: uint8(y * 8), B: 0x80, A: 0xff})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	return buf.Bytes()
}
