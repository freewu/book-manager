package parser

import "testing"

func TestLookGarbled(t *testing.T) {
	cases := []struct {
		in   string
		want bool
	}{
		// clean titles must NOT be flagged
		{"MobiTest", false},
		{"书名测试", false},
		{"平凡的世界", false},
		{"A Brief History of Time", false},
		{"Über das Leben", false},   // a couple of accented letters are fine
		{"Étude de la nature", false},
		{"The Old Man and the Sea", false},
		{"", false},

		// mojibake samples MUST be flagged
		// "书名" in GBK decoded as CP1252 → ÊéÃû
		{"ÊéÃû", true},
		// UTF-8 bytes of "书名" read as CP1252 → ä¹¦å
		{"ä¹¦å", true},
		// invalid UTF-8 bytes passed through
		{"\xe4\xb9\xa6\xe5\x90\x8d\xff", true},
		// control characters
		{"Ti\x00tle", true},
	}
	for _, c := range cases {
		if got := LookGarbled(c.in); got != c.want {
			t.Errorf("LookGarbled(%q) = %v, want %v", c.in, got, c.want)
		}
	}
}
