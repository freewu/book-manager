package parser

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"testing"

	"bookmanager/internal/models"
)

// palmdocLiteralCompress encodes data using only literal tokens (valid PalmDoc).
// Note: tokens 0x01-0x08 copy N following bytes verbatim (no repetition).
func palmdocLiteralCompress(data []byte) []byte {
	var out []byte
	i := 0
	for i < len(data) {
		// batch up to 8 literal bytes into one 0x01-0x08 token when all safe
		j := i
		for j < len(data) && j-i < 8 && data[j] > 0 && data[j] < 0x80 {
			j++
		}
		if j-i >= 2 {
			out = append(out, byte(j-i))
			out = append(out, data[i:j]...)
			i = j
			continue
		}
		b := data[i]
		if b == 0 || b > 0x7f {
			out = append(out, 0x00, b)
		} else {
			out = append(out, b)
		}
		i++
	}
	return out
}

func buildMobi(t *testing.T) []byte {
	t.Helper()
	text := []byte(`<h1>Mobi Chapter</h1><p>Hello from the mobi reader test.</p><img recindex="0"/>`)
	compressed := palmdocLiteralCompress(text)

	// --- record 0: MOBI header + EXTH + title ---
	headerLen := 232
	title := "MobiTest"
	author := "TestAuthor"
	publisher := "PubCo"

	// EXTH records
	exthRecords := []struct {
		typ  uint32
		data []byte
	}{
		{100, []byte(author)},
		{101, []byte(publisher)},
		{129, []byte(title)},
		{201, []byte{0, 0, 0, 0}}, // cover offset = 0 → record 2 (firstImage=2)
	}
	exthLen := 12
	for _, r := range exthRecords {
		exthLen += 8 + len(r.data)
	}
	exth := make([]byte, exthLen)
	copy(exth, "EXTH")
	binary.BigEndian.PutUint32(exth[4:], uint32(exthLen))
	binary.BigEndian.PutUint32(exth[8:], uint32(len(exthRecords)))
	pos := 12
	for _, r := range exthRecords {
		binary.BigEndian.PutUint32(exth[pos:], r.typ)
		binary.BigEndian.PutUint32(exth[pos+4:], uint32(8+len(r.data)))
		copy(exth[pos+8:], r.data)
		pos += 8 + len(r.data)
	}

	mh := make([]byte, headerLen)
	copy(mh[0:], "MOBI")
	binary.BigEndian.PutUint32(mh[4:], uint32(headerLen))
	binary.BigEndian.PutUint32(mh[8:], 2)          // mobi type
	binary.BigEndian.PutUint16(mh[12:], 65001)     // utf-8
	binary.BigEndian.PutUint32(mh[84:], uint32(headerLen+exthLen)) // full name offset
	binary.BigEndian.PutUint32(mh[88:], uint32(len(title)))        // full name length
	binary.BigEndian.PutUint32(mh[92:], 2)         // first image index
	binary.BigEndian.PutUint32(mh[112:], 0x40)     // EXTH flags
	binary.BigEndian.PutUint32(mh[168:], 1)        // first content record
	binary.BigEndian.PutUint32(mh[172:], 1)        // last content record

	rec0 := append(mh, exth...)
	rec0 = append(rec0, []byte(title)...)

	// --- record 2: cover image (8-byte header + jpeg) ---
	jpg := append([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46}, make([]byte, 200)...)
	jpg = append(jpg, 0xFF, 0xD9)
	rec2 := make([]byte, 8+len(jpg))
	binary.BigEndian.PutUint32(rec2[0:], 8)
	binary.BigEndian.PutUint32(rec2[4:], uint32(len(jpg)))
	copy(rec2[8:], jpg)

	// --- assemble PDB ---
	numRecords := 3
	rec1Off := 78 + 8*numRecords
	rec2Off := rec1Off + len(rec0)
	rec3Off := rec2Off + len(compressed)

	pdb := make([]byte, 78)
	copy(pdb[0:], "BOOKMOBI")
	copy(pdb[60:], "BOOK")
	copy(pdb[64:], "MOBI")
	binary.BigEndian.PutUint16(pdb[76:], uint16(numRecords))

	recList := make([]byte, 8*numRecords)
	binary.BigEndian.PutUint32(recList[0:], uint32(rec1Off))
	recList[4] = 0 // rec0 attrs
	binary.BigEndian.PutUint32(recList[8:], uint32(rec2Off))
	recList[12] = 0x02 // rec1 attrs: palmdoc compressed
	binary.BigEndian.PutUint32(recList[16:], uint32(rec3Off))
	recList[20] = 0

	out := append(pdb, recList...)
	out = append(out, rec0...)
	out = append(out, compressed...)
	out = append(out, rec2...)
	return out
}

func TestParseMOBI(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.mobi")
	if err := os.WriteFile(path, buildMobi(t), 0o644); err != nil {
		t.Fatal(err)
	}
	meta := &models.BookMeta{}
	if err := ParseMOBI(path, meta); err != nil {
		t.Fatalf("parse mobi: %v", err)
	}
	if meta.Title != "MobiTest" {
		t.Errorf("title = %q, want MobiTest", meta.Title)
	}
	if meta.Author != "TestAuthor" {
		t.Errorf("author = %q", meta.Author)
	}
	if meta.Publisher != "PubCo" {
		t.Errorf("publisher = %q", meta.Publisher)
	}
	if len(meta.Cover) == 0 || meta.CoverExt != ".jpg" {
		t.Errorf("cover not extracted: len=%d ext=%q", len(meta.Cover), meta.CoverExt)
	}
}
