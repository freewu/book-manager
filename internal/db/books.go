package db

import (
	"database/sql"
	"fmt"
	"strings"

	"bookmanager/internal/models"
)

// BookQuery filters for listing books.
type BookQuery struct {
	Keyword   string   // search title/author/publisher/file_name
	Formats   []string // restrict to these formats (empty = all)
	TagIDs    []int64  // books must have ALL these tags
	Sort      string   // title | author | created | updated | last_read | rating | size
	Desc      bool
	Misrecord bool // include misrecorded books only (used by misrecord manager)
	NoDouban  bool // only books without douban data (for enrichment)
	Limit     int
	Offset    int
}

const bookCols = `b.id, b.path, b.file_name, b.format, b.title, b.author, b.publisher, b.language,
	b.description, b.size, b.hash, b.cover_path, b.douban_url, b.douban_rating,
	b.douban_rating_count, b.douban_authors, b.misrecord, b.current_location, b.current_page,
	b.total_pages, b.read_progress, b.last_read_at, b.total_read_seconds,
	(SELECT COUNT(*) FROM notes n WHERE n.book_id = b.id),
	b.created_at, b.updated_at`

func scanBook(row interface{ Scan(...any) error }) (models.Book, error) {
	var b models.Book
	var mis int
	err := row.Scan(&b.ID, &b.Path, &b.FileName, &b.Format, &b.Title, &b.Author, &b.Publisher,
		&b.Language, &b.Description, &b.Size, &b.Hash, &b.CoverPath, &b.DoubanURL,
		&b.DoubanRating, &b.DoubanRatingCount, &b.DoubanAuthors, &mis, &b.CurrentLocation,
		&b.CurrentPage, &b.TotalPages, &b.ReadProgress, &b.LastReadAt, &b.TotalReadSeconds,
		&b.NoteCount, &b.CreatedAt, &b.UpdatedAt)
	b.Misrecord = mis == 1
	b.HasCover = b.CoverPath != ""
	return b, err
}

// ListBooks returns books matching the query.
func (s *Store) ListBooks(q BookQuery) ([]models.Book, error) {
	var conds []string
	var args []any
	if !q.Misrecord {
		conds = append(conds, "b.misrecord=0")
	} else {
		conds = append(conds, "b.misrecord=1")
	}
	if q.NoDouban {
		conds = append(conds, "(b.douban_url='' AND b.douban_rating=0)")
	}
	if q.Keyword != "" {
		kw := "%" + strings.ToLower(q.Keyword) + "%"
		conds = append(conds, "(LOWER(b.title) LIKE ? OR LOWER(b.author) LIKE ? OR LOWER(b.publisher) LIKE ? OR LOWER(b.file_name) LIKE ?)")
		args = append(args, kw, kw, kw, kw)
	}
	if len(q.Formats) > 0 {
		placeholders := strings.Repeat("?,", len(q.Formats))
		placeholders = placeholders[:len(placeholders)-1]
		conds = append(conds, fmt.Sprintf("b.format IN (%s)", placeholders))
		for _, f := range q.Formats {
			args = append(args, f)
		}
	}
	if len(q.TagIDs) > 0 {
		for _, tid := range q.TagIDs {
			conds = append(conds, "EXISTS (SELECT 1 FROM book_tags bt WHERE bt.book_id=b.id AND bt.tag_id=?)")
			args = append(args, tid)
		}
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}
	sortCol := map[string]string{
		"title":     "b.title COLLATE NOCASE",
		"author":    "b.author COLLATE NOCASE",
		"created":   "b.id",
		"updated":   "b.updated_at",
		"last_read": "b.last_read_at",
		"rating":    "b.douban_rating",
		"size":      "b.size",
	}[q.Sort]
	if sortCol == "" {
		sortCol = "b.id"
	}
	order := "ASC"
	if q.Desc {
		order = "DESC"
	}
	limit := q.Limit
	if limit <= 0 {
		limit = 100000
	}
	if q.Offset < 0 {
		q.Offset = 0
	}
	query := fmt.Sprintf(`SELECT %s FROM books b%s ORDER BY %s %s LIMIT ? OFFSET ?`, bookCols, where, sortCol, order)
	args = append(args, limit, q.Offset)
	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Book
	for rows.Next() {
		b, err := scanBook(rows)
		if err != nil {
			return nil, err
		}
		tags, _ := s.tagsForBook(b.ID)
		b.Tags = tags
		out = append(out, b)
	}
	return out, nil
}

// GetBook returns a single book by id.
func (s *Store) GetBook(id int64) (*models.Book, error) {
	row := s.db.QueryRow(fmt.Sprintf(`SELECT %s FROM books b WHERE b.id=?`, bookCols), id)
	b, err := scanBook(row)
	if err != nil {
		return nil, err
	}
	tags, _ := s.tagsForBook(b.ID)
	b.Tags = tags
	return &b, nil
}

// GetBookByPath returns a book by file path.
func (s *Store) GetBookByPath(path string) (*models.Book, error) {
	row := s.db.QueryRow(fmt.Sprintf(`SELECT %s FROM books b WHERE b.path=?`, bookCols), path)
	b, err := scanBook(row)
	if err != nil {
		return nil, err
	}
	return &b, nil
}

func (s *Store) tagsForBook(bookID int64) ([]models.Tag, error) {
	rows, err := s.db.Query(`
		SELECT t.id, t.name, t.color, t.created_at, 0
		FROM tags t JOIN book_tags bt ON bt.tag_id=t.id
		WHERE bt.book_id=? ORDER BY t.name`, bookID)
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

// UpsertScannedBook inserts a newly scanned book or updates an existing one.
// It never overwrites enriched metadata (douban info / title edits) unless force.
func (s *Store) UpsertScannedBook(b *models.Book) (int64, bool, error) {
	existing, err := s.GetBookByPath(b.Path)
	if err != nil && err != sql.ErrNoRows {
		return 0, false, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if existing != nil {
		// update file facts only
		_, err := s.db.Exec(`UPDATE books SET size=?, hash=?, format=?, updated_at=datetime('now','localtime') WHERE id=?`,
			b.Size, b.Hash, b.Format, existing.ID)
		return existing.ID, false, err
	}
	res, err := s.db.Exec(`INSERT INTO books
		(path,file_name,format,title,author,publisher,language,description,size,hash,cover_path,total_pages)
		VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
		b.Path, b.FileName, b.Format, b.Title, b.Author, b.Publisher, b.Language,
		b.Description, b.Size, b.Hash, b.CoverPath, b.TotalPages)
	if err != nil {
		return 0, false, err
	}
	id, _ := res.LastInsertId()
	return id, true, nil
}

// UpdateBookMeta updates editable book fields.
func (s *Store) UpdateBookMeta(id int64, title, author, publisher, description string) error {
	_, err := s.db.Exec(`UPDATE books SET title=?, author=?, publisher=?, description=?,
		updated_at=datetime('now','localtime') WHERE id=?`, title, author, publisher, description, id)
	return err
}

// UpdateDoubanInfo stores douban enriched data.
func (s *Store) UpdateDoubanInfo(id int64, url string, rating float64, count int, authors string, coverPath string) error {
	_, err := s.db.Exec(`UPDATE books SET douban_url=?, douban_rating=?, douban_rating_count=?, douban_authors=?, cover_path=?,
		updated_at=datetime('now','localtime') WHERE id=?`, url, rating, count, authors, coverPath, id)
	return err
}

// UpdateCover sets the local cover path.
func (s *Store) UpdateCover(id int64, coverPath string) error {
	_, err := s.db.Exec(`UPDATE books SET cover_path=?, updated_at=datetime('now','localtime') WHERE id=?`, coverPath, id)
	return err
}

// SetMisrecord marks/unmarks a book as mis-recorded.
func (s *Store) SetMisrecord(id int64, mis bool, reason string) error {
	v := 0
	if mis {
		v = 1
	}
	_, err := s.db.Exec(`UPDATE books SET misrecord=?, updated_at=datetime('now','localtime') WHERE id=?`, v, id)
	if err != nil {
		return err
	}
	if mis {
		b, err := s.GetBook(id)
		if err == nil {
			_ = s.AddMisrecord(b.Path, b.Hash, b.FileName, reason)
		}
	} else {
		b, err := s.GetBook(id)
		if err == nil {
			_, _ = s.db.Exec("DELETE FROM misrecords WHERE path=?", b.Path)
		}
	}
	return nil
}

// DeleteBook removes a book row (and cascading rows).
func (s *Store) DeleteBook(id int64) error {
	_, err := s.db.Exec("DELETE FROM books WHERE id=?", id)
	return err
}

// CountBooks counts non-misrecorded books.
func (s *Store) CountBooks() (int64, error) {
	var n int64
	err := s.db.QueryRow("SELECT COUNT(*) FROM books WHERE misrecord=0").Scan(&n)
	return n, err
}

// ---------- notes ----------

func (s *Store) CreateNote(bookID int64, content, location, chapter, quote string) (int64, error) {
	res, err := s.db.Exec(`INSERT INTO notes(book_id,content,location,chapter,quote) VALUES(?,?,?,?,?)`,
		bookID, content, location, chapter, quote)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}

func (s *Store) UpdateNote(id int64, content string) error {
	_, err := s.db.Exec(`UPDATE notes SET content=?, updated_at=datetime('now','localtime') WHERE id=?`, content, id)
	return err
}

func (s *Store) DeleteNote(id int64) error {
	_, err := s.db.Exec("DELETE FROM notes WHERE id=?", id)
	return err
}

func (s *Store) ListNotes(bookID int64) ([]models.Note, error) {
	rows, err := s.db.Query(`SELECT id,book_id,content,location,chapter,quote,created_at,updated_at
		FROM notes WHERE book_id=? ORDER BY id DESC`, bookID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Note
	for rows.Next() {
		var n models.Note
		if err := rows.Scan(&n.ID, &n.BookID, &n.Content, &n.Location, &n.Chapter, &n.Quote, &n.CreatedAt, &n.UpdatedAt); err == nil {
			out = append(out, n)
		}
	}
	return out, nil
}

// ---------- reading ----------

// SaveProgress persists the reading position of a book.
func (s *Store) SaveProgress(id int64, location string, page, totalPages int, progress float64) error {
	_, err := s.db.Exec(`UPDATE books SET current_location=?, current_page=?, total_pages=?,
		read_progress=?, last_read_at=datetime('now','localtime'), updated_at=datetime('now','localtime')
		WHERE id=?`, location, page, totalPages, progress, id)
	return err
}

// AddReadingTime adds seconds to a book's total and to the current session.
// Returns the updated total.
func (s *Store) AddReadingTime(bookID int64, seconds int64, page int) (int64, error) {
	if seconds <= 0 {
		var total int64
		_ = s.db.QueryRow("SELECT total_read_seconds FROM books WHERE id=?", bookID).Scan(&total)
		return total, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()
	// find today's session
	var sessionID int64
	row := tx.QueryRow(`SELECT id FROM reading_sessions WHERE book_id=? AND date(start_time)=date('now','localtime') ORDER BY id DESC LIMIT 1`, bookID)
	if err := row.Scan(&sessionID); err != nil {
		res, err := tx.Exec(`INSERT INTO reading_sessions(book_id,start_time,seconds,pages_read) VALUES(?,datetime('now','localtime'),?,0)`, bookID, seconds)
		if err != nil {
			return 0, err
		}
		sessionID, _ = res.LastInsertId()
	} else {
		if _, err := tx.Exec(`UPDATE reading_sessions SET seconds=seconds+?, end_time=datetime('now','localtime') WHERE id=?`, seconds, sessionID); err != nil {
			return 0, err
		}
	}
	var total int64
	if err := tx.QueryRow(`UPDATE books SET total_read_seconds=total_read_seconds+?, updated_at=datetime('now','localtime') WHERE id=? RETURNING total_read_seconds`, seconds, bookID).Scan(&total); err != nil {
		// fallback for older sqlite without RETURNING
		if _, err := tx.Exec(`UPDATE books SET total_read_seconds=total_read_seconds+?, updated_at=datetime('now','localtime') WHERE id=?`, seconds, bookID); err != nil {
			return 0, err
		}
		_ = tx.QueryRow("SELECT total_read_seconds FROM books WHERE id=?", bookID).Scan(&total)
	}
	return total, tx.Commit()
}

// ListReadingSessions returns reading history (recent first).
func (s *Store) ListReadingSessions(limit int) ([]models.ReadingSession, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := s.db.Query(`SELECT rs.id, rs.book_id, rs.start_time, rs.end_time, rs.seconds, rs.pages_read,
		b.title, b.format FROM reading_sessions rs JOIN books b ON b.id=rs.book_id
		ORDER BY rs.id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ReadingSession
	for rows.Next() {
		var r models.ReadingSession
		if err := rows.Scan(&r.ID, &r.BookID, &r.StartTime, &r.EndTime, &r.Seconds, &r.PagesRead, &r.BookTitle, &r.BookFormat); err == nil {
			out = append(out, r)
		}
	}
	return out, nil
}
