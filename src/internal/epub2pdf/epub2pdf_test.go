package epub2pdf

import (
	"archive/zip"
	"bytes"
	"compress/zlib"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/ledongthuc/pdf"
)

// ---- EPUB builder for the tests ----

type entry struct {
	name  string
	body  string
	store bool
}

const testOPFHead = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>三体</dc:title>
    <dc:creator>刘慈欣</dc:creator>
    <dc:language>zh-CN</dc:language>
  </metadata>
  <manifest>`

const testOPFTail = `</manifest>`

func makeEPUB(t *testing.T, dir string, docs map[string]string, spine []string, nav bool) string {
	t.Helper()
	files := []entry{
		{name: "mimetype", body: "application/epub+zip", store: true},
		{name: "META-INF/container.xml", body: `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`},
	}
	var manifest, refs strings.Builder
	if nav {
		manifest.WriteString(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`)
		files = append(files, entry{name: "OEBPS/nav.xhtml", body: navDoc()})
	}
	for i, name := range spine {
		id := fmt.Sprintf("c%d", i+1)
		manifest.WriteString(fmt.Sprintf(`<item id="%s" href="%s" media-type="application/xhtml+xml"/>`, id, name))
		refs.WriteString(fmt.Sprintf(`<itemref idref="%s"/>`, id))
	}
	files = append(files, entry{name: "OEBPS/content.opf", body: testOPFHead + manifest.String() + testOPFTail +
		"<spine>" + refs.String() + "</spine></package>"})
	for name, body := range docs {
		files = append(files, entry{name: "OEBPS/" + name, body: body})
	}

	path := filepath.Join(dir, "book.epub")
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for _, e := range files {
		w, err := zw.CreateHeader(&zip.FileHeader{Name: e.name, Method: zip.Deflate})
		if e.store {
			w, err = zw.CreateHeader(&zip.FileHeader{Name: e.name, Method: zip.Store})
		}
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(e.body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	return path
}

func navDoc() string {
	return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
  <li><a href="c1.xhtml">第一章 疯狂年代</a></li>
  <li><a href="c2.xhtml">第二章 寂静的春天</a></li>
</ol></nav></body></html>`
}

func xhtmlDoc(title, body string) string {
	return `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>` + title + `</title></head><body>
<h1>` + title + `</h1>
` + body + `
</body></html>`
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// pdfText decodes the text the generated file actually stores: every content
// stream is inflated and the string operands written by the PDF writer are read
// back as the code points of the text (the writer stores UTF-16BE code units
// and its /ToUnicode CMap is an identity mapping, so this is what a reader
// shows).
func pdfText(t *testing.T, path string) string {
	t.Helper()
	data := mustRead(t, path)
	var out strings.Builder
	for i := 0; i < len(data); {
		start := bytes.Index(data[i:], []byte("stream"))
		if start < 0 {
			break
		}
		start += i + len("stream")
		end := bytes.Index(data[start:], []byte("endstream"))
		if end < 0 {
			break
		}
		raw := bytes.TrimLeft(data[start:start+end], "\r\n")
		i = start + end + len("endstream")
		zr, err := zlib.NewReader(bytes.NewReader(raw))
		if err != nil {
			continue
		}
		plain, err := io.ReadAll(zr)
		zr.Close()
		if err != nil || !bytes.Contains(plain, []byte("Tj")) {
			continue
		}
		out.WriteString(decodeContentText(plain))
	}
	return out.String()
}

// decodeContentText reads the string operands of a content stream.
func decodeContentText(stream []byte) string {
	var sb strings.Builder
	for i := 0; i < len(stream); i++ {
		switch stream[i] {
		case '(':
			lit, next := readLiteralString(stream, i)
			sb.WriteString(codePoints(lit))
			i = next - 1
		case '<':
			if i+1 < len(stream) && stream[i+1] == '<' {
				continue
			}
			j := i + 1
			for j < len(stream) && isHexDigit(stream[j]) {
				j++
			}
			if j < len(stream) && stream[j] == '>' {
				sb.WriteString(codePoints(decodeHex(stream[i+1 : j])))
				i = j
			}
		}
	}
	return sb.String()
}

// readLiteralString reads a (...) string with PDF escape sequences.
func readLiteralString(s []byte, start int) ([]byte, int) {
	var out []byte
	depth := 0
	for i := start; i < len(s); i++ {
		switch s[i] {
		case '\\':
			if i+1 < len(s) {
				i++
				out = append(out, unescape(s[i]))
			}
		case '(':
			depth++
			if depth > 1 {
				out = append(out, '(')
			}
		case ')':
			depth--
			if depth == 0 {
				return out, i + 1
			}
			out = append(out, ')')
		default:
			out = append(out, s[i])
		}
	}
	return out, len(s)
}

func unescape(b byte) byte {
	switch b {
	case 'n':
		return '\n'
	case 'r':
		return '\r'
	case 't':
		return '\t'
	case 'b':
		return '\b'
	case 'f':
		return '\f'
	}
	return b
}

func decodeHex(s []byte) []byte {
	out := make([]byte, 0, len(s)/2)
	for i := 0; i+2 <= len(s); i += 2 {
		v, err := strconv.ParseUint(string(s[i:i+2]), 16, 8)
		if err != nil {
			return out
		}
		out = append(out, byte(v))
	}
	return out
}

// codePoints turns the UTF-16BE code units of a string operand into runes.
func codePoints(b []byte) string {
	var sb strings.Builder
	for i := 0; i+2 <= len(b); i += 2 {
		sb.WriteRune(rune(b[i])<<8 | rune(b[i+1]))
	}
	return sb.String()
}

func isHexDigit(b byte) bool {
	return b >= '0' && b <= '9' || b >= 'a' && b <= 'f' || b >= 'A' && b <= 'F'
}

// readPDFText extracts the text of a generated file with the pure Go reader
// (it handles the latin subset of the text reliably).
func readPDFText(t *testing.T, path string) string {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	r, err := pdf.NewReader(f, mustStat(t, f))
	if err != nil {
		t.Fatal(err)
	}
	var sb strings.Builder
	for i := 1; i <= r.NumPage(); i++ {
		txt, err := r.Page(i).GetPlainText(nil)
		if err != nil {
			continue
		}
		sb.WriteString(txt)
	}
	return sb.String()
}

func mustStat(t *testing.T, f *os.File) int64 {
	t.Helper()
	st, err := f.Stat()
	if err != nil {
		t.Fatal(err)
	}
	return st.Size()
}

// ---- tests ----

func TestConvertWritesReadablePDF(t *testing.T) {
	dir := t.TempDir()
	src := makeEPUB(t, dir, map[string]string{
		"c1.xhtml": xhtmlDoc("Chapter One", "<p>Hello world. This is the first chapter.</p><p>Second paragraph.</p>"),
		"c2.xhtml": xhtmlDoc("Chapter Two", "<p>The end.</p>"),
	}, []string{"c1.xhtml", "c2.xhtml"}, true)

	res, err := Convert(Options{SourcePath: src})
	if err != nil {
		t.Fatal(err)
	}
	if res.Pages < 2 {
		t.Errorf("pages = %d, want >= 2", res.Pages)
	}
	if res.Chars < 60 {
		t.Errorf("chars = %d, want >= 60", res.Chars)
	}
	if res.Chapters != 2 {
		t.Errorf("chapters = %d, want 2", res.Chapters)
	}
	if res.Bytes < 1000 {
		t.Errorf("bytes = %d, too small", res.Bytes)
	}
	if filepath.Base(res.Path) != "三体.pdf" {
		t.Errorf("path = %s, want 三体.pdf (title is the default name)", res.Path)
	}
	// 字体是子集化的：不该把 16MB 的等线体整个塞进去
	if res.Bytes > 4<<20 {
		t.Errorf("bytes = %d, font subsetting looks broken", res.Bytes)
	}
	text := pdfText(t, res.Path)
	for _, want := range []string{"Hello world. This is the first chapter.", "Second paragraph.", "The end."} {
		if !strings.Contains(text, want) {
			t.Errorf("generated PDF does not contain %q", want)
		}
	}
	// 真实阅读器（纯 Go，无 ToUnicode 依赖）也要能读出英文正文
	if read := readPDFText(t, res.Path); !strings.Contains(read, "Second paragraph.") {
		t.Errorf("pure Go reader extracted %q", read)
	}
}

func TestConvertCJKTextKeepsReadingOrder(t *testing.T) {
	dir := t.TempDir()
	src := makeEPUB(t, dir, map[string]string{
		"c1.xhtml": xhtmlDoc("第一章 疯狂年代", `<p>这是第一行
    第二行，中文换行不应该变成空格。</p><p>Mixed English and 中文 混排。</p>`),
	}, []string{"c1.xhtml"}, true)

	res, err := Convert(Options{SourcePath: src, OutDir: dir, FileName: "cjk"})
	if err != nil {
		t.Fatal(err)
	}
	// 封面页 + 正文页
	if res.Pages != 2 {
		t.Errorf("pages = %d, want 2", res.Pages)
	}
	text := pdfText(t, res.Path)
	for _, want := range []string{"第一章 疯狂年代", "这是第一行第二行，中文换行不应该变成空格。", "Mixed English and 中文 混排。"} {
		if !strings.Contains(text, want) {
			t.Errorf("generated PDF does not contain %q (got %q)", want, text)
		}
	}
}

func TestConvertUsesTOCForChapterTitles(t *testing.T) {
	dir := t.TempDir()
	src := makeEPUB(t, dir, map[string]string{
		"c1.xhtml": `<html><body><p>没有标题的正文。</p></body></html>`,
	}, []string{"c1.xhtml"}, true)

	content, err := readEPUB(src)
	if err != nil {
		t.Fatal(err)
	}
	if len(content.Chapters) != 1 {
		t.Fatalf("chapters = %d, want 1", len(content.Chapters))
	}
	if content.Chapters[0].Title != "第一章 疯狂年代" {
		t.Errorf("title = %q, want the nav.xhtml label", content.Chapters[0].Title)
	}
	if content.Title != "三体" || content.Author != "刘慈欣" || content.Language != "zh-CN" {
		t.Errorf("metadata = %q/%q/%q", content.Title, content.Author, content.Language)
	}
}

func TestExtractChapterSplitsBlocksAndHeadings(t *testing.T) {
	data := []byte(`<html><head><title>x</title></head><body>
<nav><a href="a.xhtml">目录</a></nav>
<h1>第一章</h1>
<p>第一段。</p>
<h2>1.1 小节</h2>
<p>第二段<br/>换行之后。</p>
<div>第三段。</div>
<script>var x = 1;</script>
<p>   </p>
</body></html>`)
	ch := extractChapter(data)
	if ch.Title != "第一章" {
		t.Errorf("title = %q, want 第一章", ch.Title)
	}
	want := []block{
		{Heading: 0, Text: "第一段。"},
		{Heading: 2, Text: "1.1 小节"},
		{Heading: 0, Text: "第二段 换行之后。"},
		{Heading: 0, Text: "第三段。"},
	}
	if len(ch.Blocks) != len(want) {
		t.Fatalf("blocks = %+v, want %+v", ch.Blocks, want)
	}
	for i, b := range ch.Blocks {
		if b != want[i] {
			t.Errorf("block %d = %+v, want %+v", i, b, want[i])
		}
	}
	if len(ch.Blocks) > 0 && strings.Contains(ch.Blocks[0].Text, "目录") {
		t.Error("nav content leaked into the body")
	}
}

func TestTidyKeepsLatinSpacesDropsCJKWrapping(t *testing.T) {
	cases := map[string]string{
		"这是第一行\n   第二行":  "这是第一行第二行",
		"Python 是一门语言":   "Python 是一门语言",
		"世界 hello world": "世界 hello world",
		"中文，\n 继续":       "中文，继续",
		"（ 全角括号 ）":       "（全角括号）",
		"第一章 疯狂年代":       "第一章 疯狂年代",
		"第一章\n  疯狂年代":    "第一章疯狂年代",
		"a\n\nb":         "a b",
		"\uFEFF 开头":      "开头",
	}
	for in, want := range cases {
		if got := tidy(in); got != want {
			t.Errorf("tidy(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestConvertNoText(t *testing.T) {
	dir := t.TempDir()
	src := makeEPUB(t, dir, map[string]string{
		"c1.xhtml": `<html><body></body></html>`,
	}, []string{"c1.xhtml"}, false)
	if _, err := Convert(Options{SourcePath: src}); err != ErrNoText {
		t.Fatalf("err = %v, want ErrNoText", err)
	}
}

func TestConvertNotEPUB(t *testing.T) {
	dir := t.TempDir()
	bad := filepath.Join(dir, "not-an-epub.epub")
	if err := os.WriteFile(bad, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Convert(Options{SourcePath: bad}); err != ErrNotEPUB {
		t.Fatalf("err = %v, want ErrNotEPUB", err)
	}
	if _, err := Convert(Options{}); err == nil {
		t.Fatal("empty options: want an error")
	}
}

func TestConvertDefaultsOutDirAndName(t *testing.T) {
	dir := t.TempDir()
	src := makeEPUB(t, dir, map[string]string{
		"c1.xhtml": xhtmlDoc("Title", "<p>Body text here.</p>"),
	}, []string{"c1.xhtml"}, false)
	res, err := Convert(Options{SourcePath: src, Title: "My Book"})
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(res.Path) != dir {
		t.Errorf("dir = %s, want %s", filepath.Dir(res.Path), dir)
	}
	if filepath.Base(res.Path) != "My Book.pdf" {
		t.Errorf("name = %s, want My Book.pdf", filepath.Base(res.Path))
	}
	// 同名文件不覆盖
	res2, err := Convert(Options{SourcePath: src, Title: "My Book"})
	if err != nil {
		t.Fatal(err)
	}
	if res2.Path == res.Path || !strings.Contains(filepath.Base(res2.Path), "(2)") {
		t.Errorf("second run wrote %s, want a (2) suffix", res2.Path)
	}
}

func TestConvertProgress(t *testing.T) {
	dir := t.TempDir()
	src := makeEPUB(t, dir, map[string]string{
		"c1.xhtml": xhtmlDoc("One", "<p>First chapter text.</p>"),
		"c2.xhtml": xhtmlDoc("Two", "<p>Second chapter text.</p>"),
		"c3.xhtml": xhtmlDoc("Three", "<p>Third chapter text.</p>"),
	}, []string{"c1.xhtml", "c2.xhtml", "c3.xhtml"}, false)

	var done, totals []int
	if _, err := Convert(Options{SourcePath: src, Progress: func(d, tot, chars int) {
		done = append(done, d)
		totals = append(totals, tot)
	}}); err != nil {
		t.Fatal(err)
	}
	if len(done) != 3 {
		t.Fatalf("progress calls = %v, want 3", done)
	}
	for i, d := range done {
		if d != i+1 || totals[i] != 3 {
			t.Errorf("progress %d = %d/%d, want %d/3", i, d, totals[i], i+1)
		}
	}
}

func TestInspectCountsChaptersAndChars(t *testing.T) {
	dir := t.TempDir()
	src := makeEPUB(t, dir, map[string]string{
		"c1.xhtml": xhtmlDoc("One", "<p>第一章正文。</p>"),
		"c2.xhtml": xhtmlDoc("Two", "<p>Second chapter text.</p>"),
	}, []string{"c1.xhtml", "c2.xhtml"}, true)
	info, err := Inspect(src)
	if err != nil {
		t.Fatal(err)
	}
	if info.Title != "三体" || info.Author != "刘慈欣" || info.Language != "zh-CN" {
		t.Errorf("metadata = %+v", info)
	}
	if info.Chapters != 2 {
		t.Errorf("chapters = %d, want 2", info.Chapters)
	}
	want := len([]rune("One")) + len([]rune("第一章正文。")) + len([]rune("Two")) + len([]rune("Second chapter text."))
	if info.Chars != want {
		t.Errorf("chars = %d, want %d", info.Chars, want)
	}
	// makeEPUB 不带封面图片
	if info.HasCover {
		t.Error("HasCover = true, want false")
	}
	if _, err := Inspect(filepath.Join(dir, "nope.epub")); err == nil {
		t.Error("missing file: want an error")
	}
}

func TestPageDimension(t *testing.T) {
	if dim := pageDimension("a5"); dim.w != 148 || dim.h != 210 {
		t.Errorf("A5 = %v", dim)
	}
	if dim := pageDimension(""); dim.w != 210 {
		t.Errorf("default = %v, want A4", dim)
	}
}

func TestSanitizeName(t *testing.T) {
	cases := map[string]string{
		"a/b:c*d": "a b c d",
		"  ..  ":  "book",
		"三体":      "三体",
	}
	for in, want := range cases {
		if got := sanitizeName(in); got != want {
			t.Errorf("sanitizeName(%q) = %q, want %q", in, got, want)
		}
	}
	if got := sanitizeName(strings.Repeat("字", 200)); len([]rune(got)) != 80 {
		t.Errorf("long name = %d runes, want 80", len([]rune(got)))
	}
}

func TestImageKind(t *testing.T) {
	if got := imageKind([]byte{0xFF, 0xD8, 0xFF, 0xE0}, ""); got != "JPG" {
		t.Errorf("jpeg magic = %q", got)
	}
	if got := imageKind([]byte{0x89, 'P', 'N', 'G', 0x0D}, ""); got != "PNG" {
		t.Errorf("png magic = %q", got)
	}
	if got := imageKind([]byte("xxxx"), "cover.webp"); got != "" {
		t.Errorf("webp = %q, want empty", got)
	}
}
