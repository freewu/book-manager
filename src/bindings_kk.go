package main

import (
	"errors"
	"net/url"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// KKFileAddr returns the configured kkfileview base address.
func (a *App) KKFileAddr() string {
	addr := a.store.GetSetting("kkfile_addr", "http://127.0.0.1:8012")
	return strings.TrimRight(addr, "/")
}

// SetKKFileAddr persists the kkfileview base address.
func (a *App) SetKKFileAddr(addr string) error {
	return a.store.SetSetting("kkfile_addr", strings.TrimSpace(addr))
}

// OpenWithKKFileView opens a book file (mobi / azw3) in the user's kkfileview
// online preview service. Returns the preview URL that was opened.
func (a *App) OpenWithKKFileView(bookID int64) (string, error) {
	book, err := a.store.GetBook(bookID)
	if err != nil {
		return "", err
	}
	if book.Path == "" {
		return "", errors.New("book file path is empty")
	}
	fileURL := "file:///" + filepath.ToSlash(book.Path)
	preview := a.KKFileAddr() + "/onlinePreview?url=" + url.QueryEscape(fileURL)
	runtime.BrowserOpenURL(a.ctx, preview)
	return preview, nil
}
