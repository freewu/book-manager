package parser

import (
	"path/filepath"
	"strings"

	"bookmanager/internal/models"
)

// Parse extracts metadata from an ebook file based on its extension.
func Parse(filePath, format string) (*models.BookMeta, error) {
	meta := &models.BookMeta{}
	lower := strings.ToLower(filePath)
	ext := filepath.Ext(lower)
	switch {
	case ext == ".pdf":
		if err := ParsePDF(filePath, meta); err != nil {
			return meta, err
		}
	case ext == ".mobi" || ext == ".azw" || ext == ".azw3" || ext == ".azw4":
		if err := ParseMOBI(filePath, meta); err != nil {
			return meta, err
		}
	case ext == ".epub" || strings.HasSuffix(lower, ".kepub.epub") || ext == ".kepub":
		if err := ParseEPUB(filePath, meta); err != nil {
			return meta, err
		}
	default:
		return meta, nil
	}
	if meta.Title == "" {
		meta.Title = strings.TrimSuffix(filepath.Base(filePath), filepath.Ext(filePath))
	}
	return meta, nil
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}
