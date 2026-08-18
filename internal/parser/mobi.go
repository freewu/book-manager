package parser

import (
	"encoding/binary"
	"errors"
	"os"

	"bookmanager/internal/models"
)

// ParseMOBI extracts metadata and cover from MOBI / AZW3 / KF8 files
// by reading the Palm Database header, the MOBI header and the EXTH records.
func ParseMOBI(filePath string, meta *models.BookMeta) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		return err
	}
	if st.Size() < 78 {
		return errors.New("file too small to be a Palm database")
	}

	head := make([]byte, 4)
	if _, err := f.ReadAt(head, 0); err != nil {
		return err
	}
	// PalmDB name field is often "BOOKMOBI", "TEXtREAd" etc. Validate loosely:
	// magic check happens against MOBI header below.

	// PalmDB header
	pdb := make([]byte, 78)
	if _, err := f.ReadAt(pdb, 0); err != nil {
		return err
	}
	numRecords := int(binary.BigEndian.Uint16(pdb[76:78]))
	if numRecords == 0 || numRecords > 100000 {
		return errors.New("invalid record count")
	}
	recInfo := make([]byte, 8*numRecords)
	if _, err := f.ReadAt(recInfo, 78); err != nil {
		return err
	}
	rec0Offset := int64(binary.BigEndian.Uint32(recInfo[0:4]))

	// read the first record (contains MOBI header)
	firstRecLen := int64(0)
	if numRecords > 1 {
		firstRecLen = int64(binary.BigEndian.Uint32(recInfo[8:12])) - rec0Offset
	} else {
		firstRecLen = st.Size() - rec0Offset
	}
	if firstRecLen > st.Size()-rec0Offset {
		firstRecLen = st.Size() - rec0Offset
	}
	if firstRecLen < 16 {
		return errors.New("first record too small")
	}
	rec0 := make([]byte, firstRecLen)
	if _, err := f.ReadAt(rec0, rec0Offset); err != nil {
		return err
	}

	// MOBI header starts at offset 16 within record 0
	if len(rec0) < 24 || string(rec0[16:20]) != "MOBI" {
		// some files have "TEXtREAd" at record start and MOBI later; search for magic
		idx := findBytes(rec0, []byte("MOBI"))
		if idx < 0 {
			return errors.New("not a MOBI file (no MOBI magic)")
		}
		if idx+132 > len(rec0) {
			return errors.New("MOBI header truncated")
		}
		return parseMobiHeader(rec0[idx:], f, meta)
	}
	return parseMobiHeader(rec0[16:], f, meta)
}

func findBytes(haystack, needle []byte) int {
	for i := 0; i+len(needle) <= len(haystack); i++ {
		match := true
		for j := range needle {
			if haystack[i+j] != needle[j] {
				match = false
				break
			}
		}
		if match {
			return i
		}
	}
	return -1
}

func parseMobiHeader(mh []byte, f *os.File, meta *models.BookMeta) error {
	// mh points at "MOBI" magic
	if len(mh) < 132 {
		return errors.New("MOBI header truncated")
	}
	headerLen := int(binary.BigEndian.Uint32(mh[4:8]))
	encoding := binary.BigEndian.Uint16(mh[12:14])
	fullNameOffset := int(binary.BigEndian.Uint32(mh[84:88]))
	fullNameLength := int(binary.BigEndian.Uint32(mh[88:92]))
	firstImageIndex := int(binary.BigEndian.Uint32(mh[92:96]))
	exthFlags := binary.BigEndian.Uint32(mh[112:116])

	if meta.Title == "" && fullNameLength > 0 && fullNameOffset+fullNameLength <= len(mh) {
		title := decodeMobiText(mh[fullNameOffset:fullNameOffset+fullNameLength], encoding)
		if title != "" {
			meta.Title = title
		}
	}

	var exthStart = headerLen
	if exthStart < 0 || exthStart > len(mh) {
		exthStart = 0
	}
	// EXTH flags bit 0x40 means EXTH record follows the MOBI header
	if exthFlags&0x40 != 0 && exthStart+12 <= len(mh) && string(mh[exthStart:exthStart+4]) == "EXTH" {
		exthLen := int(binary.BigEndian.Uint32(mh[exthStart+4 : exthStart+8]))
		if exthLen > len(mh)-exthStart {
			exthLen = len(mh) - exthStart
		}
		exth := mh[exthStart : exthStart+exthLen]
		pos := 12
		for pos+8 <= len(exth) {
			recType := binary.BigEndian.Uint32(exth[pos : pos+4])
			recLen := int(binary.BigEndian.Uint32(exth[pos+4 : pos+8]))
			if recLen < 8 || pos+recLen > len(exth) {
				break
			}
			data := exth[pos+8 : pos+recLen]
			switch recType {
			case 100: // author
				if meta.Author == "" {
					meta.Author = decodeMobiText(data, encoding)
				}
			case 101: // publisher
				if meta.Publisher == "" {
					meta.Publisher = decodeMobiText(data, encoding)
				}
			case 103: // description
				if meta.Description == "" {
					meta.Description = decodeMobiText(data, encoding)
				}
			case 110: // language
				if meta.Language == "" {
					meta.Language = decodeMobiText(data, encoding)
				}
			case 129: // title (untrusted, only if no fullname)
				if meta.Title == "" {
					meta.Title = decodeMobiText(data, encoding)
				}
			case 201: // cover offset
				if len(data) >= 4 && firstImageIndex > 0 {
					coverOffset := int(binary.BigEndian.Uint32(data[:4]))
					coverRecord := firstImageIndex + coverOffset
					if coverRecord >= 0 && coverRecord < numRecords(f) {
						if img, err := readImageRecord(f, coverRecord); err == nil && len(img) > 100 {
							if ext := detectImageExt(img); ext != "" {
								meta.Cover = img
								meta.CoverExt = ext
							}
						}
					}
				}
			}
			pos += recLen
		}
	}
	return nil
}

func numRecords(f *os.File) int {
	pdb := make([]byte, 78)
	if _, err := f.ReadAt(pdb, 0); err != nil {
		return 0
	}
	return int(binary.BigEndian.Uint16(pdb[76:78]))
}

// readImageRecord reads one PDB record and strips the 8-byte record header,
// leaving the raw image data.
func readImageRecord(f *os.File, recordIndex int) ([]byte, error) {
	st, err := f.Stat()
	if err != nil {
		return nil, err
	}
	pdb := make([]byte, 78)
	if _, err := f.ReadAt(pdb, 0); err != nil {
		return nil, err
	}
	numRecords := int(binary.BigEndian.Uint16(pdb[76:78]))
	if recordIndex < 0 || recordIndex >= numRecords {
		return nil, errors.New("record out of range")
	}
	recInfo := make([]byte, 8*numRecords)
	if _, err := f.ReadAt(recInfo, 78); err != nil {
		return nil, err
	}
	off := int64(binary.BigEndian.Uint32(recInfo[recordIndex*8 : recordIndex*8+4]))
	var end int64
	if recordIndex+1 < numRecords {
		end = int64(binary.BigEndian.Uint32(recInfo[recordIndex*8+8 : recordIndex*8+12]))
	} else {
		end = st.Size()
	}
	if end <= off || end-off > 64*1024*1024 {
		return nil, errors.New("invalid image record size")
	}
	rec := make([]byte, end-off)
	if _, err := f.ReadAt(rec, off); err != nil {
		return nil, err
	}
	// record layout: 4 bytes offset-to-image-data (usually 8), 4 bytes image length
	if len(rec) < 8 {
		return nil, errors.New("image record too small")
	}
	imgOff := int(binary.BigEndian.Uint32(rec[0:4]))
	imgLen := int(binary.BigEndian.Uint32(rec[4:8]))
	if imgOff == 0 && imgLen == 0 {
		imgOff, imgLen = 8, len(rec)-8
	}
	if imgOff < 0 || imgLen <= 0 || imgOff+imgLen > len(rec) {
		return nil, errors.New("bad image offsets")
	}
	img := rec[imgOff : imgOff+imgLen]
	// strip an optional 8-byte Palm image header if present (type=0x5053 / 0x5042)
	if len(img) >= 8 && detectImageExt(img) == "" {
		if ext := detectImageExt(img[8:]); ext != "" && !looksLikeText(img[:8]) {
			img = img[8:]
		}
	}
	return img, nil
}

func looksLikeText(b []byte) bool {
	for _, c := range b {
		if c == 0 || c > 127 {
			return false
		}
	}
	return true
}

// decodeMobiText decodes CP1252 or UTF-8 encoded mobi strings.
func decodeMobiText(b []byte, encoding uint16) string {
	if encoding == 65001 {
		return cleanXMLText(string(b))
	}
	// cp1252
	var sb []rune
	for _, c := range b {
		sb = append(sb, cp1252[c])
	}
	return cleanXMLText(string(sb))
}

var cp1252 = [256]rune{
	0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007,
	0x0008, 0x0009, 0x000A, 0x000B, 0x000C, 0x000D, 0x000E, 0x000F,
	0x0010, 0x0011, 0x0012, 0x0013, 0x0014, 0x0015, 0x0016, 0x0017,
	0x0018, 0x0019, 0x001A, 0x001B, 0x001C, 0x001D, 0x001E, 0x001F,
	0x0020, 0x0021, 0x0022, 0x0023, 0x0024, 0x0025, 0x0026, 0x0027,
	0x0028, 0x0029, 0x002A, 0x002B, 0x002C, 0x002D, 0x002E, 0x002F,
	0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037,
	0x0038, 0x0039, 0x003A, 0x003B, 0x003C, 0x003D, 0x003E, 0x003F,
	0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047,
	0x0048, 0x0049, 0x004A, 0x004B, 0x004C, 0x004D, 0x004E, 0x004F,
	0x0050, 0x0051, 0x0052, 0x0053, 0x0054, 0x0055, 0x0056, 0x0057,
	0x0058, 0x0059, 0x005A, 0x005B, 0x005C, 0x005D, 0x005E, 0x005F,
	0x0060, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067,
	0x0068, 0x0069, 0x006A, 0x006B, 0x006C, 0x006D, 0x006E, 0x006F,
	0x0070, 0x0071, 0x0072, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077,
	0x0078, 0x0079, 0x007A, 0x007B, 0x007C, 0x007D, 0x007E, 0x007F,
	0x20AC, 0x0081, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021,
	0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008D, 0x017D, 0x008F,
	0x0090, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014,
	0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x009D, 0x017E, 0x0178,
	0x00A0, 0x00A1, 0x00A2, 0x00A3, 0x00A4, 0x00A5, 0x00A6, 0x00A7,
	0x00A8, 0x00A9, 0x00AA, 0x00AB, 0x00AC, 0x00AD, 0x00AE, 0x00AF,
	0x00B0, 0x00B1, 0x00B2, 0x00B3, 0x00B4, 0x00B5, 0x00B6, 0x00B7,
	0x00B8, 0x00B9, 0x00BA, 0x00BB, 0x00BC, 0x00BD, 0x00BE, 0x00BF,
	0x00C0, 0x00C1, 0x00C2, 0x00C3, 0x00C4, 0x00C5, 0x00C6, 0x00C7,
	0x00C8, 0x00C9, 0x00CA, 0x00CB, 0x00CC, 0x00CD, 0x00CE, 0x00CF,
	0x00D0, 0x00D1, 0x00D2, 0x00D3, 0x00D4, 0x00D5, 0x00D6, 0x00D7,
	0x00D8, 0x00D9, 0x00DA, 0x00DB, 0x00DC, 0x00DD, 0x00DE, 0x00DF,
	0x00E0, 0x00E1, 0x00E2, 0x00E3, 0x00E4, 0x00E5, 0x00E6, 0x00E7,
	0x00E8, 0x00E9, 0x00EA, 0x00EB, 0x00EC, 0x00ED, 0x00EE, 0x00EF,
	0x00F0, 0x00F1, 0x00F2, 0x00F3, 0x00F4, 0x00F5, 0x00F6, 0x00F7,
	0x00F8, 0x00F9, 0x00FA, 0x00FB, 0x00FC, 0x00FD, 0x00FE, 0x00FF,
}
