package epub2pdf

import (
	"strings"

	"github.com/phpdave11/gofpdf"
)

// 禁则处理：换行时不能出现在行首的标点（行首禁则），以及不能落在行尾的
// 开括号（行尾禁则）。
const noLineStart = "，。、；：！？）〕】》〉”’」』…·％℃"
const noLineEnd = "（〔【《〈“‘「『"

// lineBreaker wraps text into lines that fit the current font and cell width.
//
// gofpdf's MultiCell cannot be used for CJK text: when it breaks a line inside
// a run without spaces it drops the character it breaks at (it emits
// runes[j:sep] and then continues at sep+1). This breaker does the wrapping
// itself; the caller draws one Cell per line.
type lineBreaker struct {
	pdf   *gofpdf.Fpdf
	width float64 // 可排版宽度（已扣掉单元格留白）
	cache map[rune]float64
}

// newLineBreaker measures text for the currently selected font.
func newLineBreaker(pdf *gofpdf.Fpdf, width float64) *lineBreaker {
	usable := width - 2*pdf.GetCellMargin()
	if usable <= 0 {
		usable = width
	}
	return &lineBreaker{pdf: pdf, width: usable, cache: map[rune]float64{}}
}

// runeWidth measures one rune (cached: a book repeats most of its glyphs).
func (b *lineBreaker) runeWidth(r rune) float64 {
	if w, ok := b.cache[r]; ok {
		return w
	}
	w := b.pdf.GetStringWidth(string(r))
	b.cache[r] = w
	return w
}

func (b *lineBreaker) measure(rs []rune) float64 {
	total := 0.0
	for _, r := range rs {
		total += b.runeWidth(r)
	}
	return total
}

// lastSpace returns the index just after the last space, or -1.
func lastSpace(rs []rune) int {
	for i := len(rs) - 1; i >= 0; i-- {
		if rs[i] == ' ' {
			return i + 1
		}
	}
	return -1
}

// wrap breaks one paragraph into lines; explicit newlines are kept.
func (b *lineBreaker) wrap(text string) []string {
	var lines []string
	var cur []rune
	curWidth := 0.0
	breakAt := -1

	emit := func(rs []rune) {
		lines = append(lines, strings.TrimRight(string(rs), " "))
	}

	for _, r := range text {
		if r == '\n' {
			emit(cur)
			cur, curWidth, breakAt = cur[:0], 0, -1
			continue
		}
		w := b.runeWidth(r)
		if curWidth+w > b.width && len(cur) > 0 {
			switch {
			case breakAt > 0 && breakAt < len(cur):
				// Latin 断行：空格留在上一行
				rest := append([]rune(nil), cur[breakAt:]...)
				emit(cur[:breakAt])
				cur = append(cur[:0], rest...)
			case strings.ContainsRune(noLineStart, r):
				// 标点不能起行：挤到上一行（允许略微超宽）
				cur = append(cur, r)
				emit(cur)
				cur, curWidth, breakAt = cur[:0], 0, -1
				continue
			case len(cur) > 1 && strings.ContainsRune(noLineEnd, cur[len(cur)-1]):
				// 开括号不能收行：挪到下一行
				last := cur[len(cur)-1]
				emit(cur[:len(cur)-1])
				cur = append(cur[:0], last)
			default:
				emit(cur)
				cur = cur[:0]
			}
			curWidth = b.measure(cur)
			breakAt = lastSpace(cur)
		}
		cur = append(cur, r)
		curWidth += w
		if r == ' ' {
			breakAt = len(cur)
		}
	}
	if len(cur) > 0 {
		emit(cur)
	}
	return lines
}
