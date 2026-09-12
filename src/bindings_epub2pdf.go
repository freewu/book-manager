package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/epub2pdf"
	"bookmanager/internal/models"
)

// EPUB → PDF 工具的后端绑定（前端 src/frontend/src/tools/epub-pdf/）。
//
// 流程：PickEpubFile / 书架右键拿到文件 → EpubInspect 看章节数与字数 →
// ConvertEpubToPdf 排版成 PDF（epub2pdf:progress 事件回报进度）。
// 没有正文的 EPUB 返回 no_text=true（不是错误）。

// PickEpubFile opens a native file picker limited to EPUB files.
func (a *App) PickEpubFile() (string, error) {
	path, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "选择 EPUB 文件",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "EPUB (*.epub)", Pattern: "*.epub"},
		},
	})
	if err != nil {
		if err.Error() == "cancelled" || err.Error() == "dialog cancelled" {
			return "", nil
		}
		return "", err
	}
	return path, nil
}

// EpubInspect reports the facts of an EPUB file, so the wizard can show the
// title, the author and how much text is going to be typeset.
func (a *App) EpubInspect(path string) (models.EpubFileInfo, error) {
	path = strings.TrimSpace(path)
	info := models.EpubFileInfo{Path: path, Name: filepath.Base(path)}
	epub, err := epub2pdf.Inspect(path)
	if err != nil {
		return info, err
	}
	info.Title = epub.Title
	info.Author = epub.Author
	info.Language = epub.Language
	info.Chapters = epub.Chapters
	info.Chars = epub.Chars
	info.HasCover = epub.HasCover
	if st, statErr := os.Stat(path); statErr == nil {
		info.Size = st.Size()
	}
	return info, nil
}

// EpubToPdf converts an EPUB into a PDF. An EPUB without readable text is not
// an error: the result carries no_text so the wizard can explain itself.
func (a *App) EpubToPdf(opts models.EpubToPdfOptions) (models.EpubToPdfResult, error) {
	path, book, err := a.resolveEpubTarget(opts.BookID, opts.Path)
	if err != nil {
		return models.EpubToPdfResult{}, err
	}
	res := models.EpubToPdfResult{Path: path}

	cover, coverExt := coverImage("epub", opts.UseCover, path, book)
	out, err := epub2pdf.Convert(epub2pdf.Options{
		SourcePath: path,
		OutDir:     opts.OutDir,
		FileName:   opts.FileName,
		Title:      epubTitle(opts, book),
		Author:     epubAuthor(opts, book),
		Language:   epubLanguage(opts, book),
		PageSize:   strings.TrimSpace(opts.PageSize),
		Cover:      cover,
		CoverExt:   coverExt,
		Progress: func(done, total, chars int) {
			a.emitEvent("epub2pdf:progress", models.EpubToPdfProgress{
				Current: done,
				Total:   total,
				Chars:   chars,
			})
		},
	})
	if err != nil {
		if errors.Is(err, epub2pdf.ErrNoText) {
			res.NoText = true
			return res, nil
		}
		if errors.Is(err, epub2pdf.ErrNotEPUB) {
			return res, fmt.Errorf("EPUB 文件已损坏或不是有效的 EPUB: %w", err)
		}
		if errors.Is(err, epub2pdf.ErrNoFont) {
			return res, fmt.Errorf("没有找到可嵌入的字体，无法生成 PDF: %w", err)
		}
		return res, err
	}

	res.Path = out.Path
	res.FileName = filepath.Base(out.Path)
	res.Pages = out.Pages
	res.Chars = out.Chars
	res.Chapters = out.Chapters
	res.Bytes = out.Bytes

	if opts.AddToShelf {
		res.BookID, res.Added, res.ShelfError = a.addToShelf(out.Path, "pdf")
	}
	return res, nil
}

// epubTitle picks the title written into the PDF: the wizard's override, the
// shelf title, or nothing (the EPUB's own title is used by Convert then).
func epubTitle(opts models.EpubToPdfOptions, book *models.Book) string {
	if strings.TrimSpace(opts.Title) != "" {
		return strings.TrimSpace(opts.Title)
	}
	if book != nil && strings.TrimSpace(book.Title) != "" {
		return book.Title
	}
	return ""
}

func epubAuthor(opts models.EpubToPdfOptions, book *models.Book) string {
	if strings.TrimSpace(opts.Author) != "" {
		return strings.TrimSpace(opts.Author)
	}
	if book != nil {
		return book.Author
	}
	return ""
}

func epubLanguage(opts models.EpubToPdfOptions, book *models.Book) string {
	if book != nil && strings.TrimSpace(book.Language) != "" {
		return book.Language
	}
	return opts.Language
}
