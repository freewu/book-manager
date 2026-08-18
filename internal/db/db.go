package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"bookmanager/internal/models"

	_ "modernc.org/sqlite"
)

// Store wraps the sqlite database.
type Store struct {
	db   *sql.DB
	path string
	mu   sync.Mutex
}

// Open opens (creating if needed) the sqlite database at the given path.
func Open(dbPath string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, err
	}
	dsn := fmt.Sprintf("file:%s?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		return nil, err
	}
	s := &Store{db: db, path: dbPath}
	if err := s.migrate(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) Path() string { return s.path }

const schema = `
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL DEFAULT '',
    format TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    publisher TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL DEFAULT 0,
    hash TEXT NOT NULL DEFAULT '',
    cover_path TEXT NOT NULL DEFAULT '',
    douban_url TEXT NOT NULL DEFAULT '',
    douban_rating REAL NOT NULL DEFAULT 0,
    douban_rating_count INTEGER NOT NULL DEFAULT 0,
    douban_authors TEXT NOT NULL DEFAULT '',
    misrecord INTEGER NOT NULL DEFAULT 0,
    current_location TEXT NOT NULL DEFAULT '',
    current_page INTEGER NOT NULL DEFAULT 0,
    total_pages INTEGER NOT NULL DEFAULT 0,
    read_progress REAL NOT NULL DEFAULT 0,
    last_read_at TEXT NOT NULL DEFAULT '',
    total_read_seconds INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author);
CREATE INDEX IF NOT EXISTS idx_books_format ON books(format);
CREATE INDEX IF NOT EXISTS idx_books_misrecord ON books(misrecord);

CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL DEFAULT '#6c8cff',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS book_tags (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    chapter TEXT NOT NULL DEFAULT '',
    quote TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_notes_book ON notes(book_id);

CREATE TABLE IF NOT EXISTS reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    start_time TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    end_time TEXT NOT NULL DEFAULT '',
    seconds INTEGER NOT NULL DEFAULT 0,
    pages_read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_book ON reading_sessions(book_id);

CREATE TABLE IF NOT EXISTS misrecords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS scan_dirs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
`

func (s *Store) migrate() error {
	_, err := s.db.Exec(schema)
	return err
}

func (s *Store) DB() *sql.DB { return s.db }

// ---------- helpers ----------

func (s *Store) now() string {
	var v string
	_ = s.db.QueryRow("SELECT datetime('now','localtime')").Scan(&v)
	return v
}

// GetSetting / SetSetting read and write the settings table.
func (s *Store) GetSetting(key, def string) string {
	var v string
	err := s.db.QueryRow("SELECT value FROM settings WHERE key=?", key).Scan(&v)
	if err != nil {
		return def
	}
	return v
}

func (s *Store) SetSetting(key, value string) error {
	_, err := s.db.Exec(
		"INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
		key, value)
	return err
}

func (s *Store) AllSettings() map[string]string {
	out := map[string]string{}
	rows, err := s.db.Query("SELECT key,value FROM settings")
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if rows.Scan(&k, &v) == nil {
			out[k] = v
		}
	}
	return out
}

// ---------- scan dirs ----------

func (s *Store) ListScanDirs() []string {
	var out []string
	rows, err := s.db.Query("SELECT path FROM scan_dirs ORDER BY id")
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		if rows.Scan(&p) == nil {
			out = append(out, p)
		}
	}
	return out
}

func (s *Store) AddScanDir(path string) error {
	_, err := s.db.Exec("INSERT OR IGNORE INTO scan_dirs(path) VALUES(?)", path)
	return err
}

func (s *Store) RemoveScanDir(path string) error {
	_, err := s.db.Exec("DELETE FROM scan_dirs WHERE path=?", path)
	return err
}

// ---------- misrecords ----------

// MisrecordPaths returns a set of misrecorded paths.
func (s *Store) MisrecordPaths() (map[string]bool, error) {
	out := map[string]bool{}
	rows, err := s.db.Query("SELECT path FROM misrecords")
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		if rows.Scan(&p) == nil {
			out[p] = true
		}
	}
	return out, nil
}

// MisrecordHashes returns a set of misrecorded hashes.
func (s *Store) MisrecordHashes() (map[string]bool, error) {
	out := map[string]bool{}
	rows, err := s.db.Query("SELECT hash FROM misrecords WHERE hash != ''")
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var p string
		if rows.Scan(&p) == nil {
			out[p] = true
		}
	}
	return out, nil
}

func (s *Store) AddMisrecord(path, hash, fileName, reason string) error {
	_, err := s.db.Exec(
		"INSERT OR IGNORE INTO misrecords(path,hash,file_name,reason) VALUES(?,?,?,?)",
		path, hash, fileName, reason)
	return err
}

func (s *Store) RemoveMisrecord(id int64) error {
	_, err := s.db.Exec("DELETE FROM misrecords WHERE id=?", id)
	return err
}

func (s *Store) ClearMisrecords() error {
	_, err := s.db.Exec("DELETE FROM misrecords")
	return err
}

func (s *Store) ListMisrecords() ([]models.Misrecord, error) {
	rows, err := s.db.Query("SELECT id,path,hash,file_name,reason,created_at FROM misrecords ORDER BY id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Misrecord
	for rows.Next() {
		var m models.Misrecord
		if err := rows.Scan(&m.ID, &m.Path, &m.Hash, &m.FileName, &m.Reason, &m.CreatedAt); err == nil {
			out = append(out, m)
		}
	}
	return out, nil
}

func (s *Store) MisrecordCount() (int64, error) {
	var n int64
	err := s.db.QueryRow("SELECT COUNT(*) FROM misrecords").Scan(&n)
	return n, err
}

// ---------- statistics ----------

func (s *Store) Stats() (modelsStats, error) {
	var st modelsStats
	st.FormatCounts = map[string]int64{}
	if err := s.db.QueryRow("SELECT COUNT(*), COALESCE(SUM(size),0), COALESCE(SUM(total_read_seconds),0) FROM books WHERE misrecord=0").
		Scan(&st.TotalBooks, &st.TotalSize, &st.TotalReadSeconds); err != nil {
		return st, err
	}
	_ = s.db.QueryRow("SELECT COUNT(*) FROM notes").Scan(&st.TotalNotes)
	_ = s.db.QueryRow("SELECT COUNT(*) FROM tags").Scan(&st.TotalTags)
	_ = s.db.QueryRow("SELECT COUNT(*) FROM misrecords").Scan(&st.TotalMisrecords)
	_ = s.db.QueryRow("SELECT COUNT(*) FROM books WHERE misrecord=0 AND read_progress > 0 AND read_progress < 99.5").Scan(&st.ReadingBooks)
	_ = s.db.QueryRow("SELECT COUNT(*) FROM books WHERE misrecord=0 AND read_progress >= 99.5").Scan(&st.FinishedBooks)
	_ = s.db.QueryRow("SELECT COUNT(*) FROM books WHERE misrecord=0 AND read_progress = 0").Scan(&st.UnreadBooks)
	rows, err := s.db.Query("SELECT format, COUNT(*) FROM books WHERE misrecord=0 GROUP BY format")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var f string
			var n int64
			if rows.Scan(&f, &n) == nil {
				st.FormatCounts[f] = n
			}
		}
	}
	return st, nil
}

// aliases to avoid import cycles
type modelsMisrecord = struct {
	ID        int64
	Path      string
	Hash      string
	FileName  string
	Reason    string
	CreatedAt string
}

type modelsStats = struct {
	TotalBooks       int64
	TotalSize        int64
	TotalReadSeconds int64
	TotalNotes       int64
	TotalTags        int64
	TotalMisrecords  int64
	ReadingBooks     int64
	FinishedBooks    int64
	UnreadBooks      int64
	FormatCounts     map[string]int64
}

// ---------- tags ----------

func (s *Store) CreateTag(name, color string) (int64, error) {
	if color == "" {
		color = "#6c8cff"
	}
	res, err := s.db.Exec("INSERT INTO tags(name,color) VALUES(?,?)", strings.TrimSpace(name), color)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) UpdateTag(id int64, name, color string) error {
	_, err := s.db.Exec("UPDATE tags SET name=?, color=?, updated_at=datetime('now','localtime') WHERE id=?", name, color, id)
	return err
}

func (s *Store) DeleteTag(id int64) error {
	_, err := s.db.Exec("DELETE FROM tags WHERE id=?", id)
	return err
}

func (s *Store) ListTags() ([]models.Tag, error) {
	rows, err := s.db.Query(`
		SELECT t.id, t.name, t.color, t.created_at,
	       (SELECT COUNT(*) FROM book_tags bt WHERE bt.tag_id=t.id) AS cnt
		FROM tags t ORDER BY t.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Tag
	for rows.Next() {
		var t models.Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.CreatedAt, &t.BookCount); err == nil {
			out = append(out, t)
		}
	}
	return out, nil
}

// SetBookTags replaces the tag set of a book.
func (s *Store) SetBookTags(bookID int64, tagIDs []int64) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec("DELETE FROM book_tags WHERE book_id=?", bookID); err != nil {
		return err
	}
	for _, tid := range tagIDs {
		if _, err := tx.Exec("INSERT OR IGNORE INTO book_tags(book_id,tag_id) VALUES(?,?)", bookID, tid); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// BookTagIDs returns tag ids for a book.
func (s *Store) BookTagIDs(bookID int64) ([]int64, error) {
	rows, err := s.db.Query("SELECT tag_id FROM book_tags WHERE book_id=?", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			out = append(out, id)
		}
	}
	return out, nil
}
