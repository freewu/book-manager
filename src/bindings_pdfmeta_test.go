package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"bookmanager/internal/models"
	"bookmanager/internal/pdfcrypt"
	"bookmanager/internal/pdfmeta"
)

// seedMetaPDF 生成一份 2 页 PDF 并写好初始文档信息（复用合并测试的生成器）。
func seedMetaPDF(t *testing.T, name string) string {
	t.Helper()
	p := tmpPDF(t, name, 2)
	if _, err := pdfmeta.Save(pdfmeta.Options{
		Path:     p,
		OutPath:  p,
		Title:    "初始标题",
		Author:   "初始作者",
		Subject:  "初始主题",
		Keywords: []string{"标签一", "标签二"},
	}); err != nil {
		t.Fatalf("seed %s: %v", name, err)
	}
	return p
}

func TestPdfMetaInspectBinding(t *testing.T) {
	app := &App{}
	p := seedMetaPDF(t, "meta.pdf")

	info := app.PdfMetaInspect(p, "")
	if info.Error != "" || info.NeedsPassword || info.Encrypted {
		t.Fatalf("%+v", info)
	}
	if info.Title != "初始标题" || info.Author != "初始作者" || info.Subject != "初始主题" {
		t.Fatalf("%+v", info)
	}
	if strings.Join(info.Keywords, "|") != "标签一|标签二" {
		t.Fatalf("keywords = %v", info.Keywords)
	}
	if info.Pages != 2 || info.Name != "meta.pdf" || info.Size == 0 {
		t.Fatalf("%+v", info)
	}
	if info.Version == "" || info.Producer == "" {
		t.Fatalf("只读信息缺失：%+v", info)
	}

	if got := app.PdfMetaInspect("", ""); got.Error == "" {
		t.Fatal("空路径要带错误")
	}
	if got := app.PdfMetaInspect(filepath.Join(t.TempDir(), "nope.pdf"), ""); got.Error == "" {
		t.Fatal("文件不存在要带错误")
	}
	if got := app.PdfMetaInspect(t.TempDir(), ""); got.Error == "" {
		t.Fatal("目录要带错误")
	}
}

func TestPdfMetaInspectEncryptedBinding(t *testing.T) {
	app := &App{}
	p := seedMetaPDF(t, "enc.pdf")
	if _, err := pdfcrypt.Protect(p, pdfcrypt.Options{UserPassword: "secret"}); err != nil {
		t.Fatal(err)
	}

	got := app.PdfMetaInspect(p, "")
	if !got.NeedsPassword || !got.Encrypted || got.Pages != 0 {
		t.Fatalf("%+v", got)
	}
	if got := app.PdfMetaInspect(p, "wrong"); !got.NeedsPassword {
		t.Fatalf("%+v", got)
	}
	ok := app.PdfMetaInspect(p, "secret")
	if ok.Error != "" || ok.NeedsPassword || !ok.Encrypted || ok.Title != "初始标题" || ok.Pages != 2 {
		t.Fatalf("%+v", ok)
	}
}

func TestSavePdfMetaBinding(t *testing.T) {
	app := &App{}
	p := seedMetaPDF(t, "meta.pdf")
	out := filepath.Join(t.TempDir(), "out.pdf")

	// 另存：只改标题（关键词顺序不同不算改动）
	res, err := app.SavePdfMeta(models.PdfMetaOptions{
		Path:     p,
		OutPath:  out,
		Title:    "新标题",
		Author:   "初始作者",
		Subject:  "初始主题",
		Keywords: []string{"标签二", "标签一"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(res.Changed, ",") != "Title" || res.InPlace || res.Bytes == 0 || res.Path != out {
		t.Fatalf("%+v", res)
	}
	if got := app.PdfMetaInspect(out, ""); got.Title != "新标题" || got.Pages != 2 {
		t.Fatalf("%+v", got)
	}
	if _, err := os.Stat(out); err != nil {
		t.Fatal(err)
	}
	if got := app.PdfMetaInspect(p, ""); got.Title != "初始标题" {
		t.Fatalf("原文件被改了：%+v", got)
	}

	// 原地覆盖
	res2, err := app.SavePdfMeta(models.PdfMetaOptions{
		Path:     out,
		OutPath:  out,
		Title:    "改回来",
		Author:   "初始作者",
		Subject:  "初始主题",
		Keywords: []string{"标签一", "标签二"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !res2.InPlace || strings.Join(res2.Changed, ",") != "Title" {
		t.Fatalf("%+v", res2)
	}

	// 什么都不改：不该重写文件
	before, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	res3, err := app.SavePdfMeta(models.PdfMetaOptions{
		Path:     out,
		OutPath:  out,
		Title:    "改回来",
		Author:   "初始作者",
		Subject:  "初始主题",
		Keywords: []string{"标签一", "标签二"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(res3.Changed) != 0 {
		t.Fatalf("%+v", res3)
	}
	after, err := os.ReadFile(out)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("没有改动却重写了文件")
	}

	// 清空全部字段
	res4, err := app.SavePdfMeta(models.PdfMetaOptions{Path: out, OutPath: out})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(res4.Changed, ",") != "Title,Author,Subject,Keywords" {
		t.Fatalf("%+v", res4)
	}
	got := app.PdfMetaInspect(out, "")
	if got.Title != "" || got.Author != "" || got.Subject != "" || len(got.Keywords) != 0 {
		t.Fatalf("%+v", got)
	}
}

func TestSavePdfMetaGuardsBinding(t *testing.T) {
	app := &App{}
	p := seedMetaPDF(t, "meta.pdf")
	out := filepath.Join(t.TempDir(), "o.pdf")

	bad := filepath.Join(t.TempDir(), "bad.pdf")
	if err := os.WriteFile(bad, []byte("not a pdf"), 0o644); err != nil {
		t.Fatal(err)
	}
	enc := seedMetaPDF(t, "enc.pdf")
	if _, err := pdfcrypt.Protect(enc, pdfcrypt.Options{UserPassword: "secret"}); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		opts models.PdfMetaOptions
		want string
	}{
		{"no file", models.PdfMetaOptions{OutPath: out}, "请先选择要修改的 PDF 文件"},
		{"no out", models.PdfMetaOptions{Path: p}, "请选择保存位置"},
		{"not pdf", models.PdfMetaOptions{Path: bad, OutPath: out}, "这个文件不是 PDF"},
		{"encrypted in place", models.PdfMetaOptions{Path: enc, OutPath: enc, Password: "secret", Title: "x"}, "加密的 PDF 不能覆盖原文件"},
	}
	for _, c := range cases {
		_, err := app.SavePdfMeta(c.opts)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Fatalf("%s: err=%v want %q", c.name, err, c.want)
		}
	}

	// 加密文件另存：能改，结果是明文
	res, err := app.SavePdfMeta(models.PdfMetaOptions{
		Path:     enc,
		OutPath:  out,
		Password: "secret",
		Title:    "加密新标题",
		Author:   "初始作者",
		Subject:  "初始主题",
		Keywords: []string{"标签一", "标签二"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(res.Changed, ",") != "Title" {
		t.Fatalf("%+v", res)
	}
	plain := app.PdfMetaInspect(out, "")
	if plain.Encrypted || plain.NeedsPassword || plain.Title != "加密新标题" {
		t.Fatalf("%+v", plain)
	}
}

// TestPdfMetaJSONContract 走一遍真正的 JSON：结构体字面量测不出 json tag
// 和前端 types.ts 不一致的问题。
func TestPdfMetaJSONContract(t *testing.T) {
	app := &App{}
	p := seedMetaPDF(t, "meta.pdf")
	out := filepath.Join(t.TempDir(), "out.pdf")

	payload := `{` +
		`"path":` + strconv.Quote(p) + `,` +
		`"password":"",` +
		`"out_path":` + strconv.Quote(out) + `,` +
		`"title":"JSON 标题",` +
		`"author":"JSON 作者",` +
		`"subject":"JSON 主题",` +
		`"keywords":["k1","k2"],` +
		`"add_to_shelf":false}`
	var opts models.PdfMetaOptions
	if err := json.Unmarshal([]byte(payload), &opts); err != nil {
		t.Fatalf("unmarshal options: %v", err)
	}
	if opts.Path != p || opts.OutPath != out || opts.Title != "JSON 标题" ||
		opts.Author != "JSON 作者" || opts.Subject != "JSON 主题" ||
		len(opts.Keywords) != 2 || opts.AddToShelf {
		t.Fatalf("前端 JSON 没解全：%+v", opts)
	}

	res, err := app.SavePdfMeta(opts)
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
	for _, key := range []string{"path", "bytes", "changed", "in_place", "added", "book_id", "shelf_error"} {
		if _, ok := m[key]; !ok {
			t.Errorf("结果少了 %s：%s", key, raw)
		}
	}
	if m["path"] != out || m["in_place"] != false {
		t.Errorf("结果不对：%s", raw)
	}
	changed, ok := m["changed"].([]any)
	if !ok || len(changed) != 4 {
		t.Errorf("changed 应该是 4 个字段：%s", raw)
	}

	var back models.PdfMetaResult
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
	if back.Path != out || len(back.Changed) != 4 || back.InPlace {
		t.Fatalf("%+v", back)
	}

	// 读信息这条路上的键也要钉住
	infoRaw, err := json.Marshal(app.PdfMetaInspect(p, ""))
	if err != nil {
		t.Fatal(err)
	}
	var im map[string]any
	if err := json.Unmarshal(infoRaw, &im); err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{
		"path", "name", "size", "pages", "version", "encrypted", "needs_password", "error",
		"title", "author", "subject", "keywords", "creator", "producer", "creation_date", "mod_date",
	} {
		if _, ok := im[key]; !ok {
			t.Errorf("信息少了 %s：%s", key, infoRaw)
		}
	}
	if im["needs_password"] != false || im["pages"] != float64(2) {
		t.Errorf("信息不对：%s", infoRaw)
	}
}
