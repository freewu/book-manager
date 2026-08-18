package douban

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"bookmanager/internal/models"
)

var client = &http.Client{
	Timeout: 15 * time.Second,
}

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

func httpGet(rawURL string) ([]byte, error) {
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json, text/javascript, */*; q=0.01")
	req.Header.Set("Referer", "https://book.douban.com/")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("douban http %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
}

// SearchByTitle looks up a book on douban by title and returns the best match.
func SearchByTitle(title string) (*models.DoubanBook, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil, fmt.Errorf("empty title")
	}
	if b, err := subjectSearch(title); err == nil && b != nil {
		return b, nil
	}
	return suggest(title)
}

// subjectSearch parses the search page's embedded __DATA__ JSON (raw or quoted).
func subjectSearch(title string) (*models.DoubanBook, error) {
	q := url.QueryEscape(title)
	body, err := httpGet("https://search.douban.com/book/subject_search?search_text=" + q + "&cat=1001")
	if err != nil {
		return nil, err
	}
	raw, err := extractDataJSON(body)
	if err != nil {
		return nil, err
	}
	return parseSearchJSON(raw, title)
}

func parseSearchJSON(raw []byte, searchTitle string) (*models.DoubanBook, error) {
	var data struct {
		Items []struct {
			Title    string `json:"title"`
			URL      string `json:"url"`
			CoverURL string `json:"cover_url"`
			TplName  string `json:"tpl_name"`
			Abstract string `json:"abstract"`
			Rating   struct {
				Value float64 `json:"value"`
				Count int     `json:"count"`
			} `json:"rating"`
		} `json:"items"`
	}
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, err
	}

	var exact *models.DoubanBook
	var first *models.DoubanBook
	clean := normalizeTitle(searchTitle)
	for _, item := range data.Items {
		if item.TplName != "search_subject" || item.Title == "" {
			continue
		}
		b := itemToDouban(item)
		if first == nil {
			first = b
		}
		if exact == nil && normalizeTitle(item.Title) == clean {
			exact = b
		}
	}
	if exact != nil {
		return exact, nil
	}
	if first != nil {
		return first, nil
	}
	return nil, fmt.Errorf("no result in subject search")
}

func itemToDouban(item struct {
	Title    string `json:"title"`
	URL      string `json:"url"`
	CoverURL string `json:"cover_url"`
	TplName  string `json:"tpl_name"`
	Abstract string `json:"abstract"`
	Rating   struct {
		Value float64 `json:"value"`
		Count int     `json:"count"`
	} `json:"rating"`
}) *models.DoubanBook {
	b := &models.DoubanBook{
		Title:  item.Title,
		URL:    item.URL,
		Pic:    item.CoverURL,
		Rating: item.Rating.Value,
		Count:  item.Rating.Count,
	}
	// abstract: "author / publisher / date / price"
	parts := strings.Split(item.Abstract, "/")
	if len(parts) > 0 {
		b.Author = strings.TrimSpace(parts[0])
	}
	if len(parts) > 1 {
		b.PubInfo = strings.TrimSpace(parts[1])
	}
	return b
}

// normalizeTitle strips common series markers for fuzzy matching.
func normalizeTitle(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " : ", " ")
	s = strings.ReplaceAll(s, "：", " ")
	re := regexp.MustCompile(`\[[^\]]*\]`)
	s = re.ReplaceAllString(s, "")
	re = regexp.MustCompile(`\s+`)
	s = re.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// extractDataJSON pulls the JSON payload out of the search page.
// The page may embed it as a raw object (window.__DATA__ = {...};) or as a
// JS string literal (window.__DATA__ = "..."). Braces inside string values
// are handled by a state machine.
func extractDataJSON(body []byte) ([]byte, error) {
	idx := bytes.Index(body, []byte("window.__DATA__"))
	if idx < 0 {
		return nil, fmt.Errorf("no __DATA__ found")
	}
	eq := bytes.IndexByte(body[idx:], '=')
	if eq < 0 {
		return nil, fmt.Errorf("no __DATA__ assignment")
	}
	start := idx + eq + 1
	for start < len(body) && (body[start] == ' ' || body[start] == '\t' || body[start] == '\n' || body[start] == '\r') {
		start++
	}
	if start >= len(body) {
		return nil, fmt.Errorf("empty __DATA__")
	}
	if body[start] == '"' {
		// quoted JS string: find the closing unescaped quote
		i := start + 1
		var sb strings.Builder
		for i < len(body) {
			c := body[i]
			if c == '\\' && i+1 < len(body) {
				sb.WriteByte(body[i+1])
				i += 2
				continue
			}
			if c == '"' {
				return []byte(sb.String()), nil
			}
			sb.WriteByte(c)
			i++
		}
		return nil, fmt.Errorf("unterminated __DATA__ string")
	}
	if body[start] == '{' {
		depth := 0
		inStr := false
		escaped := false
		for i := start; i < len(body); i++ {
			c := body[i]
			if inStr {
				if escaped {
					escaped = false
					continue
				}
				if c == '\\' {
					escaped = true
					continue
				}
				if c == '"' {
					inStr = false
				}
				continue
			}
			switch c {
			case '"':
				inStr = true
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					return body[start : i+1], nil
				}
			}
		}
		return nil, fmt.Errorf("unbalanced __DATA__ object")
	}
	return nil, fmt.Errorf("unexpected __DATA__ format")
}

// unescapeJS handles \uXXXX escapes inside the embedded JSON string.
func unescapeJS(in []byte) ([]byte, error) {
	s := string(in)
	s = strings.ReplaceAll(s, `\"`, `"`)
	s = strings.ReplaceAll(s, `\\`, `\`)
	re := regexp.MustCompile(`\\u[0-9a-fA-F]{4}`)
	s = re.ReplaceAllStringFunc(s, func(m string) string {
		var r rune
		fmt.Sscanf(m[2:], "%04x", &r)
		return string(r)
	})
	return []byte(s), nil
}

// suggest uses the fast douban suggest JSON endpoint (fallback).
func suggest(title string) (*models.DoubanBook, error) {
	q := url.QueryEscape(title)
	body, err := httpGet("https://book.douban.com/j/subject_suggest?q=" + q)
	if err != nil {
		return nil, err
	}
	var arr []struct {
		Title     string `json:"title"`
		URL       string `json:"url"`
		Pic       string `json:"pic"`
		Author    string `json:"author_name"`
		Year      string `json:"year"`
		Type      string `json:"type"`
		RatingStr string `json:"rating"`
		RateNum   string `json:"rate_num"`
	}
	if err := json.Unmarshal(body, &arr); err != nil {
		return nil, err
	}
	for _, item := range arr {
		if item.Type != "b" || item.Title == "" {
			continue
		}
		b := &models.DoubanBook{
			Title:  item.Title,
			URL:    item.URL,
			Pic:    item.Pic,
			Author: item.Author,
		}
		if f, err := strconv.ParseFloat(item.RatingStr, 64); err == nil {
			b.Rating = f
		}
		if n, err := strconv.Atoi(item.RateNum); err == nil {
			b.Count = n
		}
		return b, nil
	}
	return nil, fmt.Errorf("no result from suggest")
}

// DownloadCover fetches the cover image bytes.
func DownloadCover(picURL string) ([]byte, error) {
	if picURL == "" {
		return nil, fmt.Errorf("no cover url")
	}
	body, err := httpGet(picURL)
	if err != nil {
		return nil, err
	}
	return body, nil
}
