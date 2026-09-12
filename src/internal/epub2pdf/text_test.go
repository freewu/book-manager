package epub2pdf

import (
	"strings"
	"testing"

	"github.com/phpdave11/gofpdf"
)

// testBreaker builds a breaker with the real embedded font.
func testBreaker(t *testing.T, width float64, size float64) *lineBreaker {
	t.Helper()
	font, err := pickFont("中文 Test 测试")
	if err != nil {
		t.Skipf("no usable font on this machine: %v", err)
	}
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddUTF8FontFromBytes(bookFontFamily, "", font.data)
	if !pdf.Ok() {
		t.Fatal("font registration failed")
	}
	pdf.SetFont(bookFontFamily, "", size)
	return newLineBreaker(pdf, width)
}

func TestWrapKeepsEveryCharacter(t *testing.T) {
	b := testBreaker(t, 170, bodySize)
	para := strings.Repeat("而現在人们越来越多地去尝试将这两种技术结合，发挥它们的优势。", 20)
	lines := b.wrap(para)
	if len(lines) < 3 {
		t.Fatalf("lines = %d, want a multi-line paragraph", len(lines))
	}
	if got := strings.Join(lines, ""); got != para {
		t.Errorf("wrap lost or added characters:\n got %q\nwant %q", got, para)
	}
	for i, ln := range lines {
		if w := b.measure([]rune(ln)); w > b.width+2 {
			t.Errorf("line %d is %.1fmm wide, limit is %.1fmm: %q", i, w, b.width, ln)
		}
	}
}

func TestWrapKeepsLatinWordsAndSpaces(t *testing.T) {
	b := testBreaker(t, 60, bodySize)
	text := strings.TrimSpace(strings.Repeat("alpha beta gamma delta ", 12))
	lines := b.wrap(text)
	if len(lines) < 3 {
		t.Fatalf("lines = %d", len(lines))
	}
	for i, ln := range lines {
		if strings.HasPrefix(ln, " ") || strings.HasSuffix(ln, " ") {
			t.Errorf("line %d has a stray space: %q", i, ln)
		}
		if strings.Contains(ln, "  ") {
			t.Errorf("line %d has a double space: %q", i, ln)
		}
	}
	if got := strings.Join(strings.Fields(strings.Join(lines, " ")), " "); got != strings.Join(strings.Fields(text), " ") {
		t.Errorf("wrap changed the text:\n got %q\nwant %q", got, strings.Join(strings.Fields(text), " "))
	}
}

func TestWrapRespectsPunctuationRules(t *testing.T) {
	b := testBreaker(t, 40, bodySize)
	// 句中的标点刚好落在行首，开括号刚好落在行尾
	para := "这是一段测试文本用来触发换行的位置，后面还是文字（含括号）以及更多的中文内容继续填充整行。"
	lines := b.wrap(para)
	if len(lines) < 2 {
		t.Fatalf("lines = %d, want >= 2", len(lines))
	}
	for i, ln := range lines {
		rs := []rune(ln)
		if i > 0 && strings.ContainsRune(noLineStart, rs[0]) {
			t.Errorf("line %d starts with punctuation %q", i, string(rs[0]))
		}
		if i < len(lines)-1 && strings.ContainsRune(noLineEnd, rs[len(rs)-1]) {
			t.Errorf("line %d ends with an opening bracket: %q", i, ln)
		}
	}
	if got := strings.Join(lines, ""); got != para {
		t.Errorf("wrap lost characters:\n got %q\nwant %q", got, para)
	}
}

func TestWrapKeepsExplicitNewlines(t *testing.T) {
	b := testBreaker(t, 170, bodySize)
	lines := b.wrap("第一行\n第二行")
	if len(lines) != 2 || lines[0] != "第一行" || lines[1] != "第二行" {
		t.Errorf("lines = %q", lines)
	}
}
