package pdf2epub

import (
	"archive/zip"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// epubDoc is everything needed to write one EPUB file.
type epubDoc struct {
	ID          string
	Title       string
	Author      string
	Publisher   string
	Description string
	Language    string
	Source      string
	Modified    string
	Cover       []byte
	CoverExt    string
	Pages       [][]Block
}

// navItem is one entry of the generated table of contents.
type navItem struct {
	href  string
	title string
}

// maxNavItems caps the table of contents; beyond that pages are grouped.
const maxNavItems = 1000

// writeEPUB writes the document to path (which must not exist yet). The file is
// assembled next to its destination and renamed into place, so a failure never
// leaves a half written book behind.
func writeEPUB(path string, d *epubDoc) (int64, error) {
	dir := filepath.Dir(path)
	f, err := os.CreateTemp(dir, ".bookmanager-epub-*.part")
	if err != nil {
		return 0, err
	}
	tmp := f.Name()
	defer func() {
		f.Close()
		os.Remove(tmp)
	}()

	zw := zip.NewWriter(f)
	if err := writeEntries(zw, d); err != nil {
		zw.Close()
		return 0, err
	}
	if err := zw.Close(); err != nil {
		return 0, err
	}
	if err := f.Close(); err != nil {
		return 0, err
	}
	if err := os.Rename(tmp, path); err != nil {
		return 0, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return st.Size(), nil
}

func writeEntries(zw *zip.Writer, d *epubDoc) error {
	// The mimetype has to be the first entry and must not be compressed.
	hdr := &zip.FileHeader{Name: "mimetype", Method: zip.Store}
	w, err := zw.CreateHeader(hdr)
	if err != nil {
		return err
	}
	if _, err := w.Write([]byte("application/epub+zip")); err != nil {
		return err
	}

	add := func(name, content string) error {
		w, err := zw.Create(name)
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(content))
		return err
	}

	if err := add("META-INF/container.xml", containerXML); err != nil {
		return err
	}

	zh := isZh(d.Language)
	lab := labels(d.Language)
	cover, coverType := coverFile(d.Cover, d.CoverExt)

	// pages (collecting the table of contents on the way)
	nav := make([]navItem, 0, len(d.Pages))
	for i, blocks := range d.Pages {
		href := fmt.Sprintf("text/p%04d.xhtml", i+1)
		title := lab.page(i + 1)
		for j, b := range blocks {
			if b.Heading == 0 {
				continue
			}
			if title == lab.page(i+1) {
				title = b.Text
			}
			nav = append(nav, navItem{href: fmt.Sprintf("%s#h%d", href, j+1), title: b.Text})
		}
		if err := add("OEBPS/"+href, pageXHTML(d, i+1, title, blocks)); err != nil {
			return err
		}
	}
	if len(nav) == 0 || len(nav) > maxNavItems {
		nav = pageNav(len(d.Pages), lab)
	}

	if err := add("OEBPS/style.css", styleCSS); err != nil {
		return err
	}
	if d.Cover != nil {
		w, err := zw.Create("OEBPS/" + cover)
		if err != nil {
			return err
		}
		if _, err := w.Write(d.Cover); err != nil {
			return err
		}
		if err := add("OEBPS/text/cover.xhtml", coverXHTML(d, cover)); err != nil {
			return err
		}
	}
	if err := add("OEBPS/nav.xhtml", navXHTML(d, nav, zh)); err != nil {
		return err
	}
	if err := add("OEBPS/toc.ncx", ncxXML(d, nav)); err != nil {
		return err
	}
	return add("OEBPS/content.opf", opfXML(d, cover, coverType, len(d.Pages)))
}

const containerXML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`

const styleCSS = `body { line-height: 1.7; margin: 0 0.6em; }
h2 { font-size: 1.4em; margin: 1.2em 0 0.6em; }
h3 { font-size: 1.15em; margin: 1em 0 0.5em; }
p { margin: 0 0 0.6em; text-indent: 2em; }
p.blank { text-indent: 0; }
div.cover { margin: 0; padding: 0; text-align: center; }
div.cover img { max-width: 100%; max-height: 100%; }
`

func pageXHTML(d *epubDoc, num int, title string, blocks []Block) string {
	var sb strings.Builder
	sb.WriteString(xmlHead(title, d.Language, "../style.css"))
	sb.WriteString("<body>\n")
	if len(blocks) == 0 {
		sb.WriteString(`<p class="blank"></p>` + "\n")
	}
	for i, b := range blocks {
		switch b.Heading {
		case 2:
			fmt.Fprintf(&sb, `<h2 id="h%d">%s</h2>`+"\n", i+1, esc(b.Text))
		case 3:
			fmt.Fprintf(&sb, `<h3 id="h%d">%s</h3>`+"\n", i+1, esc(b.Text))
		default:
			fmt.Fprintf(&sb, "<p>%s</p>\n", esc(b.Text))
		}
	}
	sb.WriteString("</body>\n</html>\n")
	return sb.String()
}

func coverXHTML(d *epubDoc, cover string) string {
	var sb strings.Builder
	sb.WriteString(xmlHead(labels(d.Language).cover, d.Language, "../style.css"))
	sb.WriteString("<body>\n")
	fmt.Fprintf(&sb, `<div class="cover"><img src="../%s" alt="%s"/></div>`+"\n", esc(cover), esc(labels(d.Language).cover))
	sb.WriteString("</body>\n</html>\n")
	return sb.String()
}

func navXHTML(d *epubDoc, nav []navItem, zh bool) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(`<!DOCTYPE html>` + "\n")
	fmt.Fprintf(&sb, `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="%s" lang="%s">`+"\n", esc(d.Language), esc(d.Language))
	sb.WriteString("<head>\n<meta charset=\"utf-8\"/>\n")
	fmt.Fprintf(&sb, "<title>%s</title>\n", esc(labels(d.Language).contents))
	sb.WriteString("<link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/>\n</head>\n<body>\n")
	sb.WriteString(`<nav epub:type="toc" id="toc">` + "\n")
	fmt.Fprintf(&sb, "<h2>%s</h2>\n<ol>\n", esc(labels(d.Language).contents))
	for _, n := range nav {
		fmt.Fprintf(&sb, `<li><a href="%s">%s</a></li>`+"\n", esc(n.href), esc(n.title))
	}
	sb.WriteString("</ol>\n</nav>\n</body>\n</html>\n")
	return sb.String()
}

func ncxXML(d *epubDoc, nav []navItem) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString(`<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="` + esc(d.Language) + `">` + "\n")
	sb.WriteString("<head>\n")
	fmt.Fprintf(&sb, `<meta name="dtb:uid" content="%s"/>`+"\n", esc(d.ID))
	sb.WriteString("<meta name=\"dtb:depth\" content=\"1\"/>\n")
	sb.WriteString("<meta name=\"dtb:totalPageCount\" content=\"0\"/>\n")
	sb.WriteString("<meta name=\"dtb:maxPageNumber\" content=\"0\"/>\n")
	sb.WriteString("</head>\n")
	fmt.Fprintf(&sb, "<docTitle><text>%s</text></docTitle>\n", esc(d.Title))
	sb.WriteString("<navMap>\n")
	for i, n := range nav {
		fmt.Fprintf(&sb, `<navPoint id="np%d" playOrder="%d"><navLabel><text>%s</text></navLabel><content src="%s"/></navPoint>`+"\n",
			i+1, i+1, esc(n.title), esc(n.href))
	}
	sb.WriteString("</navMap>\n</ncx>\n")
	return sb.String()
}

func opfXML(d *epubDoc, cover, coverType string, pages int) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	fmt.Fprintf(&sb, `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="%s">`+"\n", esc(d.Language))
	sb.WriteString(`<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">` + "\n")
	fmt.Fprintf(&sb, `<dc:identifier id="bookid">%s</dc:identifier>`+"\n", esc(d.ID))
	fmt.Fprintf(&sb, "<dc:title>%s</dc:title>\n", esc(d.Title))
	fmt.Fprintf(&sb, "<dc:language>%s</dc:language>\n", esc(d.Language))
	if d.Author != "" {
		fmt.Fprintf(&sb, "<dc:creator>%s</dc:creator>\n", esc(d.Author))
	}
	if d.Publisher != "" {
		fmt.Fprintf(&sb, "<dc:publisher>%s</dc:publisher>\n", esc(d.Publisher))
	}
	if d.Description != "" {
		fmt.Fprintf(&sb, "<dc:description>%s</dc:description>\n", esc(d.Description))
	}
	if d.Source != "" {
		fmt.Fprintf(&sb, "<dc:source>%s</dc:source>\n", esc(d.Source))
	}
	fmt.Fprintf(&sb, `<meta property="dcterms:modified">%s</meta>`+"\n", esc(d.Modified))
	if cover != "" {
		sb.WriteString(`<meta name="cover" content="cover-image"/>` + "\n")
	}
	sb.WriteString("</metadata>\n<manifest>\n")
	sb.WriteString(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>` + "\n")
	sb.WriteString(`<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>` + "\n")
	sb.WriteString(`<item id="css" href="style.css" media-type="text/css"/>` + "\n")
	if cover != "" {
		fmt.Fprintf(&sb, `<item id="cover-image" href="%s" media-type="%s" properties="cover-image"/>`+"\n", esc(cover), coverType)
		sb.WriteString(`<item id="cover" href="text/cover.xhtml" media-type="application/xhtml+xml"/>` + "\n")
	}
	for i := 1; i <= pages; i++ {
		fmt.Fprintf(&sb, `<item id="p%04d" href="text/p%04d.xhtml" media-type="application/xhtml+xml"/>`+"\n", i, i)
	}
	sb.WriteString("</manifest>\n<spine toc=\"ncx\">\n")
	if cover != "" {
		sb.WriteString(`<itemref idref="cover"/>` + "\n")
	}
	for i := 1; i <= pages; i++ {
		fmt.Fprintf(&sb, `<itemref idref="p%04d"/>`+"\n", i)
	}
	sb.WriteString("</spine>\n")
	if cover != "" {
		sb.WriteString("<guide>\n")
		fmt.Fprintf(&sb, `<reference type="cover" title="Cover" href="text/cover.xhtml"/>`+"\n")
		sb.WriteString("</guide>\n")
	}
	sb.WriteString("</package>\n")
	return sb.String()
}

func xmlHead(title, lang, css string) string {
	var sb strings.Builder
	sb.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	sb.WriteString("<!DOCTYPE html>\n")
	fmt.Fprintf(&sb, `<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="%s" lang="%s">`+"\n", esc(lang), esc(lang))
	sb.WriteString("<head>\n<meta charset=\"utf-8\"/>\n")
	fmt.Fprintf(&sb, "<title>%s</title>\n", esc(title))
	fmt.Fprintf(&sb, `<link rel="stylesheet" type="text/css" href="%s"/>`+"\n", esc(css))
	sb.WriteString("</head>\n")
	return sb.String()
}

// pageNav groups pages when the PDF has no detected headings.
func pageNav(pages int, lab bookLabels) []navItem {
	if pages == 0 {
		return nil
	}
	step := 1
	if pages > 40 {
		step = 20
	}
	nav := make([]navItem, 0, pages/step+1)
	for from := 1; from <= pages; from += step {
		to := from + step - 1
		if to > pages {
			to = pages
		}
		title := lab.page(from)
		if to != from {
			title = lab.pageRange(from, to)
		}
		nav = append(nav, navItem{href: fmt.Sprintf("text/p%04d.xhtml", from), title: title})
	}
	return nav
}

// coverFile maps an image extension onto the EPUB path and media type.
func coverFile(data []byte, ext string) (string, string) {
	if len(data) == 0 {
		return "", ""
	}
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "png":
		return "images/cover.png", "image/png"
	case "gif":
		return "images/cover.gif", "image/gif"
	case "webp":
		return "images/cover.webp", "image/webp"
	case "bmp":
		return "images/cover.bmp", "image/bmp"
	default:
		return "images/cover.jpg", "image/jpeg"
	}
}

// bookLabels holds the few strings the writer needs in the book's language.
type bookLabels struct {
	contents string
	cover    string
	pageFmt  string
	rangeFmt string
}

func labels(lang string) bookLabels {
	if isZh(lang) {
		return bookLabels{contents: "目录", cover: "封面", pageFmt: "第 %d 页", rangeFmt: "第 %d–%d 页"}
	}
	return bookLabels{contents: "Contents", cover: "Cover", pageFmt: "Page %d", rangeFmt: "Pages %d-%d"}
}

func (l bookLabels) page(n int) string         { return fmt.Sprintf(l.pageFmt, n) }
func (l bookLabels) pageRange(a, b int) string { return fmt.Sprintf(l.rangeFmt, a, b) }

func isZh(lang string) bool {
	return strings.HasPrefix(strings.ToLower(lang), "zh")
}

// esc escapes text for XML content and attributes.
func esc(s string) string {
	var sb strings.Builder
	sb.Grow(len(s))
	for _, r := range s {
		switch r {
		case '&':
			sb.WriteString("&amp;")
		case '<':
			sb.WriteString("&lt;")
		case '>':
			sb.WriteString("&gt;")
		case '"':
			sb.WriteString("&quot;")
		case '\'':
			sb.WriteString("&#39;")
		default:
			if r < 0x20 && r != '\t' && r != '\n' && r != '\r' {
				continue
			}
			sb.WriteRune(r)
		}
	}
	return sb.String()
}
