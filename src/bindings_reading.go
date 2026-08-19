package main

import (
	"bookmanager/internal/models"
)

// SaveProgress persists the reading position of a book.
func (a *App) SaveProgress(bookID int64, location string, page, totalPages int, progress float64) error {
	return a.store.SaveProgress(bookID, location, page, totalPages, progress)
}

// ReportReading adds active reading seconds for a book (called periodically by the reader).
// It returns the updated total reading seconds.
func (a *App) ReportReading(bookID int64, seconds int64, page int) (int64, error) {
	return a.store.AddReadingTime(bookID, seconds, page)
}

// ListReadingSessions returns reading history.
func (a *App) ListReadingSessions(limit int) ([]models.ReadingSession, error) {
	return a.store.ListReadingSessions(limit)
}
