package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcompress"
	"bookmanager/internal/pdfcrypt"
)

func TestPdfCompressInspectBinding(t *testing.T) {
	app := &App{}
	p := tmpPDF(t, "book.pdf", 3)

	info := app.PdfCompressInspect(p, "")
	if info.Error != "" || info.NeedsPassword || info.Encrypted {
		t.Fatalf("%+v", info)
	}
	if info.Pages != 3 || info.Name != "book.pdf" || info.Size == 0 || info.Version == "" {
		t.Fatalf("%+v", info)
	}
	// Ghostscript 检测结果要一起带回来（这台机器上装没装都算正常）
	if info.Ghostscript.Found && info.Ghostscript.Path == "" {
		t.Fatalf("找到了 Ghostscript 却没有路径：%+v", info.Ghostscript)
	}
	if info.Ghostscript.Found && info.Ghostscript.Source == "" {
		t.Fatalf("找到了 Ghostscript 却没有来源：%+v", info.Ghostscript)
	}

	if got := app.PdfCompressInspect("", ""); got.Error == "" {
		t.Fatal("空路径要带错误")
	}
	if got := app.PdfCompressInspect(filepath.Join(t.TempDir(), "nope.pdf"), ""); got.Error == "" {
		t.Fatal("文件不存在要带错误")
	}
	if got := app.PdfCompressInspect(t.TempDir(), ""); got.Error == "" {
		t.Fatal("目录要带错误")
	}
}

func TestPdfCompressInspectEncryptedBinding(t *testing.T) {
	app := &App{}
	p := tmpPDF(t, "enc.pdf", 2)
	if _, err := pdfcrypt.Protect(p, pdfcrypt.Options{UserPassword: "secret"}); err != nil {
		t.Fatal(err)
	}

	got := app.PdfCompressInspect(p, "")
	if !got.NeedsPassword || !got.Encrypted || got.Pages != 0 {
		t.Fatalf("%+v", got)
	}
	if got := app.PdfCompressInspect(p, "wrong"); !got.NeedsPassword {
		t.Fatalf("%+v", got)
	}
	ok := app.PdfCompressInspect(p, "secret")
	if ok.Error != "" || ok.NeedsPassword || !ok.Encrypted || ok.Pages != 2 {
		t.Fatalf("%+v", ok)
	}
}

func TestCompressPdfBinding(t *testing.T) {
	app := &App{}
	src := tmpPDF(t, "book.pdf", 4)
	out := filepath.Join(t.TempDir(), "small.pdf")

	res, err := app.CompressPdf(models.PdfCompressOptions{
		Path:    src,
		OutPath: out,
		Preset:  "ebook",
		Engine:  "pdfcpu", // 这台机器不一定有 Ghostscript，测试固定用无损优化
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.Engine != "pdfcpu" || res.Pages != 4 || res.InPlace || res.Path != out {
		t.Fatalf("%+v", res)
	}
	if res.InBytes <= 0 || res.OutBytes <= 0 || res.SavedBytes != res.InBytes-res.OutBytes {
		t.Fatalf("%+v", res)
	}
	if res.Preset != "ebook" || res.DPI != 150 {
		t.Fatalf("%+v", res)
	}
	if res.Added || res.BookID != 0 || res.ShelfError != "" {
		t.Fatalf("%+v", res)
	}
	if _, err := os.Stat(out); err != nil {
		t.Fatal(err)
	}
	if got := app.PdfCompressInspect(src, ""); got.Pages != 4 {
		t.Fatalf("原文件被改了：%+v", got)
	}
	if got := app.PdfCompressInspect(out, ""); got.Pages != 4 || got.Error != "" {
		t.Fatalf("输出不可读：%+v", got)
	}
}

func TestCompressPdfInPlaceBinding(t *testing.T) {
	app := &App{}
	src := tmpPDF(t, "book.pdf", 2)

	res, err := app.CompressPdf(models.PdfCompressOptions{Path: src, OutPath: src, Engine: "pdfcpu"})
	if err != nil {
		t.Fatal(err)
	}
	if !res.InPlace || res.InPath != src {
		t.Fatalf("%+v", res)
	}
	if got := app.PdfCompressInspect(src, ""); got.Pages != 2 || got.Error != "" {
		t.Fatalf("原地覆盖后文件损坏：%+v", got)
	}
}

func TestCompressPdfGuardsBinding(t *testing.T) {
	app := &App{}
	src := tmpPDF(t, "book.pdf", 1)
	out := filepath.Join(t.TempDir(), "o.pdf")
	enc := tmpPDF(t, "enc.pdf", 1)
	if _, err := pdfcrypt.Protect(enc, pdfcrypt.Options{UserPassword: "secret"}); err != nil {
		t.Fatal(err)
	}
	bad := filepath.Join(t.TempDir(), "bad.pdf")
	if err := os.WriteFile(bad, []byte("not a pdf"), 0o644); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		opts models.PdfCompressOptions
		want string
	}{
		{"no file", models.PdfCompressOptions{OutPath: out}, "请先选择要压缩的 PDF 文件"},
		{"no out", models.PdfCompressOptions{Path: src}, "请选择保存位置"},
		{"not pdf", models.PdfCompressOptions{Path: bad, OutPath: out}, "这个文件不是 PDF"},
		{"encrypted in place", models.PdfCompressOptions{Path: enc, OutPath: enc, Password: "secret"}, "加密的 PDF 不能覆盖原文件"},
		{"missing password", models.PdfCompressOptions{Path: enc, OutPath: out}, "已加密"},
		{"wrong password", models.PdfCompressOptions{Path: enc, OutPath: out, Password: "wrong"}, "已加密"},
	}
	for _, c := range cases {
		if _, err := app.CompressPdf(c.opts); err == nil || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("%s: err=%v want %q", c.name, err, c.want)
		}
	}

	// 加密文件另存：能压，结果是明文
	res, err := app.CompressPdf(models.PdfCompressOptions{Path: enc, OutPath: out, Password: "secret", Engine: "pdfcpu"})
	if err != nil {
		t.Fatal(err)
	}
	if res.Pages != 1 || res.InPlace {
		t.Fatalf("%+v", res)
	}
	if got := app.PdfCompressInspect(out, ""); got.Encrypted || got.NeedsPassword || got.Error != "" {
		t.Fatalf("压缩结果不该还要密码：%+v", got)
	}
}

func TestCompressPdfGhostscriptMissingBinding(t *testing.T) {
	app := &App{}
	src := tmpPDF(t, "book.pdf", 1)
	out := filepath.Join(t.TempDir(), "o.pdf")

	if pdfcompress.Detect().Found {
		t.Skip("本机装了 Ghostscript，跳过「找不到」的分支")
	}
	_, err := app.CompressPdf(models.PdfCompressOptions{Path: src, OutPath: out, Engine: "ghostscript"})
	if err == nil || !strings.Contains(err.Error(), "没有找到 Ghostscript") {
		t.Fatalf("err=%v", err)
	}
}

func TestClampDPI(t *testing.T) {
	cases := map[int]int{0: 0, -10: 0, 1: 36, 36: 36, 150: 150, 1200: 1200, 5000: 1200}
	for in, want := range cases {
		if got := clampDPI(in); got != want {
			t.Errorf("clampDPI(%d) = %d, want %d", in, got, want)
		}
	}
}

func TestCompressErrorMessages(t *testing.T) {
	cases := []struct {
		in   error
		want string
	}{
		{pdfcompress.ErrNoInput, "请先选择要压缩的 PDF 文件"},
		{pdfcompress.ErrNoOutPath, "请选择保存位置"},
		{pdfcompress.ErrNotPDF, "这个文件不是 PDF"},
		{pdfcompress.ErrEncryptedInPlace, "加密的 PDF 不能覆盖原文件"},
		{pdfcompress.ErrGSMissing, "没有找到 Ghostscript"},
		{pdfcompress.ErrPassword, "PDF 密码不正确或缺失"},
		{pdfcrypt.ErrPasswordRequired, "PDF 已加密"},
		{pdfcompress.ErrBadOutput, "压缩结果不可用"},
		{pdfcompress.ErrGSFailed, "Ghostscript 压缩失败"},
	}
	for _, c := range cases {
		err := compressError(c.in)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("compressError(%v) = %v, want %q", c.in, err, c.want)
		}
	}
	if err := compressError(nil); err != nil {
		t.Errorf("compressError(nil) = %v", err)
	}
	custom := errors.New("随便一个错误")
	if got := compressError(custom); got != custom {
		t.Errorf("未知错误应原样返回，得到 %v", got)
	}
}

// TestPdfCompressJSONContract 走一遍真正的 JSON：结构体字面量测不出 json tag
// 和前端 types.ts 不一致的问题。
func TestPdfCompressJSONContract(t *testing.T) {
	app := &App{}
	src := tmpPDF(t, "book.pdf", 2)
	out := filepath.Join(t.TempDir(), "out.pdf")

	payload := `{` +
		`"path":` + strconv.Quote(src) + `,` +
		`"password":"",` +
		`"out_path":` + strconv.Quote(out) + `,` +
		`"preset":"printer",` +
		`"dpi":200,` +
		`"grayscale":true,` +
		`"engine":"pdfcpu",` +
		`"add_to_shelf":false}`
	var opts models.PdfCompressOptions
	if err := json.Unmarshal([]byte(payload), &opts); err != nil {
		t.Fatalf("unmarshal options: %v", err)
	}
	if opts.Path != src || opts.OutPath != out || opts.Preset != "printer" || opts.DPI != 200 ||
		!opts.Grayscale || opts.Engine != "pdfcpu" || opts.AddToShelf {
		t.Fatalf("前端 JSON 没解全：%+v", opts)
	}

	res, err := app.CompressPdf(opts)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(res)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{
		"path", "in_path", "in_bytes", "out_bytes", "saved_bytes", "saved_percent",
		"pages", "engine", "gs_version", "preset", "dpi", "in_place", "seconds",
		"added", "book_id", "shelf_error",
	} {
		if _, ok := m[key]; !ok {
			t.Errorf("结果少了 %s：%s", key, raw)
		}
	}
	if m["path"] != out || m["in_place"] != false || m["dpi"] != float64(200) || m["preset"] != "printer" {
		t.Errorf("结果不对：%s", raw)
	}

	// Inspect 这条路上的键也要钉住
	infoRaw, err := json.Marshal(app.PdfCompressInspect(src, ""))
	if err != nil {
		t.Fatal(err)
	}
	var im map[string]any
	if err := json.Unmarshal(infoRaw, &im); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{
		"path", "name", "size", "pages", "version", "encrypted", "needs_password", "error", "ghostscript",
	} {
		if _, ok := im[key]; !ok {
			t.Errorf("信息少了 %s：%s", key, infoRaw)
		}
	}
	gs, ok := im["ghostscript"].(map[string]any)
	if !ok {
		t.Fatalf("ghostscript 不是对象：%s", infoRaw)
	}
	for _, key := range []string{"found", "path", "version", "source"} {
		if _, ok := gs[key]; !ok {
			t.Errorf("Ghostscript 信息少了 %s：%s", key, infoRaw)
		}
	}

	// 进度事件也是前端要解的 JSON
	progressRaw, err := json.Marshal(models.PdfCompressProgress{Phase: "compress", Percent: 20, Elapsed: 1.5})
	if err != nil {
		t.Fatal(err)
	}
	var pm map[string]any
	if err := json.Unmarshal(progressRaw, &pm); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{"phase", "percent", "elapsed"} {
		if _, ok := pm[key]; !ok {
			t.Errorf("进度少了 %s：%s", key, progressRaw)
		}
	}
}
