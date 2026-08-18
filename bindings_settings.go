package main

import (
	"encoding/base64"
	"os"
	"strconv"

	"bookmanager/internal/db"
	"bookmanager/internal/models"
)

// GetSettings returns the merged settings with defaults.
func (a *App) GetSettings() models.Settings {
	out := models.Settings{}
	for k, v := range a.store.AllSettings() {
		out[k] = v
	}
	if out["idle_seconds"] == "" {
		out["idle_seconds"] = "60"
	}
	if out["formats"] == "" {
		out["formats"] = "epub,pdf,mobi,azw3,kepub"
	}
	if out["douban_auto"] == "" {
		out["douban_auto"] = "0"
	}
	if out["theme"] == "" {
		out["theme"] = "light"
	}
	return out
}

// SetSettings applies a batch of settings.
func (a *App) SetSettings(values models.Settings) error {
	for k, v := range values {
		if err := a.store.SetSetting(k, v); err != nil {
			return err
		}
	}
	return nil
}

// GetStats returns library statistics.
func (a *App) GetStats() (models.Stats, error) {
	st, err := a.store.Stats()
	if err != nil {
		return models.Stats{}, err
	}
	return models.Stats{
		TotalBooks:       st.TotalBooks,
		TotalSize:        st.TotalSize,
		TotalReadSeconds: st.TotalReadSeconds,
		TotalNotes:       st.TotalNotes,
		TotalTags:        st.TotalTags,
		TotalMisrecords:  st.TotalMisrecords,
		ReadingBooks:     st.ReadingBooks,
		FinishedBooks:    st.FinishedBooks,
		UnreadBooks:      st.UnreadBooks,
		FormatCounts:     st.FormatCounts,
	}, nil
}

// GetBookData returns the raw bytes of a book file as base64 for the reader.
func (a *App) GetBookData(bookID int64) (string, error) {
	b, err := a.store.GetBook(bookID)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(b.Path)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// GetBookDataRange returns a byte range (offset, length) of a book file as base64.
func (a *App) GetBookDataRange(bookID int64, offset int64, length int) (string, error) {
	b, err := a.store.GetBook(bookID)
	if err != nil {
		return "", err
	}
	f, err := os.Open(b.Path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	buf := make([]byte, length)
	n, err := f.ReadAt(buf, offset)
	if err != nil && n == 0 {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf[:n]), nil
}

// GetCoverData returns the cover image bytes as base64 (empty string if none).
func (a *App) GetCoverData(bookID int64) (string, error) {
	b, err := a.store.GetBook(bookID)
	if err != nil {
		return "", err
	}
	if b.CoverPath == "" {
		return "", nil
	}
	data, err := os.ReadFile(b.CoverPath)
	if err != nil {
		return "", nil
	}
	return base64.StdEncoding.EncodeToString(data), nil
}

// GetMisrecords lists misrecorded files for management.
func (a *App) GetMisrecords() ([]models.Misrecord, error) {
	rows, err := a.store.ListMisrecords()
	if err != nil {
		return nil, err
	}
	out := make([]models.Misrecord, 0, len(rows))
	for _, r := range rows {
		out = append(out, models.Misrecord{
			ID:        r.ID,
			Path:      r.Path,
			Hash:      r.Hash,
			FileName:  r.FileName,
			Reason:    r.Reason,
			CreatedAt: r.CreatedAt,
		})
	}
	return out, nil
}

// RemoveMisrecord deletes one misrecord entry.
func (a *App) RemoveMisrecord(id int64) error {
	return a.store.RemoveMisrecord(id)
}

// ClearMisrecords removes all misrecords and unmarks books.
func (a *App) ClearMisrecords() error {
	if err := a.store.ClearMisrecords(); err != nil {
		return err
	}
	_, err := a.store.DB().Exec("UPDATE books SET misrecord=0 WHERE misrecord=1")
	return err
}

// dbBookQueryNoRating is a helper query: normal books without douban data.
func dbBookQueryNoRating() db.BookQuery {
	return db.BookQuery{
		Misrecord: false,
		NoDouban:  true,
		Limit:     300,
	}
}

// helper for idle seconds parsing used by the reader settings
func idleSecondsFromSettings(s models.Settings) int {
	v, _ := strconv.Atoi(s["idle_seconds"])
	if v <= 0 {
		return 60
	}
	return v
}


