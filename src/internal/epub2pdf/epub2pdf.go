// Package epub2pdf turns an EPUB into a PDF with a real text layer.
//
// An EPUB is already structured (spine documents with paragraphs and
// headings), so unlike the reverse direction nothing has to be guessed: the
// XHTML is read into blocks (epub.go) and typeset with an embedded CJK font
// (pdf.go), which keeps the text selectable and searchable in the result.
//
// Scanned/image-only books never reach this package, but a text-less EPUB does:
// Convert reports ErrNoText for it instead of writing an empty booklet.
package epub2pdf

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

// Info describes an EPUB without converting it.
type Info struct {
	Title    string
	Author   string
	Language string
	// Chapters is the number of spine documents that hold text.
	Chapters int
	// Chars is the amount of text that would be typeset.
	Chars int
	// HasCover reports whether the EPUB carries a usable cover image.
	HasCover bool
}

// Inspect reads an EPUB's metadata and size.
func Inspect(filePath string) (Info, error) {
	content, err := readEPUB(filePath)
	if err != nil {
		return Info{}, err
	}
	info := Info{
		Title:    content.Title,
		Author:   content.Author,
		Language: content.Language,
		Chapters: len(content.Chapters),
		HasCover: len(content.Cover) > 100,
	}
	for _, ch := range content.Chapters {
		info.Chars += len([]rune(ch.Title))
		for _, blk := range ch.Blocks {
			info.Chars += len([]rune(blk.Text))
		}
	}
	return info, nil
}

// Options describes one conversion.
type Options struct {
	// SourcePath is the EPUB to read.
	SourcePath string
	// OutDir is where the PDF is written; empty means "next to the EPUB".
	OutDir string
	// FileName overrides the file name (without extension).
	FileName string
	// The metadata below overrides what the EPUB itself declares.
	Title    string
	Author   string
	Language string
	// PageSize is one of pageSizes (A4, A5, B5, 16K, LETTER); "" means A4.
	PageSize string
	// Cover is an optional cover image (JPG/PNG/GIF bytes).
	Cover    []byte
	CoverExt string
	// Progress is called once per chapter with the chapters done, the total
	// chapter count and the characters typeset so far.
	Progress func(done, total, chars int)
}

// Result describes the written file.
type Result struct {
	Path     string
	Pages    int
	Chars    int
	Chapters int
	Bytes    int64
}

// Convert reads an EPUB and writes it as a PDF.
func Convert(opts Options) (Result, error) {
	var res Result
	if strings.TrimSpace(opts.SourcePath) == "" {
		return res, errors.New("no epub file selected")
	}

	content, err := readEPUB(opts.SourcePath)
	if err != nil {
		return res, err
	}
	content.Title = firstNonEmpty(opts.Title, content.Title)
	content.Author = firstNonEmpty(opts.Author, content.Author)
	content.Language = firstNonEmpty(opts.Language, content.Language)
	content.Cover, content.CoverExt = opts.Cover, opts.CoverExt
	res.Chapters = len(content.Chapters)

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

	base := firstNonEmpty(opts.FileName, content.Title,
		strings.TrimSuffix(filepath.Base(opts.SourcePath), filepath.Ext(opts.SourcePath)))
	path, err := uniquePath(outDir, sanitizeName(base), ".pdf")
	if err != nil {
		return res, err
	}
	if content.Title == "" {
		content.Title = base
	}

	// 先写临时文件再改名：中途失败不会留下半个 PDF
	tmp, err := os.CreateTemp(outDir, ".bookmanager-pdf-*.part")
	if err != nil {
		return res, err
	}
	tmpPath := tmp.Name()
	tmp.Close()
	os.Remove(tmpPath)
	defer os.Remove(tmpPath)

	pages, chars, err := writePDF(tmpPath, content, opts.PageSize, opts.Progress)
	if err != nil {
		return res, err
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return res, err
	}
	st, err := os.Stat(path)
	if err != nil {
		return res, err
	}
	res.Path, res.Pages, res.Chars, res.Bytes = path, pages, chars, st.Size()
	return res, nil
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
		name = strings.Trim(string([]rune(name)[:80]), " .")
	}
	if name == "" {
		return "book"
	}
	return name
}
