// Package pdf2epub turns a PDF with a text layer into an EPUB 3 file.
//
// A PDF is a page description format, not a document: it has no paragraphs, no
// headings and no chapters, only glyphs at coordinates. Extraction is therefore
// best effort — the positioned fragments are grouped back into lines,
// paragraphs and headings (see layout.go) and the result is written as one
// XHTML page per PDF page.
//
// Scanned (image only) PDFs contain no text at all. Convert reports ErrNoText
// for them instead of writing an empty book.
package pdf2epub

import (
	"crypto/md5"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
)

// ErrNoText is returned when the PDF holds no extractable text (e.g. a scan).
var ErrNoText = errors.New("pdf has no extractable text")

// minChars is how much text a PDF has to contain to be worth converting.
const minChars = 20

// Options describes one conversion.
type Options struct {
	// SourcePath is the PDF to read (decrypted already if it was protected).
	SourcePath string
	// OutDir is where the EPUB is written; empty means "next to the PDF".
	OutDir string
	// FileName overrides the file name (without extension).
	FileName string
	Title    string
	Author   string
	// Publisher / Description / Language are optional metadata.
	Publisher   string
	Description string
	Language    string
	// Cover holds the bytes of a cover image to embed (optional).
	Cover    []byte
	CoverExt string
	// Progress is called once per page with the pages done, the total page
	// count and the characters collected so far.
	Progress func(done, total, chars int)
}

// Result describes the written file.
type Result struct {
	Path    string
	Pages   int
	Chars   int
	Dropped int // running headers/footers left out
	Bytes   int64
}

// Convert extracts the text of a PDF and writes it as an EPUB file.
func Convert(opts Options) (Result, error) {
	var res Result
	if strings.TrimSpace(opts.SourcePath) == "" {
		return res, errors.New("no pdf file selected")
	}

	pages, chars, dropped, err := extract(opts.SourcePath, opts.Progress)
	if err != nil {
		return res, err
	}
	res.Pages, res.Chars, res.Dropped = len(pages), chars, dropped
	if chars < minChars {
		return res, ErrNoText
	}

	outDir := strings.TrimSpace(opts.OutDir)
	if outDir == "" {
		outDir = filepath.Dir(opts.SourcePath)
	}
	if st, err := os.Stat(outDir); err == nil && !st.IsDir() {
		return res, fmt.Errorf("%s is not a directory", outDir)
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return res, err
	}

	base := opts.FileName
	if strings.TrimSpace(base) == "" {
		base = opts.Title
	}
	if strings.TrimSpace(base) == "" {
		base = strings.TrimSuffix(filepath.Base(opts.SourcePath), filepath.Ext(opts.SourcePath))
	}
	path, err := uniquePath(outDir, sanitizeName(base), ".epub")
	if err != nil {
		return res, err
	}

	doc := &epubDoc{
		ID:          bookID(opts),
		Title:       firstNonEmpty(opts.Title, base, "Untitled"),
		Author:      opts.Author,
		Publisher:   opts.Publisher,
		Description: opts.Description,
		Language:    normalizeLang(opts.Language),
		Cover:       opts.Cover,
		CoverExt:    opts.CoverExt,
		Source:      filepath.Base(opts.SourcePath),
		Modified:    time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		Pages:       pages,
	}
	size, err := writeEPUB(path, doc)
	if err != nil {
		return res, err
	}
	res.Path = path
	res.Bytes = size
	return res, nil
}

// extract reads every page and returns the reconstructed paragraphs plus the
// number of characters and the number of dropped header/footer lines.
func extract(path string, progress func(done, total, chars int)) ([][]Block, int, int, error) {
	f, r, err := pdf.Open(path)
	if err != nil {
		return nil, 0, 0, err
	}
	defer f.Close()

	total := r.NumPage()
	if total <= 0 {
		return nil, 0, 0, ErrNoText
	}

	frags := make([][]pdf.Text, 0, total)
	chars := 0
	for i := 1; i <= total; i++ {
		fr := pageFragments(r, i)
		frags = append(frags, fr)
		for _, t := range fr {
			chars += utf8.RuneCountInString(cleanText(t.S))
		}
		if progress != nil {
			progress(i, total, chars)
		}
	}

	body := bodySize(frags)
	pages := make([][]Block, 0, total)
	lines := make([][]line, 0, total)
	for _, fr := range frags {
		ls := groupLines(fr)
		lines = append(lines, ls)
		pages = append(pages, nil)
	}
	dropped := dropHeaders(lines)

	chars = 0
	for i, ls := range lines {
		blocks := linesToBlocks(ls, body)
		pages[i] = blocks
		for _, b := range blocks {
			chars += utf8.RuneCountInString(b.Text)
		}
	}
	return pages, chars, dropped, nil
}

// pageFragments returns the positioned text of one page. The extraction
// library panics on some broken files; those pages come back empty.
func pageFragments(r *pdf.Reader, num int) (out []pdf.Text) {
	defer func() {
		if rec := recover(); rec != nil {
			out = nil
		}
	}()
	p := r.Page(num)
	if p.V.IsNull() {
		return nil
	}
	return p.Content().Text
}

// bookID derives a stable identifier from the source file.
func bookID(opts Options) string {
	seed := firstNonEmpty(opts.Title, opts.SourcePath) + "|" + opts.SourcePath
	sum := md5.Sum([]byte(seed))
	return fmt.Sprintf("urn:uuid:%x-%x-%x-%x-%x", sum[0:4], sum[4:6], sum[6:8], sum[8:10], sum[10:16])
}

// uniquePath returns a free file name, never overwriting an existing file.
func uniquePath(dir, base, ext string) (string, error) {
	candidate := filepath.Join(dir, base+ext)
	for i := 2; i < 1000; i++ {
		if _, err := os.Stat(candidate); os.IsNotExist(err) {
			return candidate, nil
		}
		candidate = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
	}
	return "", fmt.Errorf("too many files named %s%s in %s", base, ext, dir)
}

// sanitizeName turns a title into something every file system accepts.
func sanitizeName(s string) string {
	var sb strings.Builder
	for _, r := range s {
		switch {
		case r < 0x20:
			sb.WriteRune(' ')
		case strings.ContainsRune(`\/:*?"<>|`, r):
			sb.WriteRune(' ')
		default:
			sb.WriteRune(r)
		}
	}
	name := strings.Join(strings.Fields(sb.String()), " ")
	name = strings.Trim(name, " .")
	if utf8.RuneCountInString(name) > 80 {
		name = string([]rune(name)[:80])
		name = strings.Trim(name, " .")
	}
	if name == "" {
		return "book"
	}
	return name
}

// normalizeLang maps UI locales onto EPUB language codes.
func normalizeLang(lang string) string {
	l := strings.ToLower(strings.TrimSpace(lang))
	switch {
	case l == "":
		return "zh"
	case strings.HasPrefix(l, "zh-hant"), strings.HasPrefix(l, "zh-tw"), strings.HasPrefix(l, "zh-hk"):
		return "zh-Hant"
	case strings.HasPrefix(l, "zh"):
		return "zh"
	}
	if i := strings.IndexAny(l, "-_"); i > 0 {
		return l[:i]
	}
	return l
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
