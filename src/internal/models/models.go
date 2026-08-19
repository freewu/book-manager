package models

// Book is the main entity stored in the database.
type Book struct {
	ID                int64   `json:"id"`
	Path              string  `json:"path"`
	FileName          string  `json:"file_name"`
	Format            string  `json:"format"`
	Title             string  `json:"title"`
	Author            string  `json:"author"`
	Publisher         string  `json:"publisher"`
	Language          string  `json:"language"`
	Description       string  `json:"description"`
	Size              int64   `json:"size"`
	Hash              string  `json:"hash"`
	CoverPath         string  `json:"cover_path"` // local cover file (may be empty)
	HasCover          bool    `json:"has_cover"`
	DoubanURL         string  `json:"douban_url"`
	DoubanRating      float64 `json:"douban_rating"`
	DoubanRatingCount int     `json:"douban_rating_count"`
	DoubanAuthors     string  `json:"douban_authors"`
	Misrecord         bool    `json:"misrecord"`
	CurrentLocation   string  `json:"current_location"` // epub cfi / pdf page / mobi position
	CurrentPage       int     `json:"current_page"`
	TotalPages        int     `json:"total_pages"`
	ReadProgress      float64 `json:"read_progress"` // 0-100
	LastReadAt        string  `json:"last_read_at"`
	TotalReadSeconds  int64   `json:"total_read_seconds"`
	NoteCount         int64   `json:"note_count"`
	Tags              []Tag   `json:"tags"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

// Tag is a user-defined label.
type Tag struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	BookCount int64  `json:"book_count"`
	CreatedAt string `json:"created_at"`
}

// Note is a user note attached to a book.
type Note struct {
	ID        int64  `json:"id"`
	BookID    int64  `json:"book_id"`
	Content   string `json:"content"`
	Location  string `json:"location"`
	Chapter   string `json:"chapter"`
	Quote     string `json:"quote"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// Misrecord is a wrongly scanned file that should be skipped on future scans.
type Misrecord struct {
	ID        int64  `json:"id"`
	Path      string `json:"path"`
	Hash      string `json:"hash"`
	FileName  string `json:"file_name"`
	Reason    string `json:"reason"`
	CreatedAt string `json:"created_at"`
}

// ReadingSession records one reading period.
type ReadingSession struct {
	ID         int64  `json:"id"`
	BookID     int64  `json:"book_id"`
	StartTime  string `json:"start_time"`
	EndTime    string `json:"end_time"`
	Seconds    int64  `json:"seconds"`
	PagesRead  int    `json:"pages_read"`
	BookTitle  string `json:"book_title"`
	BookFormat string `json:"book_format"`
}

// ScanDir is a user-configured scan directory.
type ScanDir struct {
	ID        int64  `json:"id"`
	Path      string `json:"path"`
	CreatedAt string `json:"created_at"`
}

// BookMeta is the metadata extracted from a book file.
type BookMeta struct {
	Title       string `json:"title"`
	Author      string `json:"author"`
	Publisher   string `json:"publisher"`
	Language    string `json:"language"`
	Description string `json:"description"`
	Cover       []byte `json:"cover,omitempty"` // raw cover image bytes
	CoverExt    string `json:"cover_ext,omitempty"`
	Pages       int    `json:"pages"` // page count when knowable (pdf)
}

// ScanProgress is emitted during a scan.
type ScanProgress struct {
	Current  int    `json:"current"`
	Total    int    `json:"total"`
	File     string `json:"file"`
	Status   string `json:"status"` // ok / skip / error / duplicate
	Message  string `json:"message"`
	Finished bool   `json:"finished"`
	Added    int    `json:"added"`
	Skipped  int    `json:"skipped"`
	Errors   int    `json:"errors"`
	TotalNew int    `json:"total_new"`
}

// DoubanBook is a douban search result.
type DoubanBook struct {
	Title   string  `json:"title"`
	URL     string  `json:"url"`
	Pic     string  `json:"pic"`
	Rating  float64 `json:"rating"`
	Count   int     `json:"count"`
	Author  string  `json:"author"`
	PubInfo string  `json:"pub_info"`
}

// DoubanProgress is emitted while batch-enriching books with douban info.
type DoubanProgress struct {
	Current  int    `json:"current"`
	Total    int    `json:"total"`
	Title    string `json:"title"`
	Status   string `json:"status"` // ok / skip / error
	Message  string `json:"message"`
	Finished bool   `json:"finished"`
	Ok       int    `json:"ok"`
	Errors   int    `json:"errors"`
	Skipped  int    `json:"skipped"`
}

// Settings is the key/value settings map exposed to the UI.
type Settings map[string]string

// Stats gives overview numbers for the dashboard.
type Stats struct {
	TotalBooks        int64   `json:"total_books"`
	TotalSize         int64   `json:"total_size"`
	TotalReadSeconds  int64   `json:"total_read_seconds"`
	TotalNotes        int64   `json:"total_notes"`
	TotalTags         int64   `json:"total_tags"`
	TotalMisrecords   int64   `json:"total_misrecords"`
	ReadingBooks      int64   `json:"reading_books"` // books with progress > 0
	FinishedBooks     int64   `json:"finished_books"`
	UnreadBooks       int64   `json:"unread_books"`
	FormatCounts      map[string]int64 `json:"format_counts"`
}
