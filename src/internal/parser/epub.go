package parser

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"io"
	"path"
	"regexp"
	"strings"

	"bookmanager/internal/models"
)

// ParseEPUB extracts metadata and cover from an EPUB (or KEPUB) file.
func ParseEPUB(filePath string, meta *models.BookMeta) error {
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return err
	}
	defer zr.Close()

	opfPath, err := findOPFPath(zr)
	if err != nil {
		return err
	}

	opf := findFile(zr, opfPath)
	if opf == nil {
		return errors.New("opf not found: " + opfPath)
	}
	rc, err := opf.Open()
	if err != nil {
		return err
	}
	opfData, err := io.ReadAll(rc)
	rc.Close()
	if err != nil {
		return err
	}

	meta.Title = firstNonEmpty(meta.Title, extractDC(opfData, "title"))
	meta.Author = firstNonEmpty(meta.Author, extractDC(opfData, "creator"))
	meta.Publisher = firstNonEmpty(meta.Publisher, extractDC(opfData, "publisher"))
	meta.Language = firstNonEmpty(meta.Language, extractDC(opfData, "language"))
	meta.Description = firstNonEmpty(meta.Description, extractDC(opfData, "description"))

	// cover image
	coverHref := findCoverHref(opfData, opfPath)
	if coverHref != "" {
		img := findFile(zr, coverHref)
		if img != nil {
			rc, err := img.Open()
			if err == nil {
				data, err := io.ReadAll(rc)
				rc.Close()
				if err == nil && len(data) > 100 {
					ext := detectImageExt(data)
					if ext != "" {
						meta.Cover = data
						meta.CoverExt = ext
					}
				}
			}
		}
	}
	return nil
}

func findOPFPath(zr *zip.ReadCloser) (string, error) {
	container := findFile(zr, "META-INF/container.xml")
	if container == nil {
		// some broken epubs lack container.xml; search for .opf
		for _, f := range zr.File {
			if strings.HasSuffix(f.Name, ".opf") {
				return f.Name, nil
			}
		}
		return "", errors.New("no container.xml")
	}
	rc, err := container.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()
	data, err := io.ReadAll(rc)
	if err != nil {
		return "", err
	}
	var c struct {
		Rootfiles []struct {
			FullPath string `xml:"full-path,attr"`
		} `xml:"rootfiles>rootfile"`
	}
	if err := xml.Unmarshal(data, &c); err != nil {
		return "", err
	}
	for _, r := range c.Rootfiles {
		if r.FullPath != "" {
			return r.FullPath, nil
		}
	}
	return "", errors.New("no rootfile in container.xml")
}

func findFile(zr *zip.ReadCloser, name string) *zip.File {
	name = path.Clean(name)
	for _, f := range zr.File {
		if path.Clean(f.Name) == name {
			return f
		}
	}
	// case-insensitive fallback
	for _, f := range zr.File {
		if strings.EqualFold(path.Clean(f.Name), name) {
			return f
		}
	}
	return nil
}

var metaRe = regexp.MustCompile(`(?is)<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']`)

func extractDC(data []byte, field string) string {
	re := regexp.MustCompile(`(?is)<dc:` + field + `\b[^>]*>(.*?)</dc:` + field + `\s*>`)
	m := re.FindSubmatch(data)
	if len(m) == 2 {
		return cleanXMLText(string(m[1]))
	}
	return ""
}

func cleanXMLText(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	re := regexp.MustCompile(`\s+`)
	s = re.ReplaceAllString(s, " ")
	return s
}

// findCoverHref returns the href of the cover image relative to opf dir.
func findCoverHref(opfData []byte, opfPath string) string {
	opfDir := path.Dir(opfPath)
	if opfDir == "." {
		opfDir = ""
	}

	// 1) meta name="cover" content="id"
	var coverID string
	for _, m := range metaRe.FindAllSubmatch(opfData, -1) {
		coverID = string(m[1])
		break
	}
	if coverID != "" {
		if href := manifestHref(opfData, coverID); href != "" {
			return resolvePath(opfDir, href)
		}
	}
	// 2) item properties="cover-image"
	if href := manifestHrefByProp(opfData, "cover-image"); href != "" {
		return resolvePath(opfDir, href)
	}
	// 3) item id containing "cover" and image mime
	if href := manifestHrefByIDHint(opfData); href != "" {
		return resolvePath(opfDir, href)
	}
	return ""
}

var manifestItemRe = regexp.MustCompile(`(?is)<item\b[^>]*/?>`)

func manifestHref(opfData []byte, id string) string {
	for _, m := range manifestItemRe.FindAll(opfData, -1) {
		tag := string(m)
		if attr(tag, "id") == id {
			return attr(tag, "href")
		}
	}
	return ""
}

func manifestHrefByProp(opfData []byte, prop string) string {
	for _, m := range manifestItemRe.FindAll(opfData, -1) {
		tag := string(m)
		if strings.Contains(strings.ToLower(attr(tag, "properties")), prop) {
			return attr(tag, "href")
		}
	}
	return ""
}

func manifestHrefByIDHint(opfData []byte) string {
	for _, m := range manifestItemRe.FindAll(opfData, -1) {
		tag := string(m)
		id := strings.ToLower(attr(tag, "id"))
		mime := strings.ToLower(attr(tag, "media-type"))
		if strings.Contains(id, "cover") && strings.HasPrefix(mime, "image/") {
			return attr(tag, "href")
		}
	}
	return ""
}

func attr(tag, name string) string {
	re := regexp.MustCompile(`(?is)` + name + `\s*=\s*["']([^"']*)["']`)
	m := re.FindStringSubmatch(tag)
	if len(m) == 2 {
		return m[1]
	}
	return ""
}

func resolvePath(base, href string) string {
	href = strings.Split(href, "#")[0]
	if base == "" {
		return path.Clean(href)
	}
	return path.Clean(path.Join(base, href))
}

// detectImageExt sniffs an image's format from magic bytes.
func detectImageExt(data []byte) string {
	switch {
	case len(data) > 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}):
		return ".png"
	case len(data) > 3 && bytes.Equal(data[:3], []byte{0xFF, 0xD8, 0xFF}):
		return ".jpg"
	case len(data) > 6 && bytes.Equal(data[:6], []byte("GIF87a")) || (len(data) > 6 && bytes.Equal(data[:6], []byte("GIF89a"))):
		return ".gif"
	case len(data) > 12 && bytes.Equal(data[6:10], []byte("WEBP")):
		return ".webp"
	case len(data) > 3 && bytes.Equal(data[:4], []byte("II*\x00")) || bytes.Equal(data[:4], []byte("MM\x00*")):
		return ".tiff"
	case len(data) > 2 && bytes.Equal(data[:2], []byte("BM")):
		return ".bmp"
	}
	return ""
}
