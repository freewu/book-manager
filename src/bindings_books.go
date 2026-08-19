package main

import (
	"errors"

	"bookmanager/internal/db"
	"bookmanager/internal/models"
)

// BookQueryInput mirrors db.BookQuery for the frontend.
type BookQueryInput struct {
	Keyword   string   `json:"keyword"`
	Formats   []string `json:"formats"`
	TagIDs    []int64  `json:"tag_ids"`
	Sort      string   `json:"sort"`
	Desc      bool     `json:"desc"`
	Misrecord bool     `json:"misrecord"`
	Limit     int      `json:"limit"`
	Offset    int      `json:"offset"`
}

// GetBooks lists books with filtering / sorting.
func (a *App) GetBooks(q BookQueryInput) ([]models.Book, error) {
	if a.store == nil {
		return nil, errors.New("database not ready")
	}
	return a.store.ListBooks(db.BookQuery{
		Keyword:   q.Keyword,
		Formats:   q.Formats,
		TagIDs:    q.TagIDs,
		Sort:      q.Sort,
		Desc:      q.Desc,
		Misrecord: q.Misrecord,
		Limit:     q.Limit,
		Offset:    q.Offset,
	})
}

// GetBook returns one book.
func (a *App) GetBook(id int64) (*models.Book, error) {
	return a.store.GetBook(id)
}

// UpdateBookMeta edits the editable metadata of a book.
func (a *App) UpdateBookMeta(id int64, title, author, publisher, description string) error {
	return a.store.UpdateBookMeta(id, title, author, publisher, description)
}

// DeleteBook removes a book from the library (file is NOT deleted).
func (a *App) DeleteBook(id int64) error {
	return a.store.DeleteBook(id)
}

// MarkMisrecord flags a book as incorrectly scanned; it will be hidden from
// the shelf and its file skipped on future imports.
func (a *App) MarkMisrecord(id int64, reason string) error {
	return a.store.SetMisrecord(id, true, reason)
}

// UnmarkMisrecord restores a book flagged as misrecorded.
func (a *App) UnmarkMisrecord(id int64) error {
	return a.store.SetMisrecord(id, false, "")
}

// OpenBookFolder opens the containing folder of the book file in the OS file manager.
func (a *App) OpenBookFolder(id int64) error {
	b, err := a.store.GetBook(id)
	if err != nil {
		return err
	}
	return openInExplorer(b.Path)
}
