package parser

import (
	"bytes"
	"encoding/hex"
	"os"
	"regexp"
	"strings"
	"unicode/utf16"

	"bookmanager/internal/models"
)

// ParsePDF extracts metadata and page count from a PDF file.
// It uses a tolerant regex approach over the file's byte ranges (no heavy deps).
func ParsePDF(filePath string, meta *models.BookMeta) error {
	st, err := os.Stat(filePath)
	if err != nil {
		return err
	}
	size := st.Size()
	headLen := int64(256 * 1024)
	tailLen := int64(256 * 1024)
	if size < headLen+tailLen {
		headLen = size
		tailLen = 0
	}
	head := make([]byte, headLen)
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.Read(head); err != nil {
		return err
	}
	var tail []byte
	if tailLen > 0 {
		tail = make([]byte, tailLen)
		if _, err := f.ReadAt(tail, size-tailLen); err != nil {
			return err
		}
	}
	data := append(head, tail...)

	info := extractInfoDict(data)
	meta.Title = firstNonEmpty(meta.Title, info["Title"])
	meta.Author = firstNonEmpty(meta.Author, info["Author"])
	meta.Publisher = firstNonEmpty(meta.Publisher, info["Publisher"])
	if meta.Language == "" {
		if lang := info["Lang"]; lang != "" {
			meta.Language = lang
		}
	}
	meta.Description = firstNonEmpty(meta.Description, info["Subject"])
	meta.Pages = countPDFPages(data)
	return nil
}

var pdfObjRe = regexp.MustCompile(`(?s)(\d+)\s+(\d+)\s+obj\s*(<<.*?>>)\s*endobj`)

// extractInfoDict finds the document Info dictionary (containing /Title etc).
func extractInfoDict(data []byte) map[string]string {
	out := map[string]string{}
	// prefer trailer /Info reference, fallback: any dict containing /Title
	var dicts [][]byte
	for _, m := range pdfObjRe.FindAllSubmatch(data, -1) {
		d := m[3]
		lower := bytes.ToLower(d)
		if bytes.Contains(lower, []byte("/title")) || bytes.Contains(lower, []byte("/author")) {
			dicts = append(dicts, d)
		}
	}
	// take the largest matching dict
	var best []byte
	for _, d := range dicts {
		if len(d) > len(best) {
			best = d
		}
	}
	if best == nil {
		return out
	}
	keys := []string{"Title", "Author", "Subject", "Publisher", "Lang", "Creator"}
	for _, k := range keys {
		if v := pdfDictString(best, k); v != "" {
			out[k] = v
		}
	}
	return out
}

// pdfDictString reads /Key (value) from a PDF dictionary.
func pdfDictString(dict []byte, key string) string {
	re := regexp.MustCompile(`(?is)/` + key + `\s*(\(([^()\\]|\\.)*\)|\[[^\]]*\]|<[0-9A-Fa-f\s]*>|/[A-Za-z0-9]+|true|false|null)`)
	m := re.FindSubmatch(dict)
	if len(m) < 2 {
		return ""
	}
	raw := string(m[1])
	if strings.HasPrefix(raw, "(") {
		return decodePdfLiteral(raw)
	}
	if strings.HasPrefix(raw, "<") && !strings.HasPrefix(raw, "<<") {
		hexStr := strings.Map(func(r rune) rune {
			if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
				return -1
			}
			return r
		}, raw[1:len(raw)-1])
		b, err := hex.DecodeString(hexStr)
		if err != nil {
			return ""
		}
		return decodePdfBytes(b)
	}
	return strings.TrimSpace(raw)
}

// decodePdfLiteral decodes a PDF literal string (handles escapes and UTF-16).
func decodePdfLiteral(s string) string {
	s = s[1 : len(s)-1]
	var sb strings.Builder
	i := 0
	for i < len(s) {
		c := s[i]
		if c == '\\' && i+1 < len(s) {
			i++
			switch s[i] {
			case 'n':
				sb.WriteByte('\n')
			case 'r':
				sb.WriteByte('\r')
			case 't':
				sb.WriteByte('\t')
			case 'b':
				sb.WriteByte('\b')
			case 'f':
				sb.WriteByte('\f')
			case '(':
				sb.WriteByte('(')
			case ')':
				sb.WriteByte(')')
			case '\\':
				sb.WriteByte('\\')
			default:
				if s[i] >= '0' && s[i] <= '7' {
					// octal escape up to 3 digits
					oct := []byte{s[i]}
					j := i + 1
					for j < len(s) && j < i+3 && s[j] >= '0' && s[j] <= '7' {
						oct = append(oct, s[j])
						j++
					}
					var v int
					for _, o := range oct {
						v = v*8 + int(o-'0')
					}
					sb.WriteByte(byte(v))
					i = j - 1
				} else {
					sb.WriteByte(s[i])
				}
			}
		} else {
			sb.WriteByte(c)
		}
		i++
	}
	return decodePdfBytes([]byte(sb.String()))
}

// decodePdfBytes handles UTF-16BE (BOM) encoded PDF strings.
func decodePdfBytes(b []byte) string {
	if len(b) >= 2 && b[0] == 0xFE && b[1] == 0xFF {
		u := make([]uint16, 0, (len(b)-2)/2)
		for i := 2; i+1 < len(b); i += 2 {
			u = append(u, uint16(b[i])<<8|uint16(b[i+1]))
		}
		return strings.TrimSpace(string(utf16.Decode(u)))
	}
	return strings.TrimSpace(string(b))
}

// countPDFPages counts /Type /Page (not /Pages) occurrences.
func countPDFPages(data []byte) int {
	pageRe := regexp.MustCompile(`(?s)/Type\s*/Page[^s]`)
	matches := pageRe.FindAll(data, -1)
	n := len(matches)
	// fallback: /Count in Pages tree
	if n == 0 {
		countRe := regexp.MustCompile(`(?is)/Count\s+(\d+)`)
		var best int
		for _, m := range countRe.FindAllSubmatch(data, -1) {
			var v int
			if _, err := fmtSscanf(string(m[1]), &v); err == nil && v > best {
				best = v
			}
		}
		return best
	}
	return n
}

func fmtSscanf(s string, v *int) (int, error) {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	*v = n
	return 0, nil
}
