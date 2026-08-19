package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	"bookmanager/internal/douban"
	"bookmanager/internal/models"
	"bookmanager/internal/util"
)

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
		if err == nil && len(data) > 100 {
			coversDir := filepath.Join(a.dataDir, "covers")
			_ = os.MkdirAll(coversDir, 0o755)
			ext := ".jpg"
			if strings.Contains(dbBook.Pic, ".png") {
				ext = ".png"
			}
			coverPath = filepath.Join(coversDir, "douban_"+util.SanitizeFileName(dbBook.Title)+"_"+book.Hash+ext)
			if err := os.WriteFile(coverPath, data, 0o644); err != nil {
				coverPath = book.CoverPath
			}
		}
	}
	if err := a.store.UpdateDoubanInfo(bookID, dbBook.URL, dbBook.Rating, dbBook.Count, dbBook.Author, coverPath); err != nil {
		return nil, err
	}
	return a.store.GetBook(bookID)
}

// EnrichAllMissing fetches douban info for every book that has no rating yet.
func (a *App) EnrichAllMissing() (int, error) {
	books, err := a.store.ListBooks(dbBookQueryNoRating())
	if err != nil {
		return 0, err
	}
	n := 0
	for _, b := range books {
		if b.DoubanRating > 0 || b.DoubanURL != "" {
			continue
		}
		if _, err := a.FetchDouban(b.ID); err == nil {
			n++
		}
	}
	return n, nil
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
		if err == nil && len(data) > 100 {
			coversDir := filepath.Join(a.dataDir, "covers")
			_ = os.MkdirAll(coversDir, 0o755)
			coverPath = filepath.Join(coversDir, "douban_"+util.SanitizeFileName(dbBook.Title)+"_"+book.Hash+".jpg")
			if err := os.WriteFile(coverPath, data, 0o644); err != nil {
				coverPath = book.CoverPath
			}
		}
	}
	if err := a.store.UpdateDoubanInfo(bookID, dbBook.URL, dbBook.Rating, dbBook.Count, dbBook.Author, coverPath); err != nil {
		return err
	}
	return nil
}

func (a *App) ClearDoubanInfo(bookID int64) error {
	book, err := a.store.GetBook(bookID)
	if err != nil {
		return err
	}
	if book.CoverPath != "" && strings.Contains(book.CoverPath, "douban_") {
		_ = os.Remove(book.CoverPath)
	}
	return a.store.UpdateDoubanInfo(bookID, "", 0, 0, "", book.CoverPath)
}

var errNotFound = errors.New("not found")
