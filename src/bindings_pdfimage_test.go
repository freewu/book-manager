package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"bookmanager/internal/models"
)

// 1x1 透明 PNG，用来验证图片落盘链路（不需要真的渲染）。
const tinyPNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="

func TestSavePdfImageBinding(t *testing.T) {
	a := &App{}
	dir := filepath.Join(t.TempDir(), "out")

	res, err := a.SavePdfImage(models.PdfImageOptions{
		Dir: dir, Prefix: "huozhe", Format: "png", Page: 21, Total: 23, Data: tinyPNG,
	})
	if err != nil {
		t.Fatalf("SavePdfImage: %v", err)
	}
	if res.Name != "huozhe-021.png" || res.Page != 21 || res.Existed {
		t.Fatalf("结果异常: %+v", res)
	}
	if want := filepath.Join(dir, "huozhe-021.png"); res.Path != want {
		t.Fatalf("路径 = %s, 期望 %s", res.Path, want)
	}
	got, err := os.ReadFile(res.Path)
	if err != nil {
		t.Fatalf("读回: %v", err)
	}
	want, _ := base64.StdEncoding.DecodeString(tinyPNG)
	if string(got) != string(want) || res.Bytes != int64(len(want)) {
		t.Fatalf("内容/字节数异常: %d vs %d", res.Bytes, len(want))
	}

	// 重名文件会被覆盖，并且如实上报
	again, err := a.SavePdfImage(models.PdfImageOptions{
		Dir: dir, Prefix: "huozhe", Format: "png", Page: 21, Total: 23, Data: tinyPNG,
	})
	if err != nil {
		t.Fatalf("第二次 SavePdfImage: %v", err)
	}
	if !again.Existed || again.Path != res.Path {
		t.Fatalf("覆盖上报异常: %+v", again)
	}

	// jpg 走 .jpg 扩展名
	jpg, err := a.SavePdfImage(models.PdfImageOptions{
		Dir: dir, Prefix: "huozhe", Format: "jpg", Page: 1, Total: 23, Data: tinyPNG,
	})
	if err != nil || !strings.HasSuffix(jpg.Name, ".jpg") {
		t.Fatalf("jpg: %+v %v", jpg, err)
	}
}

func TestSavePdfImageErrors(t *testing.T) {
	a := &App{}
	dir := t.TempDir()
	cases := []struct {
		name string
		opts models.PdfImageOptions
		want string
	}{
		{"坏 base64", models.PdfImageOptions{Dir: dir, Format: "png", Page: 1, Data: "!!!not base64!!!"}, "图片数据损坏"},
		{"空数据", models.PdfImageOptions{Dir: dir, Format: "png", Page: 1}, "没有渲染出图片"},
		{"没有目录", models.PdfImageOptions{Format: "png", Page: 1, Data: tinyPNG}, "请先选择输出目录"},
		{"格式不支持", models.PdfImageOptions{Dir: dir, Format: "webp", Page: 1, Data: tinyPNG}, "只支持 PNG 和 JPEG"},
		{"页码越界", models.PdfImageOptions{Dir: dir, Format: "png", Page: 9, Total: 3, Data: tinyPNG}, "页码不合法"},
	}
	for _, c := range cases {
		_, err := a.SavePdfImage(c.opts)
		if err == nil || !strings.Contains(err.Error(), c.want) {
			t.Errorf("%s: err = %v, 期望包含 %q", c.name, err, c.want)
		}
	}
}
