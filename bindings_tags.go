package main

import (
	"errors"

	"bookmanager/internal/models"
)

// ListTags returns all tags with book counts.
func (a *App) ListTags() ([]models.Tag, error) {
	if a.store == nil {
		return nil, errors.New("database not ready")
	}
	return a.store.ListTags()
}

// CreateTag adds a new tag.
func (a *App) CreateTag(name, color string) (int64, error) {
	if name == "" {
		return 0, errors.New("标签名不能为空")
	}
	return a.store.CreateTag(name, color)
}

// UpdateTag renames / recolors a tag.
func (a *App) UpdateTag(id int64, name, color string) error {
	if name == "" {
		return errors.New("标签名不能为空")
	}
	return a.store.UpdateTag(id, name, color)
}

// DeleteTag removes a tag (book associations are dropped).
func (a *App) DeleteTag(id int64) error {
	return a.store.DeleteTag(id)
}

// SetBookTags replaces a book's tag set.
func (a *App) SetBookTags(bookID int64, tagIDs []int64) error {
	return a.store.SetBookTags(bookID, tagIDs)
}
