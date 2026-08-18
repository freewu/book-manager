package util

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// SupportedFormats lists the ebook extensions this app understands.
var SupportedFormats = map[string]string{
	".epub":  "epub",
	".pdf":   "pdf",
	".mobi":  "mobi",
	".azw":   "mobi",
	".azw3":  "azw3",
	".azw4":  "azw3",
	".kepub": "kepub",
	".kepub.epub": "kepub",
}

// FormatOf returns the normalized format of a file ("" if unsupported).
func FormatOf(path string) string {
	lower := strings.ToLower(path)
	// kepub.epub takes precedence
	if strings.HasSuffix(lower, ".kepub.epub") {
		return "kepub"
	}
	ext := filepath.Ext(lower)
	if f, ok := SupportedFormats[ext]; ok {
		return f
	}
	return ""
}

// HashFile computes the md5 hash of a file.
func HashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := md5.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// FileSize returns the file size in bytes.
func FileSize(path string) (int64, error) {
	st, err := os.Stat(path)
	if err != nil {
		return 0, err
	}
	return st.Size(), nil
}

// HumanSize formats a byte count for display.
func HumanSize(n int64) string {
	if n < 1024 {
		return fmt.Sprintf("%d B", n)
	}
	f := float64(n)
	for _, unit := range []string{"KB", "MB", "GB", "TB"} {
		f /= 1024
		if f < 1024 {
			return fmt.Sprintf("%.1f %s", f, unit)
		}
	}
	return fmt.Sprintf("%.1f PB", f/1024)
}

// HumanDuration formats seconds as "1h 23m 45s" style text.
func HumanDuration(seconds int64) string {
	if seconds <= 0 {
		return "0s"
	}
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60
	var sb strings.Builder
	if h > 0 {
		fmt.Fprintf(&sb, "%dh", h)
	}
	if m > 0 || h > 0 {
		fmt.Fprintf(&sb, "%dm", m)
	}
	if h == 0 && m == 0 {
		fmt.Fprintf(&sb, "%ds", s)
	}
	return sb.String()
}

// IsSubPath reports whether child is inside parent (or equal).
func IsSubPath(parent, child string) bool {
	parent = filepath.Clean(parent)
	child = filepath.Clean(child)
	if child == parent {
		return true
	}
	rel, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// SanitizeFileName makes a string safe for use as a filename.
func SanitizeFileName(s string) string {
	replacer := strings.NewReplacer(
		"/", "_", "\\", "_", ":", "_", "*", "_", "?", "_", "\"", "_",
		"<", "_", ">", "_", "|", "_", "\n", " ", "\r", " ", "\t", " ",
	)
	return strings.TrimSpace(replacer.Replace(s))
}

// UniqueName returns a unique file path by appending (1), (2)...
func UniqueName(dir, base, ext string) string {
	p := filepath.Join(dir, base+ext)
	for i := 1; ; i++ {
		if _, err := os.Stat(p); os.IsNotExist(err) {
			return p
		}
		p = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", base, i, ext))
	}
}
