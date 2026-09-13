package db_test

import (
	"archive/zip"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"bookmanager/internal/db"
	"bookmanager/internal/scanner"
)

func makeTestEpub(path string) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	zw := zip.NewWriter(f)
	w, _ := zw.Create("META-INF/container.xml")
	w.Write([]byte(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`))
	w, _ = zw.Create("OEBPS/content.opf")
	w.Write([]byte(`<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>集成测试书</dc:title>
    <dc:creator>李四</dc:creator>
    <dc:publisher>测试社</dc:publisher>
  </metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`))
	w, _ = zw.Create("OEBPS/c1.xhtml")
	w.Write([]byte(`<html><body><p>hi</p></body></html>`))
	zw.Close()
	f.Close()
	return nil
}

func TestScanAndQuery(t *testing.T) {
	tmp := t.TempDir()
	dataDir := filepath.Join(tmp, "data")
	bookDir := filepath.Join(tmp, "books")
	os.MkdirAll(bookDir, 0o755)
	if err := makeTestEpub(filepath.Join(bookDir, "a.epub")); err != nil {
		t.Fatal(err)
	}

	store, err := db.Open(filepath.Join(dataDir, "book.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	sc := &scanner.Scanner{}
	files := sc.Collect([]string{bookDir})
	if len(files) != 1 {
		t.Fatalf("collect: got %d files", len(files))
	}
	book, err := sc.Process(files[0], dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if book.Title != "集成测试书" {
		t.Errorf("title=%q", book.Title)
	}
	id, isNew, err := store.UpsertScannedBook(book)
	if err != nil || !isNew {
		t.Fatalf("upsert: %v isNew=%v", err, isNew)
	}

	got, err := store.GetBook(id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "集成测试书" || got.Author != "李四" || got.Publisher != "测试社" {
		t.Errorf("book meta mismatch: %+v", got)
	}
	if got.Hash == "" || got.Size == 0 {
		t.Errorf("hash/size not recorded")
	}

	// tags
	tid, err := store.CreateTag("科幻", "#ff0000")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetBookTags(id, []int64{tid}); err != nil {
		t.Fatal(err)
	}
	books, err := store.ListBooks(db.BookQuery{TagIDs: []int64{tid}})
	if err != nil || len(books) != 1 {
		t.Fatalf("filter by tag: %v n=%d", err, len(books))
	}

	// notes
	nid, err := store.CreateNote(id, "读完了第一章", "epubcfi(/6/4)", "第一章", "测试内容")
	if err != nil {
		t.Fatal(err)
	}
	notes, _ := store.ListNotes(id)
	if len(notes) != 1 || notes[0].ID != nid {
		t.Fatalf("notes: %+v", notes)
	}

	// reading time
	total, err := store.AddReadingTime(id, 65, 3)
	if err != nil || total != 65 {
		t.Fatalf("reading time: %v %d", err, total)
	}

	// progress
	if err := store.SaveProgress(id, "epubcfi(/6/8)", 4, 10, 40); err != nil {
		t.Fatal(err)
	}
	got, _ = store.GetBook(id)
	if got.ReadProgress != 40 || got.CurrentPage != 4 {
		t.Errorf("progress not saved: %+v", got)
	}

	// misrecord
	if err := store.SetMisrecord(id, true, "测试误录"); err != nil {
		t.Fatal(err)
	}
	misPaths, _ := store.MisrecordPaths()
	if !misPaths[book.Path] {
		t.Error("misrecord path not registered")
	}
	books, _ = store.ListBooks(db.BookQuery{})
	if len(books) != 0 {
		t.Errorf("misrecorded book should be hidden, got %d", len(books))
	}
	misBooks, _ := store.ListBooks(db.BookQuery{Misrecord: true})
	if len(misBooks) != 1 {
		t.Errorf("misrecorded list should have 1, got %d", len(misBooks))
	}
	if err := store.SetMisrecord(id, false, ""); err != nil {
		t.Fatal(err)
	}
	books, _ = store.ListBooks(db.BookQuery{})
	if len(books) != 1 {
		t.Errorf("unmarked book should show again")
	}
}

func TestDuplicateScanSkips(t *testing.T) {
	tmp := t.TempDir()
	bookDir := filepath.Join(tmp, "books")
	os.MkdirAll(bookDir, 0o755)
	if err := makeTestEpub(filepath.Join(bookDir, "a.epub")); err != nil {
		t.Fatal(err)
	}
	store, _ := db.Open(filepath.Join(tmp, "data", "book.db"))
	defer store.Close()
	sc := &scanner.Scanner{}
	files := sc.Collect([]string{bookDir})
	book, _ := sc.Process(files[0], tmp)
	_, isNew, err := store.UpsertScannedBook(book)
	if err != nil || !isNew {
		t.Fatal(err)
	}
	_, isNew2, err := store.UpsertScannedBook(book)
	if err != nil || isNew2 {
		t.Fatalf("second upsert should update not insert: %v", err)
	}
}

func TestTagLifecycle(t *testing.T) {
	tmp := t.TempDir()
	bookDir := filepath.Join(tmp, "books")
	os.MkdirAll(bookDir, 0o755)
	if err := makeTestEpub(filepath.Join(bookDir, "a.epub")); err != nil {
		t.Fatal(err)
	}
	store, err := db.Open(filepath.Join(tmp, "data", "book.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	sc := &scanner.Scanner{}
	files := sc.Collect([]string{bookDir})
	book, _ := sc.Process(files[0], tmp)
	bid, _, err := store.UpsertScannedBook(book)
	if err != nil {
		t.Fatal(err)
	}

	// 新建：空名 / 纯空格名被拒
	if _, err := store.CreateTag("   ", "#fff"); err != db.ErrTagNameEmpty {
		t.Fatalf("blank name: %v", err)
	}
	// 默认颜色
	plain, err := store.CreateTag("默认色", "")
	if err != nil {
		t.Fatal(err)
	}
	tags, _ := store.ListTags()
	for _, tg := range tags {
		if tg.ID == plain && tg.Color != "#6c8cff" {
			t.Fatalf("default color: %q", tg.Color)
		}
	}

	// 重名（含前后空格被 trim 后重名）被拒
	if _, err := store.CreateTag("默认色", "#111111"); err != db.ErrTagExists {
		t.Fatalf("duplicate create: %v", err)
	}
	if _, err := store.CreateTag("  默认色 ", "#111111"); err != db.ErrTagExists {
		t.Fatalf("duplicate create (trimmed): %v", err)
	}

	tid, err := store.CreateTag(" 科幻 ", "#ff0000")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetBookTags(bid, []int64{tid}); err != nil {
		t.Fatal(err)
	}

	// 改名换色（会 trim）+ 数量
	if err := store.UpdateTag(tid, " 硬科幻 ", "#00ff00"); err != nil {
		t.Fatal(err)
	}
	tags, _ = store.ListTags()
	var found bool
	for _, tg := range tags {
		if tg.ID == tid {
			found = true
			if tg.Name != "硬科幻" || tg.Color != "#00ff00" || tg.BookCount != 1 || tg.Frozen {
				t.Fatalf("after update: %+v", tg)
			}
		}
	}
	if !found {
		t.Fatal("tag missing after update")
	}

	// 改名撞已有标签
	if err := store.UpdateTag(tid, "默认色", "#00ff00"); err != db.ErrTagExists {
		t.Fatalf("duplicate rename: %v", err)
	}
	if err := store.UpdateTag(tid, "", "#00ff00"); err != db.ErrTagNameEmpty {
		t.Fatalf("blank rename: %v", err)
	}

	// 冻结 / 解冻：保留打标关系，ListTags 里 frozen 排后面
	if err := store.SetTagFrozen(tid, true); err != nil {
		t.Fatal(err)
	}
	got, _ := store.GetBook(bid)
	if len(got.Tags) != 1 || !got.Tags[0].Frozen {
		t.Fatalf("book tag frozen flag: %+v", got.Tags)
	}
	tags, _ = store.ListTags()
	if len(tags) < 2 || tags[0].ID == tid {
		t.Fatalf("frozen tag should be listed last: %+v", tags)
	}
	if err := store.SetTagFrozen(tid, false); err != nil {
		t.Fatal(err)
	}
	got, _ = store.GetBook(bid)
	if got.Tags[0].Frozen {
		t.Fatal("unfreeze failed")
	}

	// 删除：关联一起消失
	if err := store.DeleteTag(tid); err != nil {
		t.Fatal(err)
	}
	got, _ = store.GetBook(bid)
	if len(got.Tags) != 0 {
		t.Fatalf("book_tags should cascade: %+v", got.Tags)
	}
	if books, _ := store.ListBooks(db.BookQuery{TagIDs: []int64{tid}}); len(books) != 0 {
		t.Fatalf("filter by deleted tag: %d", len(books))
	}
}

// 老库（没有 frozen 列）打开后要能自动补列。
func TestTagFrozenMigration(t *testing.T) {
	tmp := t.TempDir()
	dbPath := filepath.Join(tmp, "data", "book.db")
	os.MkdirAll(filepath.Dir(dbPath), 0o755)
	raw, err := sql.Open("sqlite", "file:"+dbPath)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`CREATE TABLE tags (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL UNIQUE,
		color TEXT NOT NULL DEFAULT '#6c8cff',
		created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')))`); err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec("INSERT INTO tags(name,color) VALUES('旧标签','#123456')"); err != nil {
		t.Fatal(err)
	}
	raw.Close()

	store, err := db.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	tags, err := store.ListTags()
	if err != nil {
		t.Fatal(err)
	}
	if len(tags) != 1 || tags[0].Name != "旧标签" || tags[0].Frozen {
		t.Fatalf("migrated tags: %+v", tags)
	}
	if err := store.SetTagFrozen(tags[0].ID, true); err != nil {
		t.Fatal(err)
	}
}
