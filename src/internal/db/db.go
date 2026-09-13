package db

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"bookmanager/internal/models"

	_ "modernc.org/sqlite"
)

// Tag errors returned to the UI (translated there).
var (
	ErrTagNameEmpty = errors.New("标签名不能为空")
	ErrTagExists    = errors.New("标签名已存在")
	// 批量操作
	ErrNoBooks  = errors.New("请先选择书籍")
	ErrTagMode  = errors.New("未知的标签操作方式")
	ErrBookGone = errors.New("选中的书籍已不存在，请刷新后重试")
	ErrTagGone  = errors.New("选中的标签已不存在，请刷新后重试")
)

// 批量设置标签的方式（前端直接把字符串传过来）。
const (
	TagModeAdd     = "add"     // 追加：保留原有标签
	TagModeRemove  = "remove"  // 移除：只去掉选中的标签
	TagModeReplace = "replace" // 替换：整组换成选中的标签
)

// defaultTagColor is used when a tag is created without an explicit color.
const defaultTagColor = "#6c8cff"

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
    douban_fail_count INTEGER NOT NULL DEFAULT 0,
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
    frozen INTEGER NOT NULL DEFAULT 0,
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
	if _, err := s.db.Exec(schema); err != nil {
		return err
	}
	// migrations for pre-existing databases (idempotent, ignore "duplicate column")
	_, _ = s.db.Exec(`ALTER TABLE books ADD COLUMN douban_fail_count INTEGER NOT NULL DEFAULT 0`)
	_, _ = s.db.Exec(`ALTER TABLE tags ADD COLUMN frozen INTEGER NOT NULL DEFAULT 0`)
	return nil
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
	out := []string{}
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
	out := []models.Misrecord{}
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

// TagName validates and normalizes a tag name.
func TagName(name string) (string, error) {
	n := strings.TrimSpace(name)
	if n == "" {
		return "", ErrTagNameEmpty
	}
	return n, nil
}

// tagErr maps sqlite's UNIQUE violation onto ErrTagExists.
func tagErr(err error) error {
	if err != nil && strings.Contains(strings.ToUpper(err.Error()), "UNIQUE") {
		return ErrTagExists
	}
	return err
}

func (s *Store) CreateTag(name, color string) (int64, error) {
	n, err := TagName(name)
	if err != nil {
		return 0, err
	}
	if color == "" {
		color = defaultTagColor
	}
	res, err := s.db.Exec("INSERT INTO tags(name,color) VALUES(?,?)", n, color)
	if err != nil {
		return 0, tagErr(err)
	}
	return res.LastInsertId()
}

func (s *Store) UpdateTag(id int64, name, color string) error {
	n, err := TagName(name)
	if err != nil {
		return err
	}
	if color == "" {
		color = defaultTagColor
	}
	_, err = s.db.Exec("UPDATE tags SET name=?, color=? WHERE id=?", n, color, id)
	return tagErr(err)
}

// SetTagFrozen freezes (true) or unfreezes (false) a tag. A frozen tag keeps
// its book associations but is no longer offered when tagging books.
func (s *Store) SetTagFrozen(id int64, frozen bool) error {
	v := 0
	if frozen {
		v = 1
	}
	_, err := s.db.Exec("UPDATE tags SET frozen=? WHERE id=?", v, id)
	return err
}

func (s *Store) DeleteTag(id int64) error {
	_, err := s.db.Exec("DELETE FROM tags WHERE id=?", id)
	return err
}

func (s *Store) ListTags() ([]models.Tag, error) {
	rows, err := s.db.Query(`
		SELECT t.id, t.name, t.color, t.frozen, t.created_at,
	       (SELECT COUNT(*) FROM book_tags bt WHERE bt.tag_id=t.id) AS cnt
		FROM tags t ORDER BY t.frozen, t.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Tag{}
	for rows.Next() {
		var t models.Tag
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.Frozen, &t.CreatedAt, &t.BookCount); err == nil {
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

// SetBooksTags applies one tag operation to many books in a single transaction:
//
//	add     - 给每本书加上这些标签（原有标签保留）
//	remove  - 从每本书去掉这些标签
//	replace - 把这些书的标签整组换成这些标签
//
// bookIDs 为空返回 ErrNoBooks；mode 不认识返回 ErrTagMode；
// 传进来的书/标签已经不存在时返回 ErrBookGone / ErrTagGone（整体回滚）。
func (s *Store) SetBooksTags(bookIDs, tagIDs []int64, mode string) error {
	bookIDs = uniqIDs(bookIDs)
	if len(bookIDs) == 0 {
		return ErrNoBooks
	}
	switch mode {
	case TagModeAdd, TagModeRemove, TagModeReplace:
	default:
		return ErrTagMode
	}
	tagIDs = uniqIDs(tagIDs)

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := checkIDsExist(tx, "books", bookIDs, ErrBookGone); err != nil {
		return err
	}
	if err := checkIDsExist(tx, "tags", tagIDs, ErrTagGone); err != nil {
		return err
	}

	for _, bid := range bookIDs {
		if mode == TagModeReplace {
			if _, err := tx.Exec("DELETE FROM book_tags WHERE book_id=?", bid); err != nil {
				return err
			}
		}
		for _, tid := range tagIDs {
			if mode == TagModeRemove {
				if _, err := tx.Exec("DELETE FROM book_tags WHERE book_id=? AND tag_id=?", bid, tid); err != nil {
					return err
				}
				continue
			}
			if _, err := tx.Exec("INSERT OR IGNORE INTO book_tags(book_id,tag_id) VALUES(?,?)", bid, tid); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

// uniqIDs 去重（保持顺序），批量操作里 IN 查询和计数都要靠它。
func uniqIDs(ids []int64) []int64 {
	out := make([]int64, 0, len(ids))
	seen := make(map[int64]bool, len(ids))
	for _, id := range ids {
		if id <= 0 || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// checkIDsExist 确认 ids 在表里都存在，否则返回 missing 错误（整批回滚）。
func checkIDsExist(tx *sql.Tx, table string, ids []int64, missing error) error {
	if len(ids) == 0 {
		return nil
	}
	ph := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]any, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	var n int
	if err := tx.QueryRow("SELECT COUNT(*) FROM "+table+" WHERE id IN ("+ph+")", args...).Scan(&n); err != nil {
		return err
	}
	if n != len(ids) {
		return missing
	}
	return nil
}

// BookTagIDs returns tag ids for a book.
func (s *Store) BookTagIDs(bookID int64) ([]int64, error) {
	rows, err := s.db.Query("SELECT tag_id FROM book_tags WHERE book_id=?", bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []int64{}
	for rows.Next() {
		var id int64
		if rows.Scan(&id) == nil {
			out = append(out, id)
		}
	}
	return out, nil
}
