package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"bookmanager/internal/db"
)

// App is the root Wails application object; its exported methods are
// exposed to the frontend.
type App struct {
	ctx      context.Context
	store    *db.Store
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
	// TEMP probe: OnStartup reached
	a.probe("onstartup")
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
	// ensure default settings exist
	ensureDefaults(a.store)
}

func (a *App) shutdown(ctx context.Context) {
	if a.store != nil {
		a.store.Close()
	}
}

// probe is a TEMPORARY diagnostic helper. Remove after white-screen investigation.
func (a *App) probe(stage string) {
	dir := a.dataDir
	if dir == "" {
		dir = "."
	}
	f, err := os.OpenFile(filepath.Join(dir, "probe.log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s %s\n", time.Now().Format("15:04:05.000"), stage)
}

// domReady is called by Wails after the frontend DOM becomes ready.
func (a *App) domReady(ctx context.Context) {
	a.probe("domready")
	// Give the renderer a moment, then force a repaint and verify the page is still alive.
	go func() {
		time.Sleep(1200 * time.Millisecond)
		// Re-show the window to nudge WebView2 into repainting (workaround for blank-window cases).
		runtime.WindowShow(ctx)
		runtime.WindowSetSize(ctx, 1280, 820)
		// Ask the page to report its DOM state so we can confirm render vs. paint.
		js := `(() => { try {
			var r = document.getElementById('root');
			var info = 'jsexec dom=' + (r ? r.childElementCount : -1) + ' body=' + document.body.children.length;
			if (window.go && window.go.main && window.go.main.App) window.go.main.App.DebugProbe(info).catch(function(){});
		} catch(e) {
			if (window.go && window.go.main && window.go.main.App) window.go.main.App.DebugProbe('jsexec-err ' + e.message).catch(function(){});
		})()`
		runtime.WindowExecJS(ctx, js)
	}()
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

func ensureDefaults(s *db.Store) {
	defaults := map[string]string{
		"idle_seconds": "60",
		"formats":      "epub,pdf,mobi,azw3,kepub",
		"douban_auto":  "0",
		"theme":        "light",
	}
	for k, v := range defaults {
		if s.GetSetting(k, "") == "" {
			_ = s.SetSetting(k, v)
		}
	}
}
