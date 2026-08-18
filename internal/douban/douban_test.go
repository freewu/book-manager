package douban

import (
	"os"
	"testing"

	"bookmanager/internal/models"
)

func TestParseSearchPage(t *testing.T) {
	body, err := os.ReadFile("testdata/search_santi.html")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := extractDataJSON(body); err != nil {
		t.Fatalf("extract: %v", err)
	}
	b, err := subjectSearchFromRaw(body)
	if err != nil {
		t.Fatalf("subjectSearch: %v", err)
	}
	if b.Title == "" {
		t.Error("empty title")
	}
	if b.Rating <= 0 {
		t.Errorf("rating missing: %+v", b)
	}
	if b.Count <= 0 {
		t.Errorf("rating count missing: %+v", b)
	}
	if b.Pic == "" || b.Pic[:4] != "http" {
		t.Errorf("cover url missing: %+v", b)
	}
	if b.Author == "" {
		t.Errorf("author missing: %+v", b)
	}
}

func subjectSearchFromRaw(body []byte) (*models.DoubanBook, error) {
	raw, err := extractDataJSON(body)
	if err != nil {
		return nil, err
	}
	return parseSearchJSON(raw, "三体")
}
