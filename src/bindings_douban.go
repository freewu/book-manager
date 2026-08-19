package main

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"bookmanager/internal/douban"
	"bookmanager/internal/models"
)

var (
	enrichMu    sync.Mutex
	enrichBusy  atomic.Bool
)

// saveCoverPNG downloads douban cover bytes and stores them under
// ./data/.image/<book-hash>.png (re-encoded as PNG when possible).
func (a *App) saveCoverPNG(data []byte, book models.Book) (string, error) {
	if len(data) < 4 {
		return "", errors.New("cover too small")
	}
	imgDir := filepath.Join(a.dataDir, ".image")
	if err := os.MkdirAll(imgDir, 0o755); err != nil {
		return "", err
	}
	name := book.Hash
	if name == "" {
		name = fmt.Sprintf("%d", book.ID)
	}
	coverPath := filepath.Join(imgDir, name+".png")
	// Re-encode to real PNG so the .png extension matches the content.
	if img, _, err := image.Decode(bytes.NewReader(data)); err == nil {
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err == nil {
			if err := os.WriteFile(coverPath, buf.Bytes(), 0o644); err == nil {
				return coverPath, nil
			}
		}
	}
	// Fallback: store raw bytes (still under the .png name the UI expects).
	if err := os.WriteFile(coverPath, data, 0o644); err != nil {
		return "", err
	}
	return coverPath, nil
}

// DoubanSearch queries douban for a title and returns candidate matches.
func (a *App) DoubanSearch(title string) ([]models.DoubanBook, error) {
	b, err := douban.SearchByTitle(title)
	if err != nil {
		return nil, err
	}
	return []models.DoubanBook{*b}, nil
}

// FetchDouban enriches a single book with douban data (cover, url, rating).
func (a *App) FetchDouban(bookID int64) (*models.Book, error) {
	book, err := a.store.GetBook(bookID)
	if err != nil {
		return nil, err
	}
	title := book.Title
	if title == "" {
		title = book.FileName
	}
	dbBook, err := douban.SearchByTitle(title)
	if err != nil {
		return nil, err
	}
	coverPath := book.CoverPath
	if dbBook.Pic != "" {
		data, err := douban.DownloadCover(dbBook.Pic)
		if err == nil {
			if p, cerr := a.saveCoverPNG(data, *book); cerr == nil {
				coverPath = p
			}
		}
	}
	if err := a.store.UpdateDoubanInfo(bookID, dbBook.URL, dbBook.Rating, dbBook.Count, dbBook.Author, coverPath); err != nil {
		return nil, err
	}
	return a.store.GetBook(bookID)
}

// EnrichBookByTitle manually links a book to a douban result.
func (a *App) EnrichBookByTitle(bookID int64, dbBook models.DoubanBook) error {
	book, err := a.store.GetBook(bookID)
	if err != nil {
		return err
	}
	coverPath := book.CoverPath
	if dbBook.Pic != "" {
		data, err := douban.DownloadCover(dbBook.Pic)
		if err == nil {
			if p, cerr := a.saveCoverPNG(data, *book); cerr == nil {
				coverPath = p
			}
		}
	}
	if err := a.store.UpdateDoubanInfo(bookID, dbBook.URL, dbBook.Rating, dbBook.Count, dbBook.Author, coverPath); err != nil {
		return err
	}
	return nil
}

// StartEnrichAll asynchronously fetches douban info for every book that has
// no rating yet, emitting douban:progress / douban:done events to the UI.
func (a *App) StartEnrichAll() (int, error) {
	books, err := a.store.ListBooks(dbBookQueryNoRating())
	if err != nil {
		return 0, err
	}
	if enrichBusy.Swap(true) {
		return 0, errors.New("already running")
	}
	go a.runEnrichAll(books)
	return len(books), nil
}

// EnrichAllMissing keeps the old synchronous entry point for compatibility.
func (a *App) EnrichAllMissing() (int, error) {
	books, err := a.store.ListBooks(dbBookQueryNoRating())
	if err != nil {
		return 0, err
	}
	if enrichBusy.Swap(true) {
		return 0, errors.New("already running")
	}
	go a.runEnrichAll(books)
	return len(books), nil
}

func (a *App) runEnrichAll(books []models.Book) {
	defer enrichBusy.Store(false)
	total := len(books)
	ok, skipped, errs := 0, 0, 0
	for i, b := range books {
		if b.DoubanRating > 0 || b.DoubanURL != "" {
			skipped++
			continue
		}
		_, err := a.FetchDouban(b.ID)
		status, msg := "ok", ""
		if err != nil {
			errs++
			status, msg = "error", err.Error()
		} else {
			ok++
		}
		a.emitEvent("douban:progress", models.DoubanProgress{
			Current: i + 1,
			Total:   total,
			Title:   b.Title,
			Status:  status,
			Message: msg,
			Ok:      ok,
			Errors:  errs,
			Skipped: skipped,
		})
	}
	a.emitEvent("douban:progress", models.DoubanProgress{
		Finished: true,
		Total:    total,
		Ok:       ok,
		Errors:   errs,
		Skipped:  skipped,
	})
	a.emitEvent("douban:done", nil)
}

func (a *App) ClearDoubanInfo(bookID int64) error {
	book, err := a.store.GetBook(bookID)
	if err != nil {
		return err
	}
	if book.CoverPath != "" && strings.Contains(book.CoverPath, ".image") {
		_ = os.Remove(book.CoverPath)
	}
	return a.store.UpdateDoubanInfo(bookID, "", 0, 0, "", book.CoverPath)
}

var errNotFound = errors.New("not found")
