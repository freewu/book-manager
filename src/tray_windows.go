//go:build windows

package main

// Native Windows tray implementation.
//
// Why not a third-party package: the tray is the only way to bring the app
// back after the close button hides the window, so it must not silently die.
// This implementation owns its message loop (pinned to one OS thread, which is
// required because Windows delivers a window's messages to the thread that
// created it), re-registers the icon whenever the shell (explorer.exe) restarts
// and also from a watchdog timer, and never blocks the loop with UI calls.

import (
	_ "embed"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/sys/windows"
)

// ---- Win32 constants ----

const (
	wmNull          = 0x0000
	wmClose         = 0x0010
	wmDestroy       = 0x0002
	wmTimer         = 0x0113
	wmEndSession    = 0x0016
	wmLButtonUp     = 0x0202
	wmLButtonDblClk = 0x0203
	wmRButtonUp     = 0x0205
	wmContextMenu   = 0x007B
	wmUser          = 0x0400
)

const (
	nimAdd      = 0x00000000
	nimModify   = 0x00000001
	nimDelete   = 0x00000002
	nifMessage  = 0x00000001
	nifIcon     = 0x00000002
	nifTip      = 0x00000004
	notifyID    = 1
	watchdogMs  = 10000 // re-register the icon every 10s if the shell dropped it
	imageIcon   = 1
	lrLoadFile  = 0x00000010
	lrDefaultSz = 0x00000040
)

const (
	mfString    = 0x00000000
	mfPopup     = 0x00000010
	mfSeparator = 0x00000800
	mfChecked   = 0x00000008

	tpmLeftAlign    = 0x0000
	tpmRightButton  = 0x0002
	tpmBottomAlign  = 0x0020
	tpmNoNotify     = 0x0080
	tpmReturnCmd    = 0x0100
	smCXSmIcon      = 49
	smCYSmIcon      = 50
	trayMenuIDBase  = 100
	trayMenuShow    = trayMenuIDBase + 1
	trayMenuLang    = trayMenuIDBase + 2
	trayMenuLang0   = trayMenuIDBase + 3 // + language index
	trayMenuQuit    = trayMenuIDBase + 9
	trayMenuVersion = trayMenuIDBase + 10
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")

	procRegisterClassEx       = user32.NewProc("RegisterClassExW")
	procCreateWindowEx        = user32.NewProc("CreateWindowExW")
	procDestroyWindow         = user32.NewProc("DestroyWindow")
	procDefWindowProc         = user32.NewProc("DefWindowProcW")
	procGetMessage            = user32.NewProc("GetMessageW")
	procTranslateMessage      = user32.NewProc("TranslateMessage")
	procDispatchMessage       = user32.NewProc("DispatchMessageW")
	procPostQuitMessage       = user32.NewProc("PostQuitMessage")
	procPostMessage           = user32.NewProc("PostMessageW")
	procRegisterWindowMessage = user32.NewProc("RegisterWindowMessageW")
	procGetCursorPos          = user32.NewProc("GetCursorPos")
	procSetForegroundWindow   = user32.NewProc("SetForegroundWindow")
	procCreatePopupMenu       = user32.NewProc("CreatePopupMenu")
	procAppendMenu            = user32.NewProc("AppendMenuW")
	procTrackPopupMenu        = user32.NewProc("TrackPopupMenu")
	procDestroyMenu           = user32.NewProc("DestroyMenu")
	procSetTimer              = user32.NewProc("SetTimer")
	procKillTimer             = user32.NewProc("KillTimer")
	procLoadImage             = user32.NewProc("LoadImageW")
	procDestroyIcon           = user32.NewProc("DestroyIcon")
	procGetSystemMetrics      = user32.NewProc("GetSystemMetrics")
	procGetModuleHandle       = kernel32.NewProc("GetModuleHandleW")
	procShellNotifyIcon       = shell32.NewProc("Shell_NotifyIconW")
)

// ---- Win32 structs ----

type wndClassExW struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   windows.Handle
	Icon       windows.Handle
	Cursor     windows.Handle
	Background windows.Handle
	MenuName   *uint16
	ClassName  *uint16
	IconSm     windows.Handle
}

type w32Point struct{ X, Y int32 }

type w32Msg struct {
	HWnd    windows.Handle
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      w32Point
}

// notifyIconData mirrors NOTIFYICONDATAW (Vista+ layout). It must keep the same
// field order/sizes as the Windows header.
type notifyIconData struct {
	Size            uint32
	Wnd             windows.Handle
	ID              uint32
	Flags           uint32
	CallbackMessage uint32
	Icon            windows.Handle
	Tip             [128]uint16
	State           uint32
	StateMask       uint32
	Info            [256]uint16
	TimeoutVersion  uint32
	InfoTitle       [64]uint16
	InfoFlags       uint32
	GUID            windows.GUID
	BalloonIcon     windows.Handle
}

// ---- tray state ----

var (
	//go:embed build/windows/icon.ico
	trayIcon []byte

	trayHWND        windows.Handle
	trayIconHandle  windows.Handle
	trayCallbackMsg uint32 = wmUser + 1
	taskbarCreated  uint32
	trayRegistered  atomic.Bool
	trayEverAdded   atomic.Bool
	trayFailLogged  atomic.Bool
	trayLangMu      sync.RWMutex
	trayLangCode    = "zh-CN"
	trayExitOnce    sync.Once
)

func setTrayLang(lang string) {
	if lang != "zh-TW" && lang != "en" {
		lang = "zh-CN"
	}
	trayLangMu.Lock()
	trayLangCode = lang
	trayLangMu.Unlock()
}

func trayLang() string {
	trayLangMu.RLock()
	defer trayLangMu.RUnlock()
	return trayLangCode
}

func trayIconRegistered() bool { return trayRegistered.Load() }

// trayLog writes tray lifecycle events to stderr and to <dataDir>/tray.log so a
// lost/never-shown icon can be diagnosed after the fact.
func trayLog(format string, args ...any) {
	msg := fmt.Sprintf(format, args...)
	log.Printf("[tray] %s", msg)
	dir := ""
	if trayApp != nil {
		dir = trayApp.dataDir
	}
	if dir == "" {
		return
	}
	f, err := os.OpenFile(filepath.Join(dir, "tray.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return
	}
	defer f.Close()
	fmt.Fprintf(f, "%s %s\n", time.Now().Format("2006-01-02 15:04:05"), msg)
}

// startTray starts the tray icon + menu. It returns immediately; the message
// loop runs on its own goroutine for the whole lifetime of the app.
func startTray(a *App) {
	appCtx = a.ctx
	showMain = a.showMainWindow
	trayApp = a
	setTrayLang(a.config.Get("language"))

	go func() {
		// The message pump must stay on the OS thread that created the tray
		// window, otherwise Windows stops delivering its messages (the icon
		// stays visible but clicks do nothing).
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		err := runTray()
		trayRegistered.Store(false)
		if trayIconHandle != 0 {
			procDestroyIcon.Call(uintptr(trayIconHandle))
			trayIconHandle = 0
		}
		if err != nil {
			// Without a working tray icon a hidden window cannot be restored,
			// so surface the window again and let the close button quit.
			trayLog("loop stopped: %v", err)
			if showMain != nil {
				go showMain()
			}
			return
		}
		trayExit()
	}()
}

// runTray creates the hidden message window, registers the icon and pumps
// messages until the tray is quit. It blocks.
func runTray() error {
	instance, _, _ := procGetModuleHandle.Call(0)
	if instance == 0 {
		return fmt.Errorf("GetModuleHandle failed")
	}

	className, _ := windows.UTF16PtrFromString("BookManagerTrayWindow")
	wc := wndClassExW{
		Style:     0,
		WndProc:   windows.NewCallback(trayWndProc),
		Instance:  windows.Handle(instance),
		ClassName: className,
	}
	wc.Size = uint32(unsafe.Sizeof(wc))
	if r, _, err := procRegisterClassEx.Call(uintptr(unsafe.Pointer(&wc))); r == 0 {
		return fmt.Errorf("RegisterClassEx: %w", err)
	}

	// A regular (but never shown) top-level window: message-only windows do not
	// receive broadcast messages such as TaskbarCreated.
	hwnd, _, err := procCreateWindowEx.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		0, 0,
		0, 0, 0, 0,
		0, 0, instance, 0,
	)
	if hwnd == 0 {
		return fmt.Errorf("CreateWindowEx: %w", err)
	}
	trayHWND = windows.Handle(hwnd)

	name, _ := windows.UTF16PtrFromString("TaskbarCreated")
	r, _, _ := procRegisterWindowMessage.Call(uintptr(unsafe.Pointer(name)))
	taskbarCreated = uint32(r)

	if err := loadTrayIcon(); err != nil {
		return err
	}
	ensureTrayIcon()
	procSetTimer.Call(hwnd, notifyID, watchdogMs, 0)
	defer procKillTimer.Call(hwnd, notifyID)

	var msg w32Msg
	for {
		ret, _, callErr := procGetMessage.Call(uintptr(unsafe.Pointer(&msg)), 0, 0, 0)
		switch int32(ret) {
		case -1:
			return fmt.Errorf("GetMessage: %w", callErr)
		case 0:
			return nil // WM_QUIT
		default:
			procTranslateMessage.Call(uintptr(unsafe.Pointer(&msg)))
			procDispatchMessage.Call(uintptr(unsafe.Pointer(&msg)))
		}
	}
}

func trayWndProc(hwnd windows.Handle, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case trayCallbackMsg:
		switch uint32(lParam) {
		case wmLButtonUp, wmLButtonDblClk:
			// Left click restores the window: with close-to-tray this is the
			// most common way back into the app.
			dispatchTrayAction(func() {
				if showMain != nil {
					showMain()
				}
			})
		case wmRButtonUp, wmContextMenu:
			showTrayMenu(hwnd)
		}
		return 0
	case wmTimer:
		ensureTrayIcon()
		return 0
	case wmClose:
		procDestroyWindow.Call(uintptr(hwnd))
		return 0
	case wmDestroy:
		removeTrayIcon()
		procPostQuitMessage.Call(0)
		return 0
	case wmEndSession:
		removeTrayIcon()
		return 0
	}
	if taskbarCreated != 0 && message == taskbarCreated {
		// explorer.exe restarted: the shell forgot every icon.
		trayLog("explorer.exe restarted (TaskbarCreated)")
		ensureTrayIcon()
		return 0
	}
	res, _, _ := procDefWindowProc.Call(uintptr(hwnd), uintptr(message), wParam, lParam)
	return res
}

// dispatchTrayAction runs a menu/click action on its own goroutine so the
// message loop is never blocked by Wails runtime calls (or by a slow shell).
func dispatchTrayAction(fn func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				trayLog("action panic: %v", r)
			}
		}()
		fn()
	}()
}

// ---- icon management ----

func loadTrayIcon() error {
	path := filepath.Join(os.TempDir(), "book-manager-tray.ico")
	if err := os.WriteFile(path, trayIcon, 0o600); err != nil {
		return err
	}
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return err
	}
	// Prefer a crisp small icon for the notification area.
	cx, _, _ := procGetSystemMetrics.Call(smCXSmIcon)
	cy, _, _ := procGetSystemMetrics.Call(smCYSmIcon)
	h, _, loadErr := procLoadImage.Call(0, uintptr(unsafe.Pointer(p)), imageIcon, cx, cy, lrLoadFile)
	if h == 0 {
		h, _, loadErr = procLoadImage.Call(0, uintptr(unsafe.Pointer(p)), imageIcon, 0, 0, lrLoadFile|lrDefaultSz)
	}
	if h == 0 {
		return fmt.Errorf("LoadImage: %w", loadErr)
	}
	trayIconHandle = windows.Handle(h)
	return nil
}

func newTrayNID() *notifyIconData {
	nid := &notifyIconData{
		Wnd:             trayHWND,
		ID:              notifyID,
		Flags:           nifMessage | nifIcon | nifTip,
		CallbackMessage: trayCallbackMsg,
		Icon:            trayIconHandle,
	}
	nid.Size = uint32(unsafe.Sizeof(*nid))
	tip, _ := windows.UTF16FromString("book-manager " + Version)
	copy(nid.Tip[:], tip)
	return nid
}

func shellNotify(flag uint32, nid *notifyIconData) bool {
	res, _, _ := procShellNotifyIcon.Call(uintptr(flag), uintptr(unsafe.Pointer(nid)))
	return res != 0
}

// ensureTrayIcon (re-)registers the icon with the shell. It is safe to call at
// any time, including while the icon is already registered.
func ensureTrayIcon() {
	if trayIconHandle == 0 {
		return
	}
	nid := newTrayNID()
	if shellNotify(nimModify, nid) {
		if !trayRegistered.Swap(true) {
			trayLog("icon registered")
		}
		trayFailLogged.Store(false)
		return
	}
	// Not registered (first start, or the shell dropped it) → add it again.
	if shellNotify(nimAdd, nid) {
		if trayEverAdded.Swap(true) {
			trayLog("icon was missing, re-registered with the shell")
		} else {
			trayLog("icon registered")
		}
		trayRegistered.Store(true)
		trayFailLogged.Store(false)
		return
	}
	trayRegistered.Store(false)
	if !trayFailLogged.Swap(true) {
		trayLog("Shell_NotifyIcon failed: the icon is NOT in the notification area")
	}
}

func removeTrayIcon() {
	if trayHWND == 0 {
		return
	}
	nid := &notifyIconData{Wnd: trayHWND, ID: notifyID}
	nid.Size = uint32(unsafe.Sizeof(*nid))
	shellNotify(nimDelete, nid)
	trayRegistered.Store(false)
}

// ---- menu ----

func appendMenuItem(menu uintptr, flags uintptr, id uintptr, text string) {
	p, err := windows.UTF16PtrFromString(text)
	if err != nil {
		return
	}
	procAppendMenu.Call(menu, flags, id, uintptr(unsafe.Pointer(p)))
}

func showTrayMenu(hwnd windows.Handle) {
	menu, _, _ := procCreatePopupMenu.Call()
	if menu == 0 {
		return
	}
	defer procDestroyMenu.Call(menu)

	lang := trayLang()
	labels := labelsFor(lang)

	appendMenuItem(menu, mfString, trayMenuVersion, "book-manager "+Version+" ↗")
	appendMenuItem(menu, mfString, trayMenuShow, labels.show)

	sub, _, _ := procCreatePopupMenu.Call()
	for i, code := range trayLangCodes {
		flags := uintptr(mfString)
		if code == lang {
			flags |= mfChecked
		}
		appendMenuItem(sub, flags, uintptr(trayMenuLang0+i), trayLangNames[i])
	}
	appendMenuPopup(menu, sub, labels.lang)

	procAppendMenu.Call(menu, mfSeparator, 0, 0)
	appendMenuItem(menu, mfString, trayMenuQuit, labels.quit)

	var pt w32Point
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	// Required so the menu closes when the user clicks elsewhere.
	procSetForegroundWindow.Call(uintptr(hwnd))
	cmd, _, _ := procTrackPopupMenu.Call(
		menu,
		tpmReturnCmd|tpmRightButton|tpmNoNotify|tpmLeftAlign|tpmBottomAlign,
		uintptr(pt.X), uintptr(pt.Y),
		0, uintptr(hwnd), 0,
	)
	procPostMessage.Call(uintptr(hwnd), wmNull, 0, 0)
	trayLog("menu closed, cmd=%d", uint32(cmd))

	switch uint32(cmd) {
	case trayMenuShow:
		dispatchTrayAction(func() {
			if showMain != nil {
				showMain()
			}
		})
	case trayMenuLang0, trayMenuLang0 + 1, trayMenuLang0 + 2:
		code := trayLangCodes[uint32(cmd)-trayMenuLang0]
		dispatchTrayAction(func() { switchTrayLanguage(code) })
	case trayMenuVersion:
		dispatchTrayAction(openProjectPage)
	case trayMenuQuit:
		dispatchTrayAction(quitTray)
	}
}

func appendMenuPopup(menu, sub uintptr, text string) {
	p, err := windows.UTF16PtrFromString(text)
	if err != nil {
		return
	}
	procAppendMenu.Call(menu, mfPopup, sub, uintptr(unsafe.Pointer(p)))
}

// ---- lifecycle ----

func openProjectPage() {
	if appCtx == nil {
		return
	}
	wruntime.BrowserOpenURL(appCtx, "https://github.com/freewu/book-manager")
}

// quitTray tears the tray down and exits the app.
func quitTray() {
	trayLog("quit requested")
	if trayHWND != 0 {
		procPostMessage.Call(uintptr(trayHWND), wmClose, 0, 0)
		return
	}
	trayExit()
}

// trayExit terminates the process (the tray loop already ended).
func trayExit() {
	trayExitOnce.Do(func() {
		quitting.Store(true)
		if appCtx != nil {
			wruntime.Quit(appCtx)
		}
	})
}
