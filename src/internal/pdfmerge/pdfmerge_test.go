package pdfmerge

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/ledongthuc/pdf"

	"bookmanager/internal/pdfcrypt"
)

// samplePDF 生成一个 pages 页的最小合法 PDF（每页文字为 p1、p2…，
// 用来验证合并后的页序）。
func samplePDF(pages int) []byte {
	kids := make([]string, 0, pages)
	objects := []string{
		"", // 1: catalog（下面填）
		"", // 2: pages（下面填）
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", // 3
	}
	for i := 0; i < pages; i++ {
		pageObj := len(objects) + 1
		contentObj := pageObj + 1
		kids = append(kids, fmt.Sprintf("%d 0 R", pageObj))
		stream := fmt.Sprintf("BT /F1 24 Tf 20 100 Td (p%d) Tj ET", i+1)
		objects = append(objects,
			fmt.Sprintf("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents %d 0 R "+
				"/Resources << /Font << /F1 3 0 R >> >> >>", contentObj),
			fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream),
		)
	}
	objects[0] = "<< /Type /Catalog /Pages 2 0 R >>"
	objects[1] = fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), pages)

	var buf bytes.Buffer
	buf.WriteString("%PDF-1.4\n")
	offsets := make([]int, len(objects)+1)
	for i, body := range objects {
		offsets[i+1] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", i+1, body)
	}
	xref := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", len(objects)+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= len(objects); i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R /ID [<0102030405060708090a0b0c0d0e0f10> <0102030405060708090a0b0c0d0e0f10>] >>\n",
		len(objects)+1)
	fmt.Fprintf(&buf, "startxref\n%d\n%%%%EOF\n", xref)
	return buf.Bytes()
}

func writePDF(t *testing.T, name string, pages int) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, samplePDF(pages), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

// pageTexts 用 ledongthuc/pdf 读出每一页的文字（合并是普通 PDF，不含 CJK
// 子集字体，这个库能正常解析）。
func pageTexts(t *testing.T, path string) []string {
	t.Helper()
	f, r, err := pdf.Open(path)
	if err != nil {
		t.Fatalf("open merged pdf: %v", err)
	}
	defer f.Close()
	out := make([]string, 0, r.NumPage())
	for i := 1; i <= r.NumPage(); i++ {
		txt, err := r.Page(i).GetPlainText(nil)
		if err != nil {
			t.Fatalf("page %d text: %v", i, err)
		}
		out = append(out, strings.TrimSpace(txt))
	}
	return out
}

func TestInspect(t *testing.T) {
	path := writePDF(t, "a.pdf", 3)
	info := Inspect(path, "")
	if info.Error != "" {
		t.Fatalf("unexpected error: %s", info.Error)
	}
	if info.Pages != 3 {
		t.Errorf("pages = %d, want 3", info.Pages)
	}
	if info.Encrypted || info.NeedsPassword {
		t.Errorf("plain file reported as encrypted: %+v", info)
	}
	if info.Name != "a.pdf" || info.Size <= 0 {
		t.Errorf("name/size = %q/%d", info.Name, info.Size)
	}
}

func TestInspectNotPDF(t *testing.T) {
	path := filepath.Join(t.TempDir(), "fake.pdf")
	if err := os.WriteFile(path, []byte("hello, not a pdf"), 0o644); err != nil {
		t.Fatal(err)
	}
	info := Inspect(path, "")
	if info.Error == "" {
		t.Fatalf("want an error for a non-pdf file: %+v", info)
	}
	if _, err := inspect(path, ""); !errors.Is(err, ErrNotPDF) {
		t.Errorf("err = %v, want ErrNotPDF", err)
	}
}

func TestInspectEncrypted(t *testing.T) {
	path := writePDF(t, "locked.pdf", 2)
	if _, err := pdfcrypt.Protect(path, pdfcrypt.Options{UserPassword: "s3cret"}); err != nil {
		t.Fatalf("protect: %v", err)
	}

	info := Inspect(path, "")
	if info.Error != "" {
		t.Fatalf("unexpected error: %s", info.Error)
	}
	if !info.Encrypted || !info.NeedsPassword {
		t.Errorf("encrypted file not flagged: %+v", info)
	}

	withPW := Inspect(path, "s3cret")
	if withPW.Error != "" || withPW.Pages != 2 {
		t.Errorf("inspect with password = %+v", withPW)
	}
	if withPW.NeedsPassword {
		t.Errorf("password supplied but still asked for: %+v", withPW)
	}
}

func TestMergeKeepsOrderAndPages(t *testing.T) {
	a := writePDF(t, "a.pdf", 2)
	b := writePDF(t, "b.pdf", 3)
	out := filepath.Join(t.TempDir(), "merged.pdf")

	var phases []string
	res, err := Merge(Options{Files: []string{a, b}, OutPath: out}, func(cur, total int, name, phase string) {
		phases = append(phases, fmt.Sprintf("%s:%d/%d", phase, cur, total))
	})
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if res.Pages != 5 || res.Files != 2 {
		t.Errorf("result = %+v, want 5 pages / 2 files", res)
	}
	if res.Bytes <= 0 || res.Path != out {
		t.Errorf("result = %+v", res)
	}
	if _, err := os.Stat(out); err != nil {
		t.Errorf("output missing: %v", err)
	}
	texts := pageTexts(t, out)
	want := []string{"p1", "p2", "p1", "p2", "p3"}
	if strings.Join(texts, ",") != strings.Join(want, ",") {
		t.Errorf("page order = %v, want %v", texts, want)
	}
	// 每个输入文件上报一次 prepare，最后上报一次 merge
	if len(phases) != 3 || !strings.HasPrefix(phases[0], "prepare:0/2") ||
		!strings.HasPrefix(phases[1], "prepare:1/2") || !strings.HasPrefix(phases[2], "merge:2/2") {
		t.Errorf("progress = %v", phases)
	}
}

func TestMergeEncryptedInput(t *testing.T) {
	plain := writePDF(t, "plain.pdf", 1)
	locked := writePDF(t, "locked.pdf", 2)
	if _, err := pdfcrypt.Protect(locked, pdfcrypt.Options{UserPassword: "pw"}); err != nil {
		t.Fatalf("protect: %v", err)
	}
	out := filepath.Join(t.TempDir(), "merged.pdf")

	res, err := Merge(Options{
		Files:     []string{plain, locked},
		Passwords: map[string]string{locked: "pw"},
		OutPath:   out,
		Bookmarks: true,
	}, nil)
	if err != nil {
		t.Fatalf("merge: %v", err)
	}
	if res.Pages != 3 {
		t.Errorf("pages = %d, want 3", res.Pages)
	}
	texts := pageTexts(t, out)
	if strings.Join(texts, ",") != "p1,p1,p2" {
		t.Errorf("page order = %v, want [p1 p1 p2]", texts)
	}
	// 合并结果未加密，且带书签目录
	info := Inspect(out, "")
	if info.Encrypted {
		t.Errorf("merged file should not be encrypted: %+v", info)
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(raw, []byte("/Outlines")) {
		t.Errorf("bookmarks requested but no /Outlines in the output")
	}
}

func TestMergeWrongPassword(t *testing.T) {
	locked := writePDF(t, "locked.pdf", 1)
	if _, err := pdfcrypt.Protect(locked, pdfcrypt.Options{UserPassword: "right"}); err != nil {
		t.Fatalf("protect: %v", err)
	}
	out := filepath.Join(t.TempDir(), "merged.pdf")

	if _, err := Merge(Options{Files: []string{locked}, OutPath: out}, nil); err == nil {
		t.Error("want an error when the password is missing")
	}
	_, err := Merge(Options{Files: []string{locked}, Passwords: map[string]string{locked: "wrong"}, OutPath: out}, nil)
	if err == nil || !strings.Contains(err.Error(), "密码不正确") {
		t.Errorf("err = %v, want a wrong-password message", err)
	}
}

func TestMergeRejectsBadInput(t *testing.T) {
	good := writePDF(t, "good.pdf", 1)
	fake := filepath.Join(t.TempDir(), "fake.pdf")
	if err := os.WriteFile(fake, []byte("nope"), 0o644); err != nil {
		t.Fatal(err)
	}
	out := filepath.Join(t.TempDir(), "merged.pdf")

	_, err := Merge(Options{Files: []string{good, fake}, OutPath: out}, nil)
	if err == nil || !strings.Contains(err.Error(), "不是有效的 PDF") {
		t.Errorf("err = %v, want a not-a-pdf message", err)
	}
	if _, err := os.Stat(out); err == nil {
		t.Error("failed merge should not leave an output file")
	}
}

func TestMergeGuards(t *testing.T) {
	a := writePDF(t, "a.pdf", 1)
	dir := t.TempDir()

	if _, err := Merge(Options{OutPath: filepath.Join(dir, "x.pdf")}, nil); !errors.Is(err, ErrNoFiles) {
		t.Errorf("err = %v, want ErrNoFiles", err)
	}
	if _, err := Merge(Options{Files: []string{a}}, nil); !errors.Is(err, ErrNoOutPath) {
		t.Errorf("err = %v, want ErrNoOutPath", err)
	}
	if _, err := Merge(Options{Files: []string{a}, OutPath: a}, nil); !errors.Is(err, ErrSameFile) {
		t.Errorf("err = %v, want ErrSameFile", err)
	}
	if _, err := Merge(Options{Files: []string{a}, OutPath: filepath.Join(dir, "one.pdf")}, nil); err != nil {
		t.Errorf("single file merge: %v", err)
	}
}

func TestMergeNoBookmarksByDefault(t *testing.T) {
	a := writePDF(t, "a.pdf", 1)
	b := writePDF(t, "b.pdf", 1)
	out := filepath.Join(t.TempDir(), "merged.pdf")
	if _, err := Merge(Options{Files: []string{a, b}, OutPath: out}, nil); err != nil {
		t.Fatalf("merge: %v", err)
	}
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("/Outlines")) {
		t.Error("unexpected /Outlines when bookmarks were not requested")
	}
}
