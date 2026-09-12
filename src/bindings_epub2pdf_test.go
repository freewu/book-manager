package main

import (
	"archive/zip"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"bookmanager/internal/epub2pdf"
	"bookmanager/internal/models"
)

// writeTestEPUB builds a minimal but valid EPUB for the binding tests.
func writeTestEPUB(t *testing.T, path string, chapters map[string]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	zw := zip.NewWriter(f)
	add := func(name, body string) {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	add("mimetype", "application/epub+zip")
	add("META-INF/container.xml", `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
	var items, refs strings.Builder
	i := 0
	for name := range chapters {
		i++
		id := "c" + string(rune('0'+i))
		items.WriteString(`<item id="` + id + `" href="` + name + `" media-type="application/xhtml+xml"/>`)
		refs.WriteString(`<itemref idref="` + id + `"/>`)
	}
	add("OEBPS/content.opf", `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>绑定测试书</dc:title>
    <dc:creator>测试作者</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>`+items.String()+`</manifest>
  <spine>`+refs.String()+`</spine>
</package>`)
	for name, body := range chapters {
		add("OEBPS/"+name, body)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
}

const testXHTML = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head>
<body><h1>第一章 测试</h1><p>这是一段用来验证绑定层的中文正文，转换后应当出现在 PDF 里。</p></body></html>`

func TestEpubInspectBinding(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "book.epub")
	writeTestEPUB(t, src, map[string]string{"c1.xhtml": testXHTML})

	app := &App{}
	info, err := app.EpubInspect(src)
	if err != nil {
		t.Fatal(err)
	}
	if info.Title != "绑定测试书" || info.Author != "测试作者" {
		t.Errorf("metadata = %+v", info)
	}
	if info.Chapters != 1 || info.Chars == 0 {
		t.Errorf("chapters/chars = %d/%d", info.Chapters, info.Chars)
	}
	if info.Name != "book.epub" || info.Size == 0 {
		t.Errorf("name/size = %q/%d", info.Name, info.Size)
	}

	if _, err := app.EpubInspect(filepath.Join(dir, "missing.epub")); err == nil {
		t.Error("missing file: want an error")
	}
}

func TestEpubToPdfBinding(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "book.epub")
	writeTestEPUB(t, src, map[string]string{"c1.xhtml": testXHTML})

	out := filepath.Join(dir, "out")
	app := &App{}
	res, err := app.EpubToPdf(epubToPdfOpts(src, out))
	if err != nil {
		if errors.Is(err, epub2pdf.ErrNoFont) {
			t.Skip("no embeddable font on this machine")
		}
		t.Fatal(err)
	}
	if res.NoText {
		t.Fatalf("no_text = true, want text: %+v", res)
	}
	if res.Pages < 1 || res.Chars == 0 || res.Bytes == 0 || res.Chapters != 1 {
		t.Errorf("result = %+v", res)
	}
	// 文件名留空时优先用书名（与 pdf2epub 一致）
	if filepath.Dir(res.Path) != out || filepath.Base(res.Path) != "绑定测试书.pdf" {
		t.Errorf("path = %s, want %s", res.Path, filepath.Join(out, "绑定测试书.pdf"))
	}
	if _, err := os.Stat(res.Path); err != nil {
		t.Errorf("generated file: %v", err)
	}
	if res.Added {
		t.Error("added = true, want false without add_to_shelf")
	}
}

// 没有正文的 EPUB 是数据而不是错误：no_text=true。
func TestEpubToPdfNoTextBinding(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "empty.epub")
	writeTestEPUB(t, src, map[string]string{
		"c1.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p> </p></body></html>`,
	})
	app := &App{}
	res, err := app.EpubToPdf(epubToPdfOpts(src, ""))
	if err != nil && !errors.Is(err, epub2pdf.ErrNoFont) {
		t.Fatal(err)
	}
	if !res.NoText {
		t.Errorf("no_text = false, want true: %+v", res)
	}
}

// 不是 EPUB 的文件报错（前端直接展示这条消息）。
func TestEpubToPdfNotAnEpub(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "fake.epub")
	if err := os.WriteFile(src, []byte("this is not a zip"), 0o644); err != nil {
		t.Fatal(err)
	}
	app := &App{}
	_, err := app.EpubToPdf(epubToPdfOpts(src, ""))
	if err == nil {
		t.Fatal("want an error")
	}
	if !strings.Contains(err.Error(), "EPUB") {
		t.Errorf("error = %v, want a message about EPUB", err)
	}
}

// 没有选文件时报错，不应该 panic。
func TestEpubToPdfNoFile(t *testing.T) {
	app := &App{}
	if _, err := app.EpubToPdf(epubToPdfOpts("", "")); err == nil {
		t.Fatal("want an error when no file is selected")
	}
}

func epubToPdfOpts(path, outDir string) models.EpubToPdfOptions {
	return models.EpubToPdfOptions{Path: path, OutDir: outDir}
}
