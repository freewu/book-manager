package pdfmeta

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"bookmanager/internal/pdfcrypt"
)

// samplePDF 生成一个 1 页的最小合法 PDF，附带 infoDict 作为 Info 字典
// （trailer 里的 /Info 指向它）。
func samplePDF(infoDict string) []byte {
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R " +
			"/Resources << /Font << /F1 5 0 R >> >> >>",
	}
	stream := "BT /F1 24 Tf 20 100 Td (p1) Tj ET"
	objects = append(objects,
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
	)
	infoNum := len(objects) + 1
	objects = append(objects, infoDict)

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
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root 1 0 R /Info %d 0 R "+
		"/ID [<0102030405060708090a0b0c0d0e0f10> <0102030405060708090a0b0c0d0e0f10>] >>\n",
		len(objects)+1, infoNum)
	fmt.Fprintf(&buf, "startxref\n%d\n%%%%EOF\n", xref)
	return buf.Bytes()
}

// sampleInfo 除四个可编辑字段外还带 Creator / Producer / 时间，
// 用来验证没动过的键会原样保留。
const sampleInfo = "<< /Title (Old Title) /Author (Old Author) /Subject (Old Subject) " +
	"/Keywords (alpha; beta) /Creator (Unit Test) /Producer (pdfmeta test) " +
	"/CreationDate (D:20240102030405+08'00') /ModDate (D:20240203040506+08'00') /BmNote(keep me) >>"

func writePDF(t *testing.T, name, infoDict string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, samplePDF(infoDict), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

func noTempFiles(t *testing.T, dir string) {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read dir: %v", err)
	}
	for _, e := range entries {
		if strings.Contains(e.Name(), "bookmanager") {
			t.Errorf("临时文件没有清理：%s", e.Name())
		}
	}
}

func TestInspectReadsInfoDict(t *testing.T) {
	path := writePDF(t, "src.pdf", sampleInfo)
	info, err := Inspect(path, "")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if info.Title != "Old Title" || info.Author != "Old Author" || info.Subject != "Old Subject" {
		t.Errorf("可编辑字段读错了：%+v", info)
	}
	if strings.Join(info.Keywords, "|") != "alpha|beta" {
		t.Errorf("关键词 = %v", info.Keywords)
	}
	if info.Creator != "Unit Test" || info.Producer != "pdfmeta test" {
		t.Errorf("Creator/Producer = %q / %q", info.Creator, info.Producer)
	}
	if !strings.Contains(info.CreationDate, "2024") || !strings.Contains(info.ModDate, "2024") {
		t.Errorf("时间 = %q / %q", info.CreationDate, info.ModDate)
	}
	if info.Pages != 1 {
		t.Errorf("页数 = %d", info.Pages)
	}
	if info.Version == "" {
		t.Error("版本号读不到")
	}
	if info.Encrypted {
		t.Error("明文文件不该报加密")
	}
	if info.Name != "src.pdf" || info.Size <= 0 || info.Path != path {
		t.Errorf("文件信息 = %+v", info)
	}
}

func TestInspectErrors(t *testing.T) {
	if _, err := Inspect("", ""); !errors.Is(err, ErrNoInput) {
		t.Errorf("空路径 = %v", err)
	}
	if _, err := Inspect(filepath.Join(t.TempDir(), "missing.pdf"), ""); err == nil {
		t.Error("文件不存在却成功了")
	}

	dir := t.TempDir()
	bad := filepath.Join(dir, "bad.pdf")
	if err := os.WriteFile(bad, []byte("this is not a pdf"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(bad, ""); !errors.Is(err, ErrNotPDF) {
		t.Errorf("坏文件 = %v", err)
	}
	empty := filepath.Join(dir, "empty.pdf")
	if err := os.WriteFile(empty, nil, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(empty, ""); !errors.Is(err, ErrNotPDF) {
		t.Errorf("空文件 = %v", err)
	}
	if _, err := Inspect(dir, ""); !errors.Is(err, ErrNotPDF) {
		t.Errorf("目录 = %v", err)
	}
}

func TestSaveWritesFields(t *testing.T) {
	path := writePDF(t, "src.pdf", sampleInfo)
	out := filepath.Join(filepath.Dir(path), "out.pdf")

	res, err := Save(Options{
		Path:     path,
		OutPath:  out,
		Title:    "New Title",
		Author:   "New Author",
		Subject:  "New Subject",
		Keywords: []string{" gamma ", "ALPHA", "beta", "beta"},
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if res.InPlace {
		t.Error("另存不该报 InPlace")
	}
	if strings.Join(res.Changed, ",") != "Title,Author,Subject,Keywords" {
		t.Errorf("Changed = %v", res.Changed)
	}
	if res.Bytes <= 0 || res.Path != out {
		t.Errorf("结果 = %+v", res)
	}

	got, err := Inspect(out, "")
	if err != nil {
		t.Fatalf("Inspect(out): %v", err)
	}
	if got.Title != "New Title" || got.Author != "New Author" || got.Subject != "New Subject" {
		t.Errorf("写入后可编辑字段 = %+v", got)
	}
	if strings.Join(got.Keywords, "|") != "ALPHA|beta|gamma" {
		t.Errorf("关键词去空白去重排序后 = %v", got.Keywords)
	}
	// 没动过的键必须原样保留（Producer / 时间由 pdfcpu 重写文件时盖章，见
	// pdfcpu 的 ensureInfoDict）
	if got.Creator != "Unit Test" {
		t.Errorf("Creator 被改了：%q", got.Creator)
	}
	if !strings.Contains(got.Producer, "pdfcpu") {
		t.Errorf("Producer 应该是重写文件的工具：%q", got.Producer)
	}
	if got.ModDate == "" {
		t.Error("ModDate 为空")
	}
	if got.Pages != 1 || got.Encrypted {
		t.Errorf("页数/加密 = %d / %v", got.Pages, got.Encrypted)
	}

	// Info 字典里不是本工具管的键也要原样保留
	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("/Creator")) && !bytes.Contains(raw, []byte("/BmNote(keep me)")) {
		t.Error("自定义键 /BmNote 没有保留")
	}

	// 原文件不动
	src, err := Inspect(path, "")
	if err != nil {
		t.Fatalf("Inspect(src): %v", err)
	}
	if src.Title != "Old Title" || strings.Join(src.Keywords, "|") != "alpha|beta" {
		t.Errorf("原文件被改了：%+v", src)
	}
	noTempFiles(t, filepath.Dir(path))
}

func TestSaveUnicodeRoundTrip(t *testing.T) {
	path := writePDF(t, "uni.pdf", "<< /Title (plain) >>")
	out := filepath.Join(filepath.Dir(path), "uni-out.pdf")

	const title = "活着：余华 著（修订版）😀"
	res, err := Save(Options{
		Path:     path,
		OutPath:  out,
		Title:    title,
		Author:   "余华",
		Subject:  "长篇小说",
		Keywords: []string{"当代文学", "中国文学；经典"},
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if strings.Join(res.Changed, ",") != "Title,Author,Subject,Keywords" {
		t.Errorf("Changed = %v", res.Changed)
	}

	got, err := Inspect(out, "")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if got.Title != title {
		t.Errorf("标题 = %q，想要 %q", got.Title, title)
	}
	if got.Author != "余华" || got.Subject != "长篇小说" {
		t.Errorf("作者/主题 = %q / %q", got.Author, got.Subject)
	}
	if strings.Join(got.Keywords, "|") != "中国文学；经典|当代文学" {
		t.Errorf("中文关键词 = %v", got.Keywords)
	}
}

func TestSaveClearsFields(t *testing.T) {
	path := writePDF(t, "clear.pdf", sampleInfo)
	out := filepath.Join(filepath.Dir(path), "clear-out.pdf")

	res, err := Save(Options{Path: path, OutPath: out}) // 四个字段都空 = 清空
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if strings.Join(res.Changed, ",") != "Title,Author,Subject,Keywords" {
		t.Errorf("Changed = %v", res.Changed)
	}

	got, err := Inspect(out, "")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if got.Title != "" || got.Author != "" || got.Subject != "" || len(got.Keywords) != 0 {
		t.Errorf("清空后还有值：%+v", got)
	}
	if got.Creator != "Unit Test" {
		t.Errorf("清空误伤了其它键：%q", got.Creator)
	}

	raw, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(raw, []byte("/Creator")) {
		// Info 字典没被压缩成对象流，可以直接看原始键
		for _, key := range []string{"/Title", "/Author", "/Subject", "/Keywords"} {
			if bytes.Contains(raw, []byte(key)) {
				t.Errorf("清空的字段 %s 还留在 Info 字典里", key)
			}
		}
	}
}

func TestSavePartialChange(t *testing.T) {
	path := writePDF(t, "part.pdf", sampleInfo)
	out := filepath.Join(filepath.Dir(path), "part-out.pdf")

	res, err := Save(Options{
		Path:     path,
		OutPath:  out,
		Title:    "只改标题",
		Author:   "Old Author",              // 没变
		Subject:  " Old Subject ",           // 仅空白差异 = 没变
		Keywords: []string{"beta", "alpha"}, // 顺序不同 = 没变
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if strings.Join(res.Changed, ",") != "Title" {
		t.Errorf("Changed = %v，只该有 Title", res.Changed)
	}
	got, err := Inspect(out, "")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if got.Title != "只改标题" || got.Author != "Old Author" || got.Subject != "Old Subject" {
		t.Errorf("字段 = %+v", got)
	}
}

func TestSaveInPlace(t *testing.T) {
	path := writePDF(t, "inplace.pdf", sampleInfo)

	res, err := Save(Options{
		Path:     path,
		OutPath:  path,
		Title:    "改名了",
		Author:   "Old Author",
		Subject:  "Old Subject",
		Keywords: []string{"只有一个"},
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if !res.InPlace {
		t.Error("原地覆盖应报 InPlace")
	}
	if strings.Join(res.Changed, ",") != "Title,Keywords" {
		t.Errorf("Changed = %v", res.Changed)
	}

	got, err := Inspect(path, "")
	if err != nil {
		t.Fatalf("Inspect: %v", err)
	}
	if got.Title != "改名了" || strings.Join(got.Keywords, "|") != "只有一个" {
		t.Errorf("原地覆盖后 = %+v", got)
	}
	if got.Author != "Old Author" || got.Creator != "Unit Test" || got.Pages != 1 {
		t.Errorf("原地覆盖弄坏了别的字段：%+v", got)
	}
	noTempFiles(t, filepath.Dir(path))
}

func TestSaveInPlaceNoChangeKeepsFile(t *testing.T) {
	path := writePDF(t, "same.pdf", sampleInfo)
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}

	res, err := Save(Options{
		Path:     path,
		OutPath:  path,
		Title:    "Old Title",
		Author:   "Old Author",
		Subject:  "Old Subject",
		Keywords: []string{"beta", "alpha"},
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if len(res.Changed) != 0 || !res.InPlace {
		t.Errorf("结果 = %+v", res)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(before, after) {
		t.Error("没有改动却重写了文件")
	}
}

func TestSaveErrors(t *testing.T) {
	if _, err := Save(Options{OutPath: "x.pdf"}); !errors.Is(err, ErrNoInput) {
		t.Errorf("没选文件 = %v", err)
	}
	path := writePDF(t, "err.pdf", sampleInfo)
	if _, err := Save(Options{Path: path}); !errors.Is(err, ErrNoOutPath) {
		t.Errorf("没给输出 = %v", err)
	}

	bad := filepath.Join(t.TempDir(), "bad.pdf")
	if err := os.WriteFile(bad, []byte("not a pdf"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Save(Options{Path: bad, OutPath: filepath.Join(t.TempDir(), "o.pdf")}); !errors.Is(err, ErrNotPDF) {
		t.Errorf("坏文件 = %v", err)
	}
}

func TestEncryptedSource(t *testing.T) {
	path := writePDF(t, "enc.pdf", sampleInfo)
	if _, err := pdfcrypt.Protect(path, pdfcrypt.Options{UserPassword: "secret"}); err != nil {
		t.Fatalf("Protect: %v", err)
	}

	if _, err := Inspect(path, ""); !errors.Is(err, pdfcrypt.ErrPasswordRequired) {
		t.Errorf("不给密码 = %v", err)
	}
	if _, err := Inspect(path, "wrong"); !errors.Is(err, pdfcrypt.ErrPasswordRequired) {
		t.Errorf("错密码 = %v", err)
	}

	info, err := Inspect(path, "secret")
	if err != nil {
		t.Fatalf("Inspect(secret): %v", err)
	}
	if !info.Encrypted || info.Title != "Old Title" || info.Pages != 1 {
		t.Errorf("加密文件的信息 = %+v", info)
	}

	// 加密文件不能原地覆盖：写出来会丢掉密码保护
	if _, err := Save(Options{Path: path, OutPath: path, Password: "secret", Title: "x"}); !errors.Is(err, ErrEncryptedInPlace) {
		t.Errorf("加密原地覆盖 = %v", err)
	}

	// 另存：副本是明文，原文件不受影响
	out := filepath.Join(filepath.Dir(path), "enc-out.pdf")
	res, err := Save(Options{
		Path:     path,
		OutPath:  out,
		Password: "secret",
		Title:    "加密改标题",
		Author:   "Old Author",
		Subject:  "Old Subject",
		Keywords: []string{"alpha", "beta"},
	})
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if strings.Join(res.Changed, ",") != "Title" {
		t.Errorf("Changed = %v", res.Changed)
	}
	got, err := Inspect(out, "")
	if err != nil {
		t.Fatalf("Inspect(out): %v", err)
	}
	if got.Encrypted {
		t.Error("另存出来的文件不该带密码")
	}
	if got.Title != "加密改标题" || got.Author != "Old Author" || got.Pages != 1 {
		t.Errorf("另存结果 = %+v", got)
	}

	src, err := Inspect(path, "secret")
	if err != nil {
		t.Fatalf("Inspect(src): %v", err)
	}
	if src.Title != "Old Title" {
		t.Errorf("原加密文件被改了：%+v", src)
	}
	noTempFiles(t, filepath.Dir(path))

	// 错密码保存
	if _, err := Save(Options{Path: path, OutPath: out, Password: "nope", Title: "x"}); !errors.Is(err, pdfcrypt.ErrPasswordRequired) {
		t.Errorf("错密码保存 = %v", err)
	}
}
