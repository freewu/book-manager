package main

import (
	"bookmanager/internal/models"
)

// ListNotes returns all notes for a book.
func (a *App) ListNotes(bookID int64) ([]models.Note, error) {
	return a.store.ListNotes(bookID)
}

// CreateNote adds a note to a book.
func (a *App) CreateNote(bookID int64, content, location, chapter, quote string) (int64, error) {
	return a.store.CreateNote(bookID, content, location, chapter, quote)
}

// UpdateNote edits a note's content.
func (a *App) UpdateNote(id int64, content string) error {
	return a.store.UpdateNote(id, content)
}

// DeleteNote removes a note.
func (a *App) DeleteNote(id int64) error {
	return a.store.DeleteNote(id)
}
