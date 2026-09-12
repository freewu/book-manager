package epub2pdf

import (
	"bytes"
	"math"
	"strconv"
	"strings"

	"github.com/phpdave11/gofpdf"
)

// bookFontFamily is the name the embedded font is registered under.
const bookFontFamily = "book"

// pageSizes are the paper sizes the wizard offers (mm).
var pageSizes = map[string]struct{ w, h float64 }{
	"A4":     {210, 297},
	"A5":     {148, 210},
	"B5":     {176, 250},
	"16K":    {184, 260},
	"LETTER": {215.9, 279.4},
}

// 排版参数（mm / pt）
const (
	titleSize    = 20.0
	authorSize   = 12.0
	h1Size       = 15.0
	h2Size       = 13.0
	h3Size       = 11.5
	bodySize     = 10.5
	lineHeight   = 5.2
	paraGap      = 1.5
	headingGap   = 3.0
	marginSide   = 20.0
	marginTop    = 18.0
	marginBottom = 18.0
	footerSize   = 8.0
	// 封面图最大尺寸（mm）
	coverMaxWidth  = 90.0
	coverMaxHeight = 130.0
)

// bookContent is what the PDF writer needs from an EPUB.
type bookContent struct {
	Title    string
	Author   string
	Language string
	// Cover is an optional cover image (JPG/PNG/GIF bytes).
	Cover    []byte
	CoverExt string
	// Chapters in spine order.
	Chapters []chapter
}

// chapter is one spine document.
type chapter struct {
	Title  string
	Blocks []block
}

// block is one paragraph (Heading 0) or a heading (1..3) inside a chapter.
type block struct {
	Heading int
	Text    string
}

// writePDF renders the content to path, reporting progress after each chapter.
// It returns the page count of the generated file and the number of characters
// that were typeset.
func writePDF(path string, content bookContent, size string, progress func(done, total, chars int)) (pages, chars int, err error) {
	dim := pageDimension(size)

	// 字体按整本书的文字挑选（中文书必须有中文字体才排得出来）
	var sb strings.Builder
	for _, ch := range content.Chapters {
		sb.WriteString(ch.Title)
		sb.WriteByte('\n')
		for _, blk := range ch.Blocks {
			sb.WriteString(blk.Text)
			sb.WriteByte('\n')
		}
	}
	font, err := pickFont(sb.String())
	if err != nil {
		return 0, 0, err
	}

	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(marginSide, marginTop, marginSide)
	pdf.SetAutoPageBreak(true, marginBottom)
	pdf.SetTitle(content.Title, true)
	if content.Author != "" {
		pdf.SetAuthor(content.Author, true)
	}
	pdf.SetCreator("book-manager", true)
	pdf.AddUTF8FontFromBytes(bookFontFamily, "", font.data)
	if !pdf.Ok() {
		return 0, 0, ErrNoFont
	}

	addPage := func() {
		pdf.AddPageFormat("P", gofpdf.SizeType{Wd: dim.w, Ht: dim.h})
	}
	contentWidth := dim.w - marginSide*2

	// write emits a block of text, breaking the lines here: gofpdf's MultiCell
	// drops a character on every CJK line break (see text.go).
	write := func(text string, size, lineHeight float64, align string) {
		pdf.SetFont(bookFontFamily, "", size)
		for _, ln := range newLineBreaker(pdf, contentWidth).wrap(text) {
			pdf.CellFormat(contentWidth, lineHeight, ln, "", 2, align, false, 0, "")
		}
	}

	// ---- 封面页 ----
	coverKind := registerCover(pdf, content)
	title := strings.TrimSpace(content.Title)
	hasCoverPage := coverKind != "" || title != ""
	if hasCoverPage {
		addPage()
		if title != "" {
			pdf.Ln(14)
			write(title, titleSize, titleSize*0.5, "C")
			if content.Author != "" {
				pdf.Ln(3)
				write(content.Author, authorSize, 6, "C")
			} else {
				pdf.Ln(3)
			}
		}
		drawCover(pdf, dim, coverKind)
	}

	// 页脚页码（封面页不显示）
	pdf.AliasNbPages("{nb}")
	pdf.SetFooterFunc(func() {
		if hasCoverPage && pdf.PageNo() == 1 {
			return
		}
		pdf.SetY(-12)
		pdf.SetFont(bookFontFamily, "", footerSize)
		pdf.SetTextColor(130, 130, 130)
		pdf.CellFormat(0, 5, "- "+strconv.Itoa(pdf.PageNo())+" / {nb} -", "", 0, "C", false, 0, "")
		pdf.SetTextColor(0, 0, 0)
	})

	// ---- 正文 ----
	total := len(content.Chapters)
	for i, ch := range content.Chapters {
		addPage()
		if ch.Title != "" {
			write(ch.Title, h1Size, h1Size*0.5, "L")
			pdf.Ln(headingGap)
			pdf.Bookmark(ch.Title, 0, 0)
		}
		for _, blk := range ch.Blocks {
			switch {
			case blk.Heading == 2:
				pdf.Ln(headingGap)
				write(blk.Text, h2Size, h2Size*0.5, "L")
				pdf.Ln(paraGap)
				pdf.Bookmark(blk.Text, 1, 0)
			case blk.Heading >= 3:
				pdf.Ln(paraGap)
				write(blk.Text, h3Size, h3Size*0.5, "L")
				pdf.Ln(paraGap)
			default:
				write(blk.Text, bodySize, lineHeight, "L")
				pdf.Ln(paraGap)
			}
			chars += len([]rune(blk.Text))
		}
		if progress != nil {
			progress(i+1, total, chars)
		}
	}

	if err := pdf.OutputFileAndClose(path); err != nil {
		return 0, chars, err
	}
	return pdf.PageCount(), chars, nil
}

// pageDimension returns the requested paper size, falling back to A4.
func pageDimension(size string) struct{ w, h float64 } {
	if dim, ok := pageSizes[strings.ToUpper(strings.TrimSpace(size))]; ok {
		return dim
	}
	return pageSizes["A4"]
}

// registerCover registers the cover image with the document. It returns the
// image type ("JPG"/"PNG"/"GIF") or "" when there is no usable cover.
func registerCover(pdf *gofpdf.Fpdf, content bookContent) string {
	if len(content.Cover) < 100 {
		return ""
	}
	kind := imageKind(content.Cover, content.CoverExt)
	if kind == "" {
		return ""
	}
	info := pdf.RegisterImageOptionsReader("cover", gofpdf.ImageOptions{ImageType: kind}, bytes.NewReader(content.Cover))
	if info == nil || info.Width() <= 0 || info.Height() <= 0 {
		// 坏图不该毁掉整本书：撤掉错误，正文照排
		pdf.ClearError()
		return ""
	}
	return kind
}

// drawCover draws the registered cover centred in the space left on the page.
func drawCover(pdf *gofpdf.Fpdf, dim struct{ w, h float64 }, kind string) {
	if kind == "" {
		return
	}
	info := pdf.GetImageInfo("cover")
	if info == nil || info.Width() <= 0 {
		return
	}
	top := pdf.GetY() + 10
	if top < marginTop {
		top = marginTop
	}
	availW := math.Min(dim.w-2*marginSide, coverMaxWidth)
	availH := math.Min(dim.h-top-marginBottom, coverMaxHeight)
	if availW <= 0 || availH <= 0 {
		return
	}
	scale := math.Min(availW/info.Width(), availH/info.Height())
	w, h := info.Width()*scale, info.Height()*scale
	x := (dim.w - w) / 2
	y := top + (availH-h)/2
	pdf.ImageOptions("cover", x, y, w, h, false, gofpdf.ImageOptions{ImageType: kind}, 0, "")
}

// imageKind guesses the image type from the magic bytes, then from the file
// extension. It returns "" for formats the PDF writer cannot embed.
func imageKind(data []byte, ext string) string {
	switch {
	case bytes.HasPrefix(data, []byte{0xFF, 0xD8, 0xFF}):
		return "JPG"
	case bytes.HasPrefix(data, []byte{0x89, 'P', 'N', 'G'}):
		return "PNG"
	case bytes.HasPrefix(data, []byte("GIF8")):
		return "GIF"
	}
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "jpg", "jpeg":
		return "JPG"
	case "png":
		return "PNG"
	case "gif":
		return "GIF"
	}
	return ""
}
