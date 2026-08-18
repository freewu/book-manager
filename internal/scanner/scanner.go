package scanner

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"bookmanager/internal/models"
	"bookmanager/internal/parser"
	"bookmanager/internal/util"
)

// Scanner walks directories and produces scan results.
type Scanner struct {
	mu sync.Mutex
}

type FileInfo struct {
	Path  string
	Format string
	Size  int64
	Hash  string
}

// Collect walks the given dirs and returns all supported ebook files.
func (sc *Scanner) Collect(dirs []string) []FileInfo {
	var files []FileInfo
	seen := map[string]bool{}
	for _, dir := range dirs {
		info, err := os.Stat(dir)
		if err != nil {
			continue
		}
		if !info.IsDir() {
			if f := util.FormatOf(dir); f != "" {
				p := dir
				if !seen[p] {
					seen[p] = true
					files = append(files, FileInfo{Path: p, Format: f})
				}
			}
			continue
		}
		_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				return nil
			}
			if f := util.FormatOf(path); f != "" {
				// skip hidden / partial files
				name := d.Name()
				if strings.HasPrefix(name, ".") || strings.HasPrefix(name, "~$") {
					return nil
				}
				if !seen[path] {
					seen[path] = true
					files = append(files, FileInfo{Path: path, Format: f})
				}
			}
			return nil
		})
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return files
}

// Process handles one file: hashes it, parses metadata, extracts cover.
// Returns a candidate book plus status info.
func (sc *Scanner) Process(fi FileInfo, dataDir string) (*models.Book, error) {
	size, err := util.FileSize(fi.Path)
	if err != nil {
		return nil, err
	}
	hash, err := util.HashFile(fi.Path)
	if err != nil {
		return nil, err
	}
	meta, err := parser.Parse(fi.Path, fi.Format)
	if err != nil {
		// metadata parsing failed; still add the book with filename as title
		meta = &models.BookMeta{}
	}
	book := &models.Book{
		Path:      fi.Path,
		FileName:  filepath.Base(fi.Path),
		Format:    fi.Format,
		Title:     meta.Title,
		Author:    meta.Author,
		Publisher: meta.Publisher,
		Language:  meta.Language,
		Description: meta.Description,
		Size:      size,
		Hash:      hash,
		TotalPages: meta.Pages,
	}
	if len(meta.Cover) > 0 {
		coversDir := filepath.Join(dataDir, "covers")
		_ = os.MkdirAll(coversDir, 0o755)
		coverPath := filepath.Join(coversDir, hash+meta.CoverExt)
		if err := os.WriteFile(coverPath, meta.Cover, 0o644); err == nil {
			book.CoverPath = coverPath
		}
	}
	return book, nil
}
