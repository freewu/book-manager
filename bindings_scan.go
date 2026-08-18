package main

import (
	"errors"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/sqweek/dialog"

	"bookmanager/internal/models"
	"bookmanager/internal/scanner"
)

// PickScanDir opens a native folder picker and remembers the choice.
func (a *App) PickScanDir() (string, error) {
	dir, err := dialog.Directory().Title("选择电子书目录").Browse()
	if err != nil {
		if err.Error() == "cancelled" || err.Error() == "dialog cancelled" {
			return "", nil
		}
		return "", err
	}
	if dir != "" {
		_ = a.store.AddScanDir(dir)
	}
	return dir, nil
}

// ListScanDirs returns saved scan directories.
func (a *App) ListScanDirs() []string {
	return a.store.ListScanDirs()
}

// AddScanDir records a scan directory.
func (a *App) AddScanDir(dir string) error {
	return a.store.AddScanDir(dir)
}

// RemoveScanDir forgets a scan directory.
func (a *App) RemoveScanDir(dir string) error {
	return a.store.RemoveScanDir(dir)
}

// ScanStart begins a background scan of the given directories.
// Progress is reported via the "scan:progress" event.
func (a *App) ScanStart(dirs []string) error {
	a.scanMu.Lock()
	if a.scanning {
		a.scanMu.Unlock()
		return errors.New("scan already running")
	}
	a.scanning = true
	a.scanMu.Unlock()

	go a.runScan(dirs)
	return nil
}

// ScanStatus reports whether a scan is currently running.
func (a *App) ScanStatus() bool {
	a.scanMu.Lock()
	defer a.scanMu.Unlock()
	return a.scanning
}

func (a *App) runScan(dirs []string) {
	defer func() {
		a.scanMu.Lock()
		a.scanning = false
		a.scanMu.Unlock()
	}()

	emit := func(p models.ScanProgress) {
		a.emitEvent("scan:progress", p)
	}

	sc := &scanner.Scanner{}
	files := sc.Collect(dirs)
	total := len(files)
	if total == 0 {
		emit(models.ScanProgress{Finished: true, Message: "没有找到支持的电子书文件"})
		return
	}

	// load misrecords to skip
	misPaths, _ := a.store.MisrecordPaths()
	misHashes, _ := a.store.MisrecordHashes()

	added, skipped, dupes, errs := 0, 0, 0, 0
	formats := parseFormatsSetting(a.store.GetSetting("formats", "epub,pdf,mobi,azw3,kepub"))

	for i, fi := range files {
		status := "ok"
		msg := ""
		if !formats[fi.Format] {
			skipped++
			status = "skip"
			msg = "格式未启用"
		} else if misPaths[fi.Path] {
			skipped++
			status = "skip"
			msg = "已在误录名单"
		} else if _, err := a.store.GetBookByPath(fi.Path); err == nil {
			dupes++
			status = "duplicate"
			msg = "已存在"
		} else {
			book, err := sc.Process(fi, a.dataDir)
			if err == nil {
				if misHashes[book.Hash] {
					skipped++
					status = "skip"
					msg = "hash 命中误录名单"
				} else if _, isNew, err2 := a.store.UpsertScannedBook(book); err2 == nil {
					if isNew {
						added++
					} else {
						dupes++
					}
				} else {
					errs++
					status = "error"
					msg = err2.Error()
				}
			} else {
				errs++
				status = "error"
				msg = err.Error()
			}
		}
		emit(models.ScanProgress{
			Current: i + 1,
			Total:   total,
			File:    filepath.Base(fi.Path),
			Status:  status,
			Message: msg,
			Added:   added,
			Skipped: skipped,
			Errors:  errs,
		})
	}

	// optional douban enrichment after scan
	if a.store.GetSetting("douban_auto", "0") == "1" {
		go a.enrichUnrated(added)
	}

	emit(models.ScanProgress{
		Finished: true,
		Total:    total,
		Added:    added,
		Skipped:  skipped + dupes,
		Errors:   errs,
		Message:  "扫描完成",
	})
}

// enrichUnrated asynchronously fetches douban data for books without ratings.
func (a *App) enrichUnrated(_ int) {
	books, err := a.store.ListBooks(dbBookQueryNoRating())
	if err != nil {
		return
	}
	for _, b := range books {
		if b.DoubanRating > 0 {
			continue
		}
		_, _ = a.FetchDouban(b.ID)
	}
}

func parseFormatsSetting(s string) map[string]bool {
	out := map[string]bool{}
	for _, f := range splitCSV(s) {
		out[f] = true
	}
	return out
}

// splitCSV is a tiny CSV splitter for the formats setting.
func splitCSV(s string) []string {
	out := []string{}
	cur := ""
	for _, r := range s {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}

// openInExplorer reveals a file in the OS file manager.
func openInExplorer(path string) error {
	switch runtime.GOOS {
	case "windows":
		return exec.Command("explorer", "/select,", path).Start()
	case "darwin":
		return exec.Command("open", "-R", path).Start()
	default:
		return exec.Command("xdg-open", filepath.Dir(path)).Start()
	}
}
