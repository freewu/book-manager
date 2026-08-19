package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/config"
	"bookmanager/internal/db"
)

// App is the root Wails application object; its exported methods are
// exposed to the frontend.
type App struct {
	ctx      context.Context
	store    *db.Store
	config   *config.Config
	dataDir  string
	scanMu   sync.Mutex
	scanning bool
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.dataDir = resolveDataDir()
	store, err := db.Open(filepath.Join(a.dataDir, "book.db"))
	if err != nil {
		fmt.Println("db open error:", err)
		// fallback to a writable temp location so the app still starts
		tmp, _ := os.MkdirTemp("", "bookmanager-*")
		a.dataDir = tmp
		store, err = db.Open(filepath.Join(tmp, "book.db"))
		if err != nil {
			fmt.Println("fatal: cannot open database:", err)
			os.Exit(1)
		}
	}
	a.store = store
	// settings now live in data/book.config.json (JSON), with a one-time
	// migration from the old SQLite settings table handled inside config.Load.
	a.config = config.Load(a.dataDir, a.store.AllSettings())
	// system tray (close-to-tray; the tray 退出 quits the app)
	startTray(a)
}

func (a *App) shutdown(ctx context.Context) {
	if a.store != nil {
		a.store.Close()
	}
}

// domReady is called by Wails after the frontend DOM becomes ready.
func (a *App) domReady(ctx context.Context) {
	// no-op; kept for potential future use
}

// showMainWindow shows, unminimises and focuses the main window.
// Used by the tray menu and by single-instance second-launch handling.
func (a *App) showMainWindow() {
	if a.ctx == nil {
		return
	}
	runtime.WindowShow(a.ctx)
	runtime.WindowUnminimise(a.ctx)
	// Toggle always-on-top so the window is raised above other windows.
	runtime.WindowSetAlwaysOnTop(a.ctx, true)
	runtime.WindowSetAlwaysOnTop(a.ctx, false)
}

// emitEvent fires a Wails runtime event to the frontend.
func (a *App) emitEvent(name string, data any) {
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, name, data)
	}
}

// DataDir returns the resolved application data directory.
func (a *App) DataDir() string { return a.dataDir }

// resolveDataDir decides where ./data lives. Order:
//  1. $BOOKMANAGER_DATA_DIR
//  2. <executable dir>/data
//  3. <cwd>/data
//  4. <user config dir>/book-manager/data
func resolveDataDir() string {
	if d := os.Getenv("BOOKMANAGER_DATA_DIR"); d != "" {
		if tryMkdir(d) {
			return d
		}
	}
	if exe, err := os.Executable(); err == nil {
		d := filepath.Join(filepath.Dir(exe), "data")
		if tryMkdir(d) {
			return d
		}
	}
	if cwd, err := os.Getwd(); err == nil {
		d := filepath.Join(cwd, "data")
		if tryMkdir(d) {
			return d
		}
	}
	if cfg, err := os.UserConfigDir(); err == nil {
		d := filepath.Join(cfg, "book-manager", "data")
		if tryMkdir(d) {
			return d
		}
	}
	d, _ := os.MkdirTemp("", "bookmanager-*")
	return d
}

func tryMkdir(dir string) bool {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false
	}
	probe := filepath.Join(dir, ".write_test")
	f, err := os.OpenFile(probe, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return false
	}
	f.Close()
	os.Remove(probe)
	return true
}


