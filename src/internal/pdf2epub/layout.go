package pdf2epub

import (
	"math"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
)

// Block is one paragraph or heading of the generated book.
type Block struct {
	Text    string
	Heading int // 0 = 正文段落, 2 = 章标题（h2），3 = 小节标题（h3）
}

// line is one visual line of a PDF page: text fragments that share a baseline.
type line struct {
	y     float64 // baseline (PDF points, bottom-up); lines are sorted top-down
	x     float64 // left edge
	x2    float64 // right edge
	size  float64 // largest fragment size on the line
	font  string  // dominant font (most characters)
	bold  bool    // dominant font looks bold
	text  string
	frags []pdf.Text
}

const (
	// lineTolerance is how far two fragments may sit vertically (PDF points)
	// and still count as one line.
	lineTolerance = 2.0
	// spaceRatio: horizontal gap (relative to the font size) that means "there
	// was a space here".
	spaceRatio = 0.3
	// dupTolerance: two identical fragments closer than this (PDF points) are
	// the same glyph drawn twice (faux bold), not a repeated character.
	dupTolerance = 1.0
	// h2Ratio / h3Ratio: how much larger than the body text a heading must be.
	h2Ratio = 1.45
	h3Ratio = 1.18
	// indentRatio: a line indented by more than this many body sizes starts a
	// new paragraph.
	indentRatio = 0.8
	// paraGapRatio: vertical gap (in leading units) that starts a new paragraph.
	paraGapRatio = 1.35
	// maxHeadingRunes: longer lines are never treated as headings.
	maxHeadingRunes = 40
)

// groupLines sorts the fragments of one page and groups them into lines.
func groupLines(frags []pdf.Text) []line {
	valid := make([]pdf.Text, 0, len(frags))
	for _, fr := range frags {
		// Fragments that hold nothing but spaces are kept as space markers:
		// they are the only reliable space information in PDFs without glyph
		// advance widths.
		if cleanText(fr.S) == "" && !isBlankFragment(fr.S) {
			continue
		}
		valid = append(valid, fr)
	}
	// Top-down only, and stable: fragments of one line stay in the order the
	// PDF draws them, which is the reading order (their X values are often not
	// the real pen positions).
	sort.SliceStable(valid, func(i, j int) bool { return valid[i].Y > valid[j].Y })

	var lines []line
	for _, fr := range valid {
		size := fontSize(fr)
		idx := -1
		for i := range lines {
			if math.Abs(lines[i].y-fr.Y) <= math.Max(lineTolerance, 0.4*size) {
				idx = i
				break
			}
		}
		if idx < 0 {
			lines = append(lines, line{y: fr.Y, frags: []pdf.Text{fr}})
			continue
		}
		lines[idx].frags = append(lines[idx].frags, fr)
	}
	sort.SliceStable(lines, func(i, j int) bool { return lines[i].y > lines[j].y })
	for i := range lines {
		finalizeLine(&lines[i])
	}
	return lines
}

// finalizeLine joins the fragments of a line in reading order.
func finalizeLine(l *line) {
	trusted := xReliable(l.frags)
	if trusted {
		sort.SliceStable(l.frags, func(i, j int) bool { return l.frags[i].X < l.frags[j].X })
	}

	var sb strings.Builder
	var prev pdf.Text // geometry of the previous fragment (including spaces)
	var last pdf.Text // geometry of the previous visible fragment
	var lastOut rune  // last character written
	havePrev := false
	haveLast := false
	pending := false // an explicit space is waiting for its right hand side
	lastSpace := false
	first := true
	weights := map[string]int{}

	for _, fr := range l.frags {
		s := cleanText(fr.S)
		if s == "" {
			// An explicitly rendered space: keep it pending so the following
			// fragment can veto it (full-width brackets never hug a space).
			if havePrev {
				pending = true
			}
			prev, havePrev = fr, true
			continue
		}
		if haveLast && s == cleanText(last.S) && (last.W > 0 || fr.X != last.X) && math.Abs(fr.X-last.X) <= dupTolerance {
			// The same glyph drawn a second time on top of itself (faux bold).
			prev, havePrev = fr, true
			continue
		}
		if (pending || (trusted && havePrev && needSpace(prev, fr))) && !lastSpace && !noSpaceAround(lastOut, firstRune(s)) {
			sb.WriteString(" ")
			lastSpace = true
		}
		sb.WriteString(s)
		lastSpace = false
		pending = false
		prev, havePrev = fr, true
		last, haveLast = fr, true
		lastOut = lastRune(s)

		if first || fr.X < l.x {
			l.x = fr.X
			first = false
		}
		if right := fr.X + fr.W; right > l.x2 {
			l.x2 = right
		}
		if size := fontSize(fr); size > l.size {
			l.size = size
		}
		if fr.Font != "" {
			weights[fr.Font] += utf8.RuneCountInString(s)
		}
	}
	l.text = strings.TrimSpace(sb.String())
	l.font = dominant(weights)
	l.bold = looksBold(l.font)
}

// xReliable reports whether the X coordinates of a line are real pen positions.
// Many PDFs write every word (and every space) as its own text object, and the
// X that is extracted for those objects is not the position on the page: all
// characters of a line then sit within a few points, closer together than a
// glyph is wide. The order in the content stream is the reading order then.
func xReliable(frags []pdf.Text) bool {
	var xs []float64
	maxSize := 0.0
	for _, fr := range frags {
		if cleanText(fr.S) == "" {
			continue
		}
		xs = append(xs, fr.X)
		if size := fontSize(fr); size > maxSize {
			maxSize = size
		}
	}
	if len(xs) < 3 || maxSize <= 0 {
		return false
	}
	deltas := make([]float64, 0, len(xs)-1)
	for i := 1; i < len(xs); i++ {
		if d := math.Abs(xs[i] - xs[i-1]); d > 0 {
			deltas = append(deltas, d)
		}
	}
	if len(deltas) == 0 {
		// Every fragment reports the same X: no usable position at all.
		return false
	}
	sort.Float64s(deltas)
	return deltas[len(deltas)/2] >= 0.35*maxSize
}

// needSpace decides whether a space was rendered between two fragments.
func needSpace(prev, cur pdf.Text) bool {
	size := fontSize(prev)
	if size <= 0 {
		size = fontSize(cur)
	}
	if size <= 0 {
		size = 10
	}
	// A gap in CJK text is usually layout (tab stops, tables), not a space:
	// joining without one keeps the text readable.
	cjk := isCJK(lastRune(prev.S)) && isCJK(firstRune(cur.S))
	if prev.W <= 0 {
		// Without advance widths the distance between two fragments is one
		// glyph; only a clearly larger jump means a space.
		return cur.X-prev.X > 0.8*size && !cjk
	}
	if cur.X-(prev.X+prev.W) <= spaceRatio*size {
		return false
	}
	return !cjk
}

// noSpaceAround vetoes a space that would sit next to CJK punctuation, e.g.
// "（ 1）" is typeset as "（1）" and "Google ，" as "Google，".
func noSpaceAround(last, first rune) bool {
	if last == 0 {
		return false
	}
	return strings.ContainsRune("（〔【《〈“‘「『", last) || strings.ContainsRune("）〕】》〉”’」』，。、；：！？…·％℃", first)
}

// linesToBlocks merges lines into paragraphs and detects headings.
func linesToBlocks(lines []line, body float64) []Block {
	margin := leftMargin(lines)
	lead := leading(lines, body)
	width := maxLineWidth(lines)
	var blocks []Block
	var para []string

	flush := func() {
		if len(para) > 0 {
			blocks = append(blocks, Block{Text: joinPara(para)})
			para = para[:0]
		}
	}

	var prev *line
	prevHeading := 0.0
	for i := 0; i < len(lines); i++ {
		l := &lines[i]
		if l.text == "" {
			continue
		}
		// A heading starts a paragraph: it is the first line of the page, it
		// follows another heading, or the line above closed a sentence.
		startsPara := prev == nil || prev.EndsSentence()
		h := headingLevel(l, body, startsPara)
		if h > 0 && prevHeading > 0 && math.Abs(l.size-prevHeading) <= 0.05*prevHeading {
			// A line in the same style right below a heading is either the
			// continuation of a wrapped title or an entry of a typeset table
			// of contents, not a heading of its own.
			h = 0
		}
		if h > 0 {
			flush()
			text, last := collectHeading(lines, i, h, body, width)
			i = last
			blocks = append(blocks, Block{Text: text, Heading: h})
			prev = nil
			prevHeading = l.size
			continue
		}
		if prev != nil && newParagraph(prev, l, margin, body, lead) {
			flush()
		}
		para = append(para, l.text)
		prev = l
		prevHeading = 0
	}
	flush()
	return blocks
}

// collectHeading joins a heading that was wrapped over several lines. Long
// titles are hard wrapped by the PDF, and every line of them looks like a
// heading on its own. Only a line that fills the column is joined, so the
// entries of a typeset table of contents are left alone.
func collectHeading(lines []line, i, level int, body, width float64) (string, int) {
	l := &lines[i]
	text := l.text
	if level != 2 && level != 3 {
		return text, i
	}
	if width <= 0 || l.x2-l.x < 0.75*width {
		return text, i
	}
	last := i
	for k := i + 1; k < len(lines) && k <= i+2; k++ {
		nx := &lines[k]
		if nx.text == "" {
			break
		}
		if math.Abs(nx.size-l.size) > 0.1*l.size || nx.size < body*h3Ratio {
			break
		}
		if nx.x > l.x+0.6*body {
			break
		}
		if endsWithSentencePunct(text) {
			break
		}
		joined := joinLines(text, nx.text)
		if utf8.RuneCountInString(joined) > maxHeadingRunes {
			break
		}
		text, last = joined, k
	}
	return text, last
}

// maxLineWidth is the widest line of the page (the text column).
func maxLineWidth(lines []line) float64 {
	best := 0.0
	for _, l := range lines {
		if l.text == "" {
			continue
		}
		if w := l.x2 - l.x; w > best {
			best = w
		}
	}
	return best
}

// EndsSentence reports whether the line closes a sentence, which usually means
// the next line starts a new paragraph.
func (l *line) EndsSentence() bool {
	switch lastRune(strings.TrimRight(l.text, " ”’\"'）)」』》〉】〕")) {
	case '。', '！', '？', '…', '；', '!', '?', ';':
		return true
	}
	return false
}

// joinPara merges the (hard wrapped) lines of one paragraph.
func joinPara(lines []string) string {
	out := ""
	for _, s := range lines {
		out = joinLines(out, s)
	}
	return strings.TrimSpace(out)
}

// newParagraph reports whether l starts a new paragraph after prev.
func newParagraph(prev, l *line, margin, body, lead float64) bool {
	if body <= 0 {
		body = l.size
		if body <= 0 {
			body = 10
		}
	}
	if lead > 0 && prev.y-l.y > paraGapRatio*lead {
		return true
	}
	if margin > 0 && l.x-margin > indentRatio*body {
		return true
	}
	return prev.EndsSentence()
}

// joinLines joins a wrapped line with the text collected so far.
func joinLines(cur, next string) string {
	if cur == "" {
		return next
	}
	if strings.HasSuffix(cur, "-") && isLatinWord(firstRune(next)) {
		// Hyphenated word split across lines.
		return strings.TrimSuffix(cur, "-") + next
	}
	if isCJK(lastRune(cur)) && isCJK(firstRune(next)) {
		return cur + next
	}
	return cur + " " + next
}

// headingLevel classifies a line as heading (2/3) or body (0).
func headingLevel(l *line, body float64, startsPara bool) int {
	if body <= 0 || l.size <= 0 || !startsPara {
		return 0
	}
	n := utf8.RuneCountInString(l.text)
	if n < 2 || n > maxHeadingRunes {
		return 0
	}
	// Headings do not end sentences; a line that does is body text that
	// happens to sit in a slightly larger font.
	if endsWithSentencePunct(l.text) {
		return 0
	}
	switch {
	case l.size >= body*h2Ratio:
		return 2
	case l.size >= body*h3Ratio:
		return 3
	case l.bold && l.size >= body*0.98:
		return 3
	}
	return 0
}

// bodySize returns the dominant font size of the document, weighted by the
// amount of text rendered with it.
func bodySize(pages [][]pdf.Text) float64 {
	weights := map[int]int{}
	for _, frags := range pages {
		for _, fr := range frags {
			size := fontSize(fr)
			if size <= 0 {
				continue
			}
			key := int(math.Round(size * 2)) // half point steps
			weights[key] += utf8.RuneCountInString(cleanText(fr.S))
		}
	}
	best, bestW := 0, 0
	for k, w := range weights {
		if w > bestW || (w == bestW && k > best) {
			best, bestW = k, w
		}
	}
	if best == 0 {
		return 0
	}
	return float64(best) / 2
}

// leading is the typical distance between two body lines of the page (the
// median, so extra space before paragraphs does not skew it).
func leading(lines []line, body float64) float64 {
	var gaps []float64
	for i := 1; i < len(lines); i++ {
		prev, cur := lines[i-1], lines[i]
		if prev.text == "" || cur.text == "" {
			continue
		}
		if body > 0 && (prev.size > body*1.1 || cur.size > body*1.1) {
			continue
		}
		if gap := prev.y - cur.y; gap > 0 {
			gaps = append(gaps, gap)
		}
	}
	if len(gaps) < 3 {
		return 0
	}
	sort.Float64s(gaps)
	return math.Round(gaps[len(gaps)/2]*2) / 2
}

// leftMargin is the most common left edge of the page's lines, i.e. the
// paragraph indentation baseline.
func leftMargin(lines []line) float64 {
	counts := map[int]int{}
	for _, l := range lines {
		if l.text == "" {
			continue
		}
		counts[int(math.Round(l.x))]++
	}
	best, bestN := 0, 0
	for k, n := range counts {
		if n > bestN || (n == bestN && k < best) {
			best, bestN = k, n
		}
	}
	return float64(best)
}

// dropHeaders removes running headers/footers: page numbers and lines that
// repeat on most pages at the top or bottom of the page.
func dropHeaders(pages [][]line) int {
	counts := map[string]int{}
	for _, lines := range pages {
		seen := map[string]bool{}
		for _, l := range lines {
			if l.text == "" || utf8.RuneCountInString(l.text) > 60 {
				continue
			}
			if !seen[l.text] {
				seen[l.text] = true
				counts[l.text]++
			}
		}
	}
	threshold := len(pages) / 2
	if threshold < 3 {
		threshold = 3
	}

	dropped := 0
	for pi, lines := range pages {
		kept := lines[:0]
		for i, l := range lines {
			if len(lines) >= 3 && (i <= 1 || i >= len(lines)-2) {
				if isDigitOnly(l.text) {
					dropped++
					continue
				}
				if len(pages) >= 4 && counts[l.text] >= threshold {
					dropped++
					continue
				}
			}
			kept = append(kept, l)
		}
		pages[pi] = kept
	}
	return dropped
}

// dominant returns the most used key, breaking ties by the longer name.
func dominant(weights map[string]int) string {
	best, bestW := "", 0
	for k, w := range weights {
		if w > bestW || (w == bestW && len(k) > len(best)) {
			best, bestW = k, w
		}
	}
	return best
}

func looksBold(font string) bool {
	f := strings.ToLower(font)
	for _, w := range []string{"bold", "black", "heavy", "semibold", "-bd", ",bd"} {
		if strings.Contains(f, w) {
			return true
		}
	}
	return false
}

// endsWithSentencePunct reports whether the line ends with punctuation that a
// heading would never carry.
func endsWithSentencePunct(s string) bool {
	r := lastRune(strings.TrimRight(s, " ”’\"'）)」』》〉】〕"))
	switch r {
	case '。', '．', '.', '！', '!', '？', '?', '；', ';', '，', ',', '、', '：', ':':
		return true
	}
	return false
}

func fontSize(t pdf.Text) float64 {
	if t.FontSize > 0 {
		return t.FontSize
	}
	return 0
}

// cleanText normalises a fragment: no control characters, no glyphs without a
// unicode mapping, single spaces.
func cleanText(s string) string {
	if s == "" {
		return ""
	}
	var sb strings.Builder
	sb.Grow(len(s))
	space := false
	for _, r := range s {
		switch {
		case r == '\u00a0' || r == '\t' || r == '\n' || r == '\r' || r == '\v' || r == '\f' || r == ' ':
			space = true
			continue
		case r < 0x20 || r == 0x7f:
			continue
		case isUnmapped(r):
			continue
		}
		if space && sb.Len() > 0 {
			sb.WriteRune(' ')
		}
		space = false
		sb.WriteRune(r)
	}
	return strings.TrimSpace(sb.String())
}

// isUnmapped reports characters that only stand for a glyph without a unicode
// mapping: the replacement character and the private use areas.
func isUnmapped(r rune) bool {
	switch r {
	case '\uFFFD', '\uFFFE', '\uFFFF', 0:
		return true
	}
	return (r >= 0xE000 && r <= 0xF8FF) || (r >= 0xF0000 && r <= 0x10FFFD)
}

func isDigitOnly(s string) bool {
	if s == "" {
		return false
	}
	n := 0
	for _, r := range s {
		if unicode.IsDigit(r) {
			n++
			continue
		}
		if r == ' ' || r == '-' || r == '.' {
			continue
		}
		return false
	}
	return n > 0 && n <= 5
}

func isLatinWord(r rune) bool {
	return r < utf8.RuneSelf && (unicode.IsLetter(r) || unicode.IsDigit(r))
}

// isBlankFragment reports whether a fragment draws nothing but whitespace or
// glyphs the font could not map to a character (the space of a subset font is
// frequently extracted as U+FFFD).
func isBlankFragment(s string) bool {
	n := 0
	for _, r := range s {
		if !isBlankRune(r) {
			return false
		}
		n++
	}
	return n > 0
}

func isBlankRune(r rune) bool {
	switch r {
	case ' ', '\u00a0', '\t', '\n', '\r', '\v', '\f':
		return true
	}
	return isUnmapped(r)
}

func isCJK(r rune) bool {
	switch {
	case r >= 0x2e80 && r <= 0x9fff, // CJK radicals .. unified ideographs
		r >= 0xf900 && r <= 0xfaff, // compatibility ideographs
		r >= 0xff00 && r <= 0xffef, // fullwidth forms
		r >= 0x3000 && r <= 0x303f: // CJK punctuation
		return true
	}
	return false
}

func firstRune(s string) rune {
	r, _ := utf8.DecodeRuneInString(s)
	return r
}

func lastRune(s string) rune {
	r, _ := utf8.DecodeLastRuneInString(s)
	return r
}
