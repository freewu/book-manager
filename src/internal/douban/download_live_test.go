package douban

import "testing"

// Live anti-hotlink check: img9 returns an HTML challenge, DownloadCover must
// fall back to img2 and return a real JPEG. Network-dependent; skipped if offline.
func TestDownloadCoverAntiHotlink(t *testing.T) {
	data, err := DownloadCover("https://img9.doubanio.com/view/subject/m/public/s26012674.jpg")
	if err != nil {
		t.Skipf("offline: %v", err)
	}
	if !isImage(data) {
		t.Fatalf("downloaded bytes are not an image: % x", data[:8])
	}
	if data[0] != 0xff || data[1] != 0xd8 {
		t.Fatalf("expected jpeg, got % x", data[:4])
	}
}
