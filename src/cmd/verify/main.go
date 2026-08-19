// Command verify exercises the full scan pipeline (collect → parse → store)
// exactly as the app does, for end-to-end verification.
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"bookmanager/internal/db"
	"bookmanager/internal/scanner"
)

func main() {
	dataDir := os.Args[1]
	bookDirs := os.Args[2:]

	os.MkdirAll(filepath.Join(dataDir, "covers"), 0o755)
	store, err := db.Open(filepath.Join(dataDir, "book.db"))
	if err != nil {
		fmt.Println("DB ERROR:", err)
		os.Exit(1)
	}
	defer store.Close()

	sc := &scanner.Scanner{}
	files := sc.Collect(bookDirs)
	fmt.Printf("found %d ebook files\n", len(files))

	added := 0
	for _, fi := range files {
		book, err := sc.Process(fi, dataDir)
		if err != nil {
			fmt.Printf("  [err] %s: %v\n", fi.Path, err)
			continue
		}
		id, isNew, err := store.UpsertScannedBook(book)
		if err != nil {
			fmt.Printf("  [db-err] %s: %v\n", fi.Path, err)
			continue
		}
		if isNew {
			added++
		}
		fmt.Printf("  [%s] id=%d title=%q author=%q publisher=%q cover=%v pages=%d size=%d\n",
			fi.Format, id, book.Title, book.Author, book.Publisher,
			book.CoverPath != "", book.TotalPages, book.Size)
	}
	fmt.Printf("added %d books\n", added)

	books, err := store.ListBooks(db.BookQuery{})
	if err != nil {
		fmt.Println("LIST ERROR:", err)
		os.Exit(1)
	}
	fmt.Printf("query returned %d books:\n", len(books))
	for _, b := range books {
		fmt.Printf("  - %s | %s | %s | %.1f%%\n", b.Title, b.Author, b.Format, b.ReadProgress)
	}
}
