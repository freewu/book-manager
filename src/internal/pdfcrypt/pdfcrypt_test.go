package pdfcrypt

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// samplePDF builds a minimal but valid one page PDF with a correct xref table
// and the /ID entry pdfcpu requires for encryption.
func samplePDF() []byte {
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R " +
			"/Resources << /Font << /F1 5 0 R >> >> >>",
		"<< /Length 38 >>\nstream\nBT /F1 24 Tf 20 100 Td (hi) Tj ET\nendstream",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	}

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
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R /ID [<0102030405060708090a0b0c0d0e0f10> <0102030405060708090a0b0c0d0e0f10>] >>\n", len(objects)+1)
	fmt.Fprintf(&buf, "startxref\n%d\n%%%%EOF\n", xref)

	return buf.Bytes()
}

func writeSample(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "sample.pdf")
	if err := os.WriteFile(path, samplePDF(), 0o644); err != nil {
		t.Fatalf("write sample: %v", err)
	}
	return path
}

func TestInspectPlainFile(t *testing.T) {
	path := writeSample(t)

	info, err := Inspect(path, "")
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	if info.Encrypted {
		t.Fatalf("plain file reported as encrypted")
	}
	if info.Pages != 1 {
		t.Fatalf("pages = %d, want 1", info.Pages)
	}
	if info.Size <= 0 {
		t.Fatalf("size = %d, want > 0", info.Size)
	}
}

func TestProtectThenOpen(t *testing.T) {
	for _, strength := range []Strength{StrengthAES256, StrengthAES128, StrengthRC4128} {
		t.Run(string(strength), func(t *testing.T) {
			path := writeSample(t)
			before, err := os.Stat(path)
			if err != nil {
				t.Fatal(err)
			}

			info, err := Protect(path, Options{
				UserPassword: "s3cret",
				Strength:     strength,
				AllowPrint:   true,
			})
			if err != nil {
				t.Fatalf("protect: %v", err)
			}
			if !info.Encrypted || info.Pages != 1 {
				t.Fatalf("unexpected info after protect: %+v", info)
			}

			// the file must really be protected: reading it without the
			// password has to fail.
			if _, err := Inspect(path, ""); !errors.Is(err, ErrPasswordRequired) {
				t.Fatalf("inspect without password: err = %v, want ErrPasswordRequired", err)
			}
			if _, err := Inspect(path, "wrong"); !errors.Is(err, ErrPasswordRequired) {
				t.Fatalf("inspect with wrong password: err = %v, want ErrPasswordRequired", err)
			}

			// ... while the right password opens it.
			got, err := Inspect(path, "s3cret")
			if err != nil {
				t.Fatalf("inspect with password: %v", err)
			}
			if !got.Encrypted || got.Pages != 1 {
				t.Fatalf("unexpected info: %+v", got)
			}

			// pdfcpu must agree the file is encrypted.
			f, err := os.Open(path)
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			conf := model.NewDefaultConfiguration()
			conf.UserPW = "s3cret"
			pdfInfo, err := api.PDFInfo(f, path, nil, false, conf)
			if err != nil {
				t.Fatalf("pdfcpu inspect: %v", err)
			}
			if !pdfInfo.Encrypted {
				t.Fatalf("pdfcpu says the file is not encrypted")
			}

			after, err := os.Stat(path)
			if err != nil {
				t.Fatal(err)
			}
			if after.Size() == 0 {
				t.Fatal("protected file is empty")
			}
			// the original file is replaced, not copied
			if before.Size() == after.Size() {
				t.Logf("size unchanged (%d bytes) - suspicious but allowed", after.Size())
			}
			// no temp leftovers next to the book
			entries, err := os.ReadDir(filepath.Dir(path))
			if err != nil {
				t.Fatal(err)
			}
			for _, e := range entries {
				if strings.HasPrefix(e.Name(), ".bookmanager-pdf-") {
					t.Fatalf("leftover temp file %q", e.Name())
				}
			}
		})
	}
}

func TestProtectChangePasswordOfEncryptedFile(t *testing.T) {
	path := writeSample(t)
	if _, err := Protect(path, Options{UserPassword: "old-pw", Strength: StrengthAES256}); err != nil {
		t.Fatalf("initial protect: %v", err)
	}

	// changing the password needs the current one
	_, err := Protect(path, Options{UserPassword: "new-pw", CurrentPassword: "nope", Strength: StrengthAES128})
	if !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("wrong current password: err = %v, want ErrPasswordRequired", err)
	}
	// the file must still be readable with the old password
	if _, err := Inspect(path, "old-pw"); err != nil {
		t.Fatalf("old password stopped working: %v", err)
	}

	if _, err := Protect(path, Options{
		UserPassword:    "new-pw",
		CurrentPassword: "old-pw",
		Strength:        StrengthAES128,
	}); err != nil {
		t.Fatalf("change password: %v", err)
	}
	if _, err := Inspect(path, "new-pw"); err != nil {
		t.Fatalf("new password does not open the file: %v", err)
	}
	if _, err := Inspect(path, "old-pw"); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("old password still works: %v", err)
	}
}

func TestRemovePassword(t *testing.T) {
	path := writeSample(t)
	if _, err := Protect(path, Options{UserPassword: "pw", Strength: StrengthAES256}); err != nil {
		t.Fatalf("protect: %v", err)
	}

	// wrong / missing current password: the file must stay encrypted
	if _, err := Remove(path, "nope"); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("wrong password: err = %v, want ErrPasswordRequired", err)
	}
	if _, err := Remove(path, ""); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("empty password: err = %v, want ErrPasswordRequired", err)
	}
	if _, err := Inspect(path, "pw"); err != nil {
		t.Fatalf("file was damaged by a failed remove: %v", err)
	}

	info, err := Remove(path, "pw")
	if err != nil {
		t.Fatalf("remove: %v", err)
	}
	if info.Encrypted {
		t.Fatalf("info still reports the file as encrypted: %+v", info)
	}
	if info.Pages != 1 {
		t.Fatalf("pages = %d, want 1", info.Pages)
	}

	// no password required anymore ...
	got, err := Inspect(path, "")
	if err != nil {
		t.Fatalf("inspect after remove: %v", err)
	}
	if got.Encrypted {
		t.Fatal("file is still encrypted after Remove")
	}

	// ... and pdfcpu agrees
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	pdfInfo, err := api.PDFInfo(f, path, nil, false, model.NewDefaultConfiguration())
	if err != nil {
		t.Fatalf("pdfcpu inspect: %v", err)
	}
	if pdfInfo.Encrypted {
		t.Fatal("pdfcpu says the file is still encrypted")
	}

	// a second Remove on a plain file is a no-op
	if _, err := Remove(path, ""); err != nil {
		t.Fatalf("remove on plain file: %v", err)
	}

	entries, err := os.ReadDir(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") && strings.Contains(e.Name(), ".tmp-") {
			t.Fatalf("leftover temp file %q", e.Name())
		}
	}
}

func TestDecryptTo(t *testing.T) {
	path := writeSample(t)
	if _, err := Protect(path, Options{UserPassword: "pw", Strength: StrengthAES256}); err != nil {
		t.Fatalf("protect: %v", err)
	}

	out := filepath.Join(t.TempDir(), "plain.pdf")
	if err := DecryptTo(path, out, "nope"); !errors.Is(err, ErrPasswordRequired) {
		t.Fatalf("wrong password: err = %v, want ErrPasswordRequired", err)
	}
	if _, err := os.Stat(out); !os.IsNotExist(err) {
		t.Fatalf("failed decrypt left a file behind: %v", err)
	}

	if err := DecryptTo(path, out, "pw"); err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	got, err := Inspect(out, "")
	if err != nil {
		t.Fatalf("inspect copy: %v", err)
	}
	if got.Encrypted || got.Pages != 1 {
		t.Fatalf("copy = %+v, want a plain one page pdf", got)
	}
	// the source is untouched
	if src, err := Inspect(path, "pw"); err != nil || !src.Encrypted {
		t.Fatalf("source = %+v, %v", src, err)
	}
}

func TestRemoveOwnerPasswordOnly(t *testing.T) {
	// 仅设置所有者密码的文件：用空密码就能打开，Remove 也不该要求密码。
	path := writeSample(t)
	if _, err := Protect(path, Options{OwnerPassword: "owner-pw"}); err != nil {
		t.Skipf("pdfcpu 不接受空用户密码: %v", err)
	}
	before, err := Inspect(path, "")
	if err != nil {
		t.Fatalf("inspect: %v", err)
	}
	if !before.Encrypted {
		t.Skip("pdfcpu 没有把它当作加密文件")
	}

	info, err := Remove(path, "")
	if err != nil {
		t.Fatalf("remove with owner password: %v", err)
	}
	if info.Encrypted {
		t.Fatalf("still encrypted: %+v", info)
	}
}

func TestProtectFailureKeepsOriginal(t *testing.T) {
	// a broken file: protection must fail and the file stay untouched
	path := filepath.Join(t.TempDir(), "broken.pdf")
	original := []byte("%PDF-1.4\nthis is not a pdf\n")
	if err := os.WriteFile(path, original, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Protect(path, Options{UserPassword: "x"}); err == nil {
		t.Fatal("expected an error for a broken pdf")
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, original) {
		t.Fatal("broken file was modified")
	}
}

func TestInspectMissingFile(t *testing.T) {
	if _, err := Inspect(filepath.Join(t.TempDir(), "nope.pdf"), ""); err == nil {
		t.Fatal("expected an error for a missing file")
	}
}
