package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/models"
	"bookmanager/internal/parser"
	"bookmanager/internal/pdf2epub"
	"bookmanager/internal/pdfcrypt"
	"bookmanager/internal/scanner"
)

// PDF → EPUB 工具的后端绑定（前端 src/frontend/src/tools/pdf-epub/）。
//
// 流程：PickOutDir 选目录 → ConvertPdfToEpub 转换（pdf2epub:progress 事件回报进度）。
// 加密的 PDF 先用密码解密到临时文件再抽取文字；扫描版（无文字层）返回 no_text=true。

// PickOutDir opens a native folder picker for the output of a converted book.
func (a *App) PickOutDir(defaultDir string) (string, error) {
	opts := wailsRuntime.OpenDialogOptions{Title: "选择保存目录"}
	if d := strings.TrimSpace(defaultDir); d != "" {
		if st, err := os.Stat(d); err == nil && st.IsDir() {
			opts.DefaultDirectory = d
		}
	}
	dir, err := wailsRuntime.OpenDirectoryDialog(a.ctx, opts)
	if err != nil {
		if err.Error() == "cancelled" || err.Error() == "dialog cancelled" {
			return "", nil
		}
		return "", err
	}
	return dir, nil
}

// ConvertPdfToEpub converts a PDF into an EPUB. A PDF that needs a password or
// that has no text layer is not an error: the result carries needs_password /
// no_text so the wizard can react.
func (a *App) ConvertPdfToEpub(opts models.PdfToEpubOptions) (models.PdfToEpubResult, error) {
	path, book, err := a.resolvePdfTarget(opts.BookID, opts.Path)
	if err != nil {
		return models.PdfToEpubResult{}, err
	}
	res := models.PdfToEpubResult{Path: path}

	// 1. an encrypted PDF has to be decrypted before its text can be read
	src := path
	info, err := pdfcrypt.Inspect(path, opts.Password)
	if err != nil {
		if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			res.NeedsPassword = true
			return res, nil
		}
		return res, err
	}
	if info.Encrypted {
		tmp, err := tempDecrypted(path, opts.Password)
		if err != nil {
			if errors.Is(err, pdfcrypt.ErrPasswordRequired) {
				res.NeedsPassword = true
				return res, nil
			}
			return res, err
		}
		defer os.Remove(tmp)
		src = tmp
	}

	// 2. convert, then 3. optionally import the result into the library
	cover, coverExt := coverImage(opts.UseCover, path, book)
	out, err := pdf2epub.Convert(pdf2epub.Options{
		SourcePath:  src,
		OutDir:      opts.OutDir,
		FileName:    opts.FileName,
		Title:       pdfTitle(opts, book),
		Author:      pdfAuthor(opts, book),
		Language:    pdfLanguage(opts, book),
		Publisher:   bookPublisher(book),
		Description: bookDescription(book),
		Cover:       cover,
		CoverExt:    coverExt,
		Progress: func(done, total, chars int) {
			a.emitEvent("pdf2epub:progress", models.PdfToEpubProgress{
				Current: done,
				Total:   total,
				Chars:   chars,
			})
		},
	})
	if err != nil {
		if errors.Is(err, pdf2epub.ErrNoText) {
			res.NoText = true
			res.Pages = out.Pages
			return res, nil
		}
		return res, err
	}

	res.Path = out.Path
	res.FileName = filepath.Base(out.Path)
	res.Pages = out.Pages
	res.Chars = out.Chars
	res.Bytes = out.Bytes
	res.Dropped = out.Dropped

	if opts.AddToShelf {
		res.BookID, res.Added, res.ShelfError = a.addToShelf(out.Path)
	}
	return res, nil
}

// tempDecrypted writes a decrypted copy of an encrypted PDF into the temp
// directory and returns its path. The caller removes it.
func tempDecrypted(path, password string) (string, error) {
	f, err := os.CreateTemp("", "bookmanager-pdf2epub-*.pdf")
	if err != nil {
		return "", err
	}
	name := f.Name()
	f.Close()
	// pdfcpu only writes a file that does not exist yet
	_ = os.Remove(name)
	if err := pdfcrypt.DecryptTo(path, name, password); err != nil {
		_ = os.Remove(name)
		return "", err
	}
	return name, nil
}

// addToShelf imports a converted EPUB the same way a scan would. It never
// fails the conversion: the reason is reported in the result instead.
func (a *App) addToShelf(path string) (int64, bool, string) {
	sc := &scanner.Scanner{}
	book, err := sc.Process(scanner.FileInfo{Path: path, Format: "epub"}, a.dataDir)
	if err != nil {
		return 0, false, err.Error()
	}
	id, isNew, err := a.store.UpsertScannedBook(book)
	if err != nil {
		return 0, false, err.Error()
	}
	return id, isNew, ""
}

// coverImage returns the cover to embed and its extension: the cover embedded
// in the PDF, or, failing that, the cover stored on the shelf entry.
func coverImage(use bool, path string, book *models.Book) ([]byte, string) {
	if !use {
		return nil, ""
	}
	if meta, err := parser.Parse(path, "pdf"); err == nil && len(meta.Cover) > 100 {
		return meta.Cover, meta.CoverExt
	}
	if book != nil && book.CoverPath != "" {
		if data, err := os.ReadFile(book.CoverPath); err == nil && len(data) > 100 {
			return data, filepath.Ext(book.CoverPath)
		}
	}
	return nil, ""
}

func pdfTitle(opts models.PdfToEpubOptions, book *models.Book) string {
	if strings.TrimSpace(opts.Title) != "" {
		return strings.TrimSpace(opts.Title)
	}
	if book != nil && strings.TrimSpace(book.Title) != "" {
		return book.Title
	}
	return ""
}

func pdfAuthor(opts models.PdfToEpubOptions, book *models.Book) string {
	if strings.TrimSpace(opts.Author) != "" {
		return strings.TrimSpace(opts.Author)
	}
	if book != nil {
		return book.Author
	}
	return ""
}

func pdfLanguage(opts models.PdfToEpubOptions, book *models.Book) string {
	if book != nil && strings.TrimSpace(book.Language) != "" {
		return book.Language
	}
	return opts.Language
}

func bookPublisher(book *models.Book) string {
	if book == nil {
		return ""
	}
	return book.Publisher
}

func bookDescription(book *models.Book) string {
	if book == nil {
		return ""
	}
	return book.Description
}
