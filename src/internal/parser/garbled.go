package parser

import "unicode/utf8"

// LookGarbled reports whether a decoded metadata title is likely mojibake.
//
// Many Chinese MOBI files store their title in CP936/GBK (or Shift-JIS)
// while the MOBI header claims CP1252 or UTF-8, so decoding produces
// gibberish Latin-1 text. In that case the metadata title is useless and
// callers should fall back to the file name.
func LookGarbled(s string) bool {
	if s == "" {
		return false
	}
	// Invalid UTF-8 bytes are almost always a wrong-decoding artifact
	// (the bytes were never valid UTF-8 to begin with).
	if !utf8.ValidString(s) {
		return true
	}
	n := 0
	suspicious := 0
	ctrl := 0
	for _, r := range s {
		n++
		switch {
		case r < 0x20 || r == 0x7F:
			ctrl++
		case r >= 0x80 && r <= 0x2FF:
			// Latin-1 supplement, Latin Extended-A/B, IPA Extensions and
			// Spacing Modifier Letters — the typical landing zone when CJK
			// bytes are decoded with CP1252 / Latin-1.
			suspicious++
		}
	}
	if ctrl > 0 {
		return true
	}
	// A real title in French/Spanish/German contains only a few accented
	// letters; mojibake is dominated by them.
	return suspicious > 0 && suspicious*2 >= n
}
