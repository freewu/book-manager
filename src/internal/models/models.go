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
	DoubanFailCount   int     `json:"douban_fail_count"` // consecutive auto-enrich failures (>=3 stops retries)
	CurrentLocation   string  `json:"current_location"`  // epub cfi / pdf page / mobi position
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

// PdfFileInfo describes a PDF file for the 「设置密码」 tool.
type PdfFileInfo struct {
	Path      string `json:"path"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	Pages     int    `json:"pages"`
	Title     string `json:"title"`
	Encrypted bool   `json:"encrypted"`
	// NeedsPassword is true when the file is encrypted and the supplied
	// current password did not open it (the UI then asks for it).
	NeedsPassword bool `json:"needs_password"`
}

// PdfProtectOptions is the input of the 「设置密码」 tool. BookID selects a
// book from the shelf (its path is used instead of Path); Path is used for
// files picked from disk directly.
type PdfProtectOptions struct {
	BookID int64  `json:"book_id"`
	Path   string `json:"path"`
	// UserPassword is required to open the file, OwnerPassword protects
	// permission changes (defaults to UserPassword).
	UserPassword  string `json:"user_password"`
	OwnerPassword string `json:"owner_password"`
	// CurrentPassword opens an already encrypted file.
	CurrentPassword string `json:"current_password"`
	// Strength is aes256 (default) / aes128 / rc4128.
	Strength   string `json:"strength"`
	AllowPrint bool   `json:"allow_print"`
	AllowCopy  bool   `json:"allow_copy"`
}

// PdfToEpubOptions is the input of the 「转存 EPUB」 tool: it converts a PDF
// into an EPUB in OutDir/FileName. BookID selects a book from the shelf (its
// path is used instead of Path); Path is used for files picked from disk.
type PdfToEpubOptions struct {
	BookID int64  `json:"book_id"`
	Path   string `json:"path"`
	// Password opens an already encrypted PDF.
	Password string `json:"password"`
	// OutDir is the target directory; empty means the directory of the PDF.
	OutDir string `json:"out_dir"`
	// FileName is the target file name (without extension); empty means the
	// name of the PDF.
	FileName string `json:"file_name"`
	// Title / Author override the metadata written into the EPUB.
	Title  string `json:"title"`
	Author string `json:"author"`
	// Language is the EPUB language code; empty means zh.
	Language string `json:"language"`
	// UseCover embeds the first page as the cover image.
	UseCover bool `json:"use_cover"`
	// AddToShelf imports the result into the library when it is done.
	AddToShelf bool `json:"add_to_shelf"`
}

// PdfToEpubResult reports what the conversion produced. NeedsPassword and
// NoText are data, not errors: the UI asks for the password / explains that
// the PDF has no text layer.
type PdfToEpubResult struct {
	Path          string `json:"path"`
	FileName      string `json:"file_name"`
	Pages         int    `json:"pages"`
	Chars         int    `json:"chars"`
	Bytes         int64  `json:"bytes"`
	NeedsPassword bool   `json:"needs_password"`
	NoText        bool   `json:"no_text"`
	// Dropped counts header/footer lines that were removed.
	Dropped int `json:"dropped"`
	// Added is true when the EPUB was imported into the library, BookID is
	// its id then; ShelfError explains why the import was skipped.
	Added      bool   `json:"added"`
	BookID     int64  `json:"book_id"`
	ShelfError string `json:"shelf_error"`
}

// PdfToEpubProgress is emitted on the pdf2epub:progress event while a PDF is
// converted page by page.
type PdfToEpubProgress struct {
	Current int `json:"current"`
	Total   int `json:"total"`
	Chars   int `json:"chars"`
}

// EpubFileInfo describes an EPUB picked from disk or from the shelf, so the
// 「转存 PDF」 wizard can show what it is about to convert.
type EpubFileInfo struct {
	Path     string `json:"path"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	Title    string `json:"title"`
	Author   string `json:"author"`
	Language string `json:"language"`
	Chapters int    `json:"chapters"`
	Chars    int    `json:"chars"`
	HasCover bool   `json:"has_cover"`
}

// EpubToPdfOptions is the input of the 「转存 PDF」 tool: it typesets an EPUB
// into a PDF in OutDir/FileName. BookID selects a book from the shelf (its path
// is used instead of Path); Path is used for files picked from disk.
type EpubToPdfOptions struct {
	BookID int64  `json:"book_id"`
	Path   string `json:"path"`
	// OutDir is the target directory; empty means the directory of the EPUB.
	OutDir string `json:"out_dir"`
	// FileName is the target file name (without extension); empty means the
	// name of the EPUB.
	FileName string `json:"file_name"`
	// Title / Author override the metadata written into the PDF.
	Title  string `json:"title"`
	Author string `json:"author"`
	// Language is only informative; the PDF font is picked from the text.
	Language string `json:"language"`
	// PageSize is one of A4 / A5 / B5 / 16K / LETTER; empty means A4.
	PageSize string `json:"page_size"`
	// UseCover adds a cover page with the EPUB cover image.
	UseCover bool `json:"use_cover"`
	// AddToShelf imports the result into the library when it is done.
	AddToShelf bool `json:"add_to_shelf"`
}

// EpubToPdfResult reports what the conversion produced. NoText is data, not an
// error: the UI explains that the EPUB holds no readable text.
type EpubToPdfResult struct {
	Path     string `json:"path"`
	FileName string `json:"file_name"`
	Pages    int    `json:"pages"`
	Chars    int    `json:"chars"`
	Chapters int    `json:"chapters"`
	Bytes    int64  `json:"bytes"`
	NoText   bool   `json:"no_text"`
	// Added is true when the PDF was imported into the library, BookID is its
	// id then; ShelfError explains why the import was skipped.
	Added      bool   `json:"added"`
	BookID     int64  `json:"book_id"`
	ShelfError string `json:"shelf_error"`
}

// EpubToPdfProgress is emitted on the epub2pdf:progress event while an EPUB is
// typeset chapter by chapter.
type EpubToPdfProgress struct {
	Current int `json:"current"`
	Total   int `json:"total"`
	Chars   int `json:"chars"`
}

// Settings is the key/value settings map exposed to the UI.
type Settings map[string]string

// Stats gives overview numbers for the dashboard.
type Stats struct {
	TotalBooks       int64            `json:"total_books"`
	TotalSize        int64            `json:"total_size"`
	TotalReadSeconds int64            `json:"total_read_seconds"`
	TotalNotes       int64            `json:"total_notes"`
	TotalTags        int64            `json:"total_tags"`
	TotalMisrecords  int64            `json:"total_misrecords"`
	ReadingBooks     int64            `json:"reading_books"` // books with progress > 0
	FinishedBooks    int64            `json:"finished_books"`
	UnreadBooks      int64            `json:"unread_books"`
	FormatCounts     map[string]int64 `json:"format_counts"`
}
