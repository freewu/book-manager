package douban

import "testing"

func TestIsImage(t *testing.T) {
	cases := []struct {
		name string
		b    []byte
		want bool
	}{
		{"jpeg", []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10}, true},
		{"png", []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}, true},
		{"gif", []byte{'G', 'I', 'F', '8', '9', 'a'}, true},
		{"html challenge", []byte("<script>func"), false},
		{"empty", []byte{}, false},
		{"text", []byte("cdn error 001"), false},
	}
	for _, c := range cases {
		if got := isImage(c.b); got != c.want {
			t.Errorf("%s: isImage = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestCoverAlternatives(t *testing.T) {
	alts := coverAlternatives("https://img9.doubanio.com/view/subject/m/public/s26012674.jpg")
	want := []string{
		"https://img2.doubanio.com/view/subject/m/public/s26012674.jpg",
		"https://img9.doubanio.com/view/subject/l/public/s26012674.jpg",
	}
	if len(alts) != 2 || alts[0] != want[0] || alts[1] != want[1] {
		t.Fatalf("alternatives = %v, want %v", alts, want)
	}
}
