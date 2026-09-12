package epub2pdf

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"path"
	"strconv"
	"strings"
	"unicode"

	"golang.org/x/net/html"
)

// ErrNotEPUB is returned for a file that is not a readable EPUB (no OPF).
var ErrNotEPUB = errors.New("not an epub file")

// ErrNoText is returned when the EPUB holds no readable text.
var ErrNoText = errors.New("epub has no extractable text")

// readEPUB extracts the reading order of an EPUB as plain paragraphs.
// The cover is not handled here: it comes from the library (see the binding).
func readEPUB(filePath string) (bookContent, error) {
	var content bookContent
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return content, ErrNotEPUB
	}
	defer zr.Close()

	opf, err := opfPath(&zr.Reader)
	if err != nil {
		return content, err
	}
	opfData, err := readZipFile(&zr.Reader, opf)
	if err != nil {
		return content, err
	}
	pkg, err := parseOPF(opfData)
	if err != nil {
		return content, err
	}
	content.Title, content.Author, content.Language = pkg.title, pkg.author, pkg.language

	titles := chapterTitles(&zr.Reader, pkg, opf)
	for _, id := range pkg.spine {
		item, ok := pkg.manifest[id]
		if !ok || !isHTMLItem(item) {
			continue
		}
		full := item.fullPath(opf)
		data, err := readZipFile(&zr.Reader, full)
		if err != nil {
			continue
		}
		ch := extractChapter(data)
		if ch.Title == "" {
			ch.Title = firstNonEmpty(titles[baseName(item.Href)], titles[strings.ToLower(item.Href)], titles[full])
		}
		if ch.Title == "" && len(ch.Blocks) == 0 {
			continue
		}
		content.Chapters = append(content.Chapters, ch)
	}
	if len(content.Chapters) == 0 {
		return content, ErrNoText
	}
	return content, nil
}

// ---- OPF ----

type opfItem struct {
	ID        string `xml:"id,attr"`
	Href      string `xml:"href,attr"`
	MediaType string `xml:"media-type,attr"`
	Props     string `xml:"properties,attr"`
}

// fullPath resolves the item href against the directory of the OPF file.
func (it opfItem) fullPath(opf string) string {
	return resolveHref(path.Dir(opf), it.Href)
}

type opfPackage struct {
	title    string
	author   string
	language string
	manifest map[string]opfItem
	spine    []string
	navHref  string
}

type opfXML struct {
	Metadata struct {
		Title    []string `xml:"title"`
		Creator  []string `xml:"creator"`
		Language []string `xml:"language"`
	} `xml:"metadata"`
	Manifest struct {
		Items []opfItem `xml:"item"`
	} `xml:"manifest"`
	Spine struct {
		ItemRefs []struct {
			IDRef string `xml:"idref,attr"`
		} `xml:"itemref"`
	} `xml:"spine"`
}

// parseOPF reads the package document: manifest, spine and dc metadata.
func parseOPF(data []byte) (opfPackage, error) {
	var raw opfXML
	if err := xml.Unmarshal(data, &raw); err != nil {
		return opfPackage{}, ErrNotEPUB
	}
	pkg := opfPackage{manifest: map[string]opfItem{}}
	pkg.title = firstNonEmpty(raw.Metadata.Title...)
	pkg.author = firstNonEmpty(raw.Metadata.Creator...)
	pkg.language = firstNonEmpty(raw.Metadata.Language...)
	for _, it := range raw.Manifest.Items {
		pkg.manifest[it.ID] = it
		if pkg.navHref == "" && strings.Contains(it.Props, "nav") {
			pkg.navHref = it.Href
		}
	}
	for _, ref := range raw.Spine.ItemRefs {
		pkg.spine = append(pkg.spine, ref.IDRef)
	}
	if len(pkg.spine) == 0 {
		return pkg, ErrNotEPUB
	}
	return pkg, nil
}

// opfPath locates the package document via META-INF/container.xml.
func opfPath(zr *zip.Reader) (string, error) {
	data, err := readZipFile(zr, "META-INF/container.xml")
	if err != nil {
		return "", ErrNotEPUB
	}
	var container struct {
		Rootfiles []struct {
			FullPath string `xml:"full-path,attr"`
		} `xml:"rootfiles>rootfile"`
	}
	if err := xml.Unmarshal(data, &container); err != nil {
		return "", ErrNotEPUB
	}
	for _, rf := range container.Rootfiles {
		if p := strings.TrimSpace(rf.FullPath); p != "" {
			return strings.TrimPrefix(p, "/"), nil
		}
	}
	return "", ErrNotEPUB
}

// ---- 目录（nav.xhtml / toc.ncx）----

// chapterTitles maps a document (by href and by basename) onto the title the
// book's own table of contents gives it.
func chapterTitles(zr *zip.Reader, pkg opfPackage, opf string) map[string]string {
	titles := map[string]string{}
	if pkg.navHref != "" {
		if data, err := readZipFile(zr, resolveHref(path.Dir(opf), pkg.navHref)); err == nil {
			collectNavTitles(data, titles)
		}
	}
	for _, it := range pkg.manifest {
		if !strings.Contains(strings.ToLower(it.MediaType), "ncx") {
			continue
		}
		if data, err := readZipFile(zr, it.fullPath(opf)); err == nil {
			collectNCXTitles(data, titles)
		}
		break
	}
	return titles
}

// collectNavTitles walks an EPUB 3 navigation document (a[href] with text).
func collectNavTitles(data []byte, titles map[string]string) {
	z := html.NewTokenizer(bytes.NewReader(data))
	href := ""
	for {
		switch tt := z.Next(); tt {
		case html.ErrorToken:
			return
		case html.StartTagToken, html.SelfClosingTagToken:
			tok := z.Token()
			if strings.ToLower(tok.Data) != "a" {
				continue
			}
			href = attr(tok, "href")
		case html.TextToken:
			if href == "" {
				continue
			}
			if label := tidy(z.Token().Data); label != "" {
				storeTitle(titles, href, label)
			}
		case html.EndTagToken:
			if strings.ToLower(z.Token().Data) == "a" {
				href = ""
			}
		}
	}
}

// collectNCXTitles walks an EPUB 2 toc.ncx.
func collectNCXTitles(data []byte, titles map[string]string) {
	type navPoint struct {
		Label string     `xml:"navLabel>text"`
		Src   string     `xml:"content>src,attr"`
		Inner []navPoint `xml:"navPoint"`
	}
	var ncx struct {
		Points []navPoint `xml:"navMap>navPoint"`
	}
	if err := xml.Unmarshal(data, &ncx); err != nil {
		return
	}
	var walk func(ps []navPoint)
	walk = func(ps []navPoint) {
		for _, p := range ps {
			if label := tidy(p.Label); label != "" {
				storeTitle(titles, p.Src, label)
			}
			walk(p.Inner)
		}
	}
	walk(ncx.Points)
}

// storeTitle remembers a TOC title under both the full href and the basename.
func storeTitle(titles map[string]string, href, label string) {
	href = strings.TrimSpace(href)
	if href == "" {
		return
	}
	key := resolveHref("", href)
	base := baseName(href)
	for _, k := range []string{key, base, strings.ToLower(key), strings.ToLower(base)} {
		if k == "" {
			continue
		}
		if _, ok := titles[k]; !ok {
			titles[k] = label
		}
	}
}

func attr(tok html.Token, name string) string {
	for _, a := range tok.Attr {
		if strings.EqualFold(a.Key, name) {
			return a.Val
		}
	}
	return ""
}

// ---- XHTML → 段落 ----

// blockTag reports whether a tag starts a new paragraph, and whether it is a
// heading.
func blockTag(tag string) (isBlock, isHeading bool) {
	switch tag {
	case "p", "div", "li", "blockquote", "td", "th", "dd", "dt", "section",
		"article", "aside", "figcaption", "pre", "tr", "body":
		return true, false
	case "h1", "h2", "h3", "h4", "h5", "h6":
		return true, true
	}
	return false, false
}

// skipTags are dropped together with their content.
var skipTags = map[string]bool{"script": true, "style": true, "head": true, "title": true, "svg": true, "nav": true}

// extractChapter turns one XHTML document into blocks. The first heading of a
// document becomes the chapter title; later headings stay headings.
func extractChapter(data []byte) chapter {
	var ch chapter
	z := html.NewTokenizer(bytes.NewReader(data))
	var cur strings.Builder
	heading := 0
	skip := 0

	flush := func(isHeading bool) {
		text := tidy(cur.String())
		cur.Reset()
		if text == "" {
			return
		}
		if isHeading {
			// 文档开头的标题 = 章节名（避免正文里再重复一次）
			if ch.Title == "" && len(ch.Blocks) == 0 && len([]rune(text)) <= 60 {
				ch.Title = text
				return
			}
			ch.Blocks = append(ch.Blocks, block{Heading: 2, Text: text})
			return
		}
		ch.Blocks = append(ch.Blocks, block{Heading: 0, Text: text})
	}

	for {
		tt := z.Next()
		if tt == html.ErrorToken {
			flush(heading > 0)
			return ch
		}
		tok := z.Token()
		tag := strings.ToLower(tok.Data)
		switch tt {
		case html.StartTagToken, html.SelfClosingTagToken:
			if skipTags[tag] {
				if tt == html.StartTagToken {
					skip++
				}
				continue
			}
			if tag == "br" {
				cur.WriteByte(' ')
				continue
			}
			if isBlock, isHeading := blockTag(tag); isBlock && tt == html.StartTagToken {
				flush(heading > 0)
				heading = 0
				if isHeading {
					heading = parseHeadingLevel(tag)
				}
			}
		case html.TextToken:
			if skip > 0 {
				continue
			}
			cur.WriteString(tok.Data)
		case html.EndTagToken:
			if skipTags[tag] {
				if skip > 0 {
					skip--
				}
				continue
			}
			if isBlock, _ := blockTag(tag); isBlock {
				flush(heading > 0)
				heading = 0
			}
		}
	}
}

// parseHeadingLevel returns 1..6 for h1..h6.
func parseHeadingLevel(tag string) int {
	n, err := strconv.Atoi(strings.TrimPrefix(tag, "h"))
	if err != nil || n < 1 || n > 6 {
		return 1
	}
	return n
}

// ---- 文本清理 ----

// tidy collapses whitespace and drops the spaces HTML formatting left inside
// CJK text (a wrapped Chinese line must not become two "words").
func tidy(s string) string {
	out := make([]rune, 0, len(s))
	var gap strings.Builder
	for _, r := range s {
		if isBlank(r) {
			if len(out) > 0 {
				gap.WriteRune(r)
			}
			continue
		}
		if gap.Len() > 0 {
			if keepSpace(out[len(out)-1], r, gap.String()) {
				out = append(out, ' ')
			}
			gap.Reset()
		}
		out = append(out, r)
	}
	return strings.TrimSpace(string(out))
}

// keepSpace decides whether a whitespace run is a real word separator or an
// artifact of the HTML source. A line break between two CJK characters is
// line wrapping (drop it), a plain space between them is intentional (keep).
func keepSpace(prev, next rune, gap string) bool {
	// 中文标点旁边不留空格
	if isCJKPunct(prev) || isCJKPunct(next) {
		return false
	}
	if strings.ContainsAny(gap, "\n\r\v\f") {
		return !(isCJK(prev) && isCJK(next))
	}
	return true
}

// isBlank reports whether a rune is whitespace or a byte-order mark / soft
// hyphen that must not reach the PDF.
func isBlank(r rune) bool {
	return unicode.IsSpace(r) || r == '\u00a0' || r == 0xFEFF || r == 0x00AD || r == unicode.ReplacementChar
}

func isCJK(r rune) bool {
	switch {
	case r == 0:
		return false
	case unicode.Is(unicode.Han, r), unicode.Is(unicode.Hiragana, r),
		unicode.Is(unicode.Katakana, r), unicode.Is(unicode.Hangul, r),
		unicode.Is(unicode.Bopomofo, r):
		return true
	case r >= 0x3000 && r <= 0x303F, r >= 0xFF00 && r <= 0xFFEF:
		return true
	}
	return false
}

const cjkOpenPunct = "（〔【《〈“‘「『"
const cjkClosePunct = "）〕】》〉”’」』，。、；：！？…·％℃"

func isCJKOpenPunct(r rune) bool  { return strings.ContainsRune(cjkOpenPunct, r) }
func isCJKClosePunct(r rune) bool { return strings.ContainsRune(cjkClosePunct, r) }
func isCJKPunct(r rune) bool      { return isCJKOpenPunct(r) || isCJKClosePunct(r) }

// ---- helpers ----

// isHTMLItem reports whether a manifest item is a spine document.
func isHTMLItem(it opfItem) bool {
	mt := strings.ToLower(strings.TrimSpace(it.MediaType))
	switch mt {
	case "", "application/xhtml+xml", "text/html", "application/xml", "text/xml":
		ext := strings.ToLower(path.Ext(it.Href))
		return ext == ".html" || ext == ".xhtml" || ext == ".htm"
	}
	return strings.Contains(mt, "html")
}

// readZipFile reads one entry of the archive (by exact name).
func readZipFile(zr *zip.Reader, name string) ([]byte, error) {
	name = strings.TrimPrefix(strings.TrimSpace(name), "/")
	for _, f := range zr.File {
		if f.Name != name {
			continue
		}
		rc, err := f.Open()
		if err != nil {
			return nil, err
		}
		defer rc.Close()
		return io.ReadAll(io.LimitReader(rc, 32<<20))
	}
	return nil, errors.New("not found in epub: " + name)
}

// resolveHref resolves a (possibly relative, percent-escaped) href against a
// base directory inside the archive.
func resolveHref(dir, href string) string {
	href = strings.ReplaceAll(strings.TrimSpace(href), "\\", "/")
	if i := strings.IndexAny(href, "#?"); i >= 0 {
		href = href[:i]
	}
	href = decodeHref(href)
	if strings.HasPrefix(href, "/") {
		return strings.TrimPrefix(href, "/")
	}
	if dir == "" || dir == "." {
		return path.Clean(href)
	}
	return path.Clean(path.Join(dir, href))
}

// decodeHref expands the percent escapes some books use in their hrefs.
func decodeHref(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	var sb strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '%' && i+3 <= len(s) {
			if v, err := strconv.ParseUint(s[i+1:i+3], 16, 8); err == nil {
				sb.WriteByte(byte(v))
				i += 2
				continue
			}
		}
		sb.WriteByte(s[i])
	}
	return sb.String()
}

func baseName(href string) string {
	return path.Base(strings.ReplaceAll(strings.TrimSpace(href), "\\", "/"))
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
