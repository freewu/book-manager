package pdfcompress

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/phpdave11/gofpdf"

	"bookmanager/internal/pdfcrypt"
)

// writeTestPDF 用 gofpdf 生成一个有 pages 页的 PDF（测试素材）。
func writeTestPDF(t *testing.T, path string, pages int) {
	t.Helper()
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetFont("Helvetica", "", 12)
	for i := 0; i < pages; i++ {
		pdf.AddPage()
		pdf.Cell(40, 10, "hello pdfcompress")
	}
	if err := pdf.OutputFileAndClose(path); err != nil {
		t.Fatalf("生成测试 PDF 失败：%v", err)
	}
}

func TestNormalizePresetAndDPI(t *testing.T) {
	cases := []struct {
		in   Preset
		want Preset
		dpi  int
	}{
		{PresetScreen, PresetScreen, 72},
		{PresetEbook, PresetEbook, 150},
		{PresetPrinter, PresetPrinter, 300},
		{PresetPrepress, PresetPrepress, 300},
		{"", PresetEbook, 150},
		{" EBOOK ", PresetEbook, 150},
		{"nonsense", PresetEbook, 150},
	}
	for _, c := range cases {
		if got := normalizePreset(c.in); got != c.want {
			t.Errorf("normalizePreset(%q) = %q, want %q", c.in, got, c.want)
		}
		if got := c.want.DPI(); got != c.dpi {
			t.Errorf("%q.DPI() = %d, want %d", c.want, got, c.dpi)
		}
	}
}

func TestNormalizeEngine(t *testing.T) {
	for in, want := range map[Engine]Engine{
		"":               EngineAuto,
		"auto":           EngineAuto,
		" Ghostscript ":  EngineGhostscript,
		"pdfcpu":         EnginePDFCPU,
		"something else": EngineAuto,
	} {
		if got := normalizeEngine(in); got != want {
			t.Errorf("normalizeEngine(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBuildGSArgsDefaultPreset(t *testing.T) {
	args := buildGSArgs(Options{}, "in.pdf", "out.pdf")
	joined := strings.Join(args, " ")

	for _, want := range []string{
		"-sDEVICE=pdfwrite",
		"-dPDFSETTINGS=/ebook",
		"-dCompatibilityLevel=1.7",
		"-dEmbedAllFonts=true",
		"-dCompressFonts=true",
		"-dSubsetFonts=true",
		"-dDetectDuplicateImages=true",
		"-dAutoRotatePages=/None",
		"-sOutputFile=out.pdf",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("缺少参数 %q：%s", want, joined)
		}
	}
	// 没有自定义分辨率 / 密码时不该出现这些开关
	for _, notWant := range []string{"-dColorImageResolution", "-sPDFPassword", "/Gray", "-dDownsampleColorImages"} {
		if strings.Contains(joined, notWant) {
			t.Errorf("不该出现参数 %q：%s", notWant, joined)
		}
	}
	// 输入文件必须排在最后（Ghostscript 要求）
	if args[len(args)-1] != "in.pdf" {
		t.Errorf("输入文件不是最后一个参数：%v", args)
	}
	if args[len(args)-2] != "-sOutputFile=out.pdf" {
		t.Errorf("输出参数位置不对：%v", args)
	}
}

func TestBuildGSArgsCustomOptions(t *testing.T) {
	args := buildGSArgs(Options{
		Preset:    PresetPrinter,
		DPI:       120,
		Grayscale: true,
		Password:  "s3cret",
	}, "in.pdf", "out.pdf")
	joined := strings.Join(args, " ")

	for _, want := range []string{
		"-dPDFSETTINGS=/printer",
		"-dDownsampleColorImages=true",
		"-dColorImageResolution=120",
		"-dDownsampleGrayImages=true",
		"-dGrayImageResolution=120",
		"-dDownsampleMonoImages=true",
		"-dMonoImageResolution=300", // 单色不低于 300，否则文字发虚
		"-dColorConversionStrategy=/Gray",
		"-sPDFPassword=s3cret",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("缺少参数 %q：%s", want, joined)
		}
	}
}

func TestBuildGSArgsHighDPIKeepsMonoDPI(t *testing.T) {
	args := buildGSArgs(Options{DPI: 600}, "in.pdf", "out.pdf")
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "-dMonoImageResolution=600") {
		t.Errorf("自定义 DPI 高于 300 时应直接用该值：%s", joined)
	}
}

func TestEffectiveDPI(t *testing.T) {
	if got := effectiveDPI(Options{}); got != 150 {
		t.Errorf("默认 DPI = %d, want 150", got)
	}
	if got := effectiveDPI(Options{Preset: PresetScreen}); got != 72 {
		t.Errorf("screen DPI = %d, want 72", got)
	}
	if got := effectiveDPI(Options{Preset: PresetPrepress, DPI: 96}); got != 96 {
		t.Errorf("自定义 DPI 应覆盖档位：%d", got)
	}
}

func TestParseGSVersion(t *testing.T) {
	cases := map[string]string{
		"GPL Ghostscript 10.08.0 (2025-05-07)": "10.08.0",
		"10.08.0\n":                            "10.08.0",
		"GPL Ghostscript 9.55":                 "9.55",
		"no version here":                      "",
		"":                                     "",
	}
	for in, want := range cases {
		if got := parseGSVersion(in); got != want {
			t.Errorf("parseGSVersion(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestIsPasswordOutput(t *testing.T) {
	yes := []string{
		"Error: /invalidfileaccess in --file--",
		"This file requires a password",
		"PASSWORD IS REQUIRED",
	}
	for _, s := range yes {
		if !isPasswordOutput(s) {
			t.Errorf("isPasswordOutput(%q) = false, want true", s)
		}
	}
	if isPasswordOutput("GPL Ghostscript 10.08.0") {
		t.Error("普通版本横幅不应判成密码错误")
	}
}

func TestTail(t *testing.T) {
	got := tail("a\nb\nc\nd\n", 2)
	if got != "c / d" {
		t.Errorf("tail = %q, want %q", got, "c / d")
	}
	long := tail(strings.Repeat("x", 900), 1)
	if runes := []rune(long); len(runes) > 401 || !strings.HasSuffix(long, "…") {
		t.Errorf("tail 没有截断：rune len=%d", len(runes))
	}
	if got := tail("  \r\n  ", 3); got != "" {
		t.Errorf("空输入应返回空串，得到 %q", got)
	}
}

func TestDetectSkipsMissingHints(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "gswin64c.exe")
	if err := os.WriteFile(real, []byte("not really ghostscript"), 0o644); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(dir, "nope.exe")

	gs := Detect(Hint{Path: missing, Source: SourceManual}, Hint{Path: real, Source: SourceRegistry})
	if !gs.Found {
		t.Fatal("应该找到存在的候选")
	}
	if gs.Path != real {
		t.Errorf("Path = %q, want %q", gs.Path, real)
	}
	if gs.Source != SourceRegistry {
		t.Errorf("Source = %q, want %q", gs.Source, SourceRegistry)
	}
	// 跑不起来的假 exe 探不到版本号也不算错
	if gs.Version != "" {
		t.Errorf("Version = %q, want empty", gs.Version)
	}
}

func TestDetectFirstExistingHintWins(t *testing.T) {
	dir := t.TempDir()
	first := filepath.Join(dir, "a.exe")
	second := filepath.Join(dir, "b.exe")
	for _, p := range []string{first, second} {
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	gs := Detect(Hint{Path: first}, Hint{Path: second})
	if gs.Path != first {
		t.Errorf("Path = %q, want %q", gs.Path, first)
	}
	if gs.Source != SourceManual {
		t.Errorf("Source 默认应为 manual，得到 %q", gs.Source)
	}
}

func TestInspectReadsPages(t *testing.T) {
	path := filepath.Join(t.TempDir(), "book.pdf")
	writeTestPDF(t, path, 3)

	info, err := Inspect(path, "")
	if err != nil {
		t.Fatalf("Inspect 失败：%v", err)
	}
	if info.Pages != 3 {
		t.Errorf("Pages = %d, want 3", info.Pages)
	}
	if info.Size <= 0 || info.Name != "book.pdf" {
		t.Errorf("基本信息不对：%+v", info)
	}
	if info.Encrypted {
		t.Error("普通 PDF 不该判成加密")
	}
}

func TestInspectErrors(t *testing.T) {
	for _, path := range []string{"", "  "} {
		if _, err := Inspect(path, ""); !errors.Is(err, ErrNoInput) {
			t.Errorf("Inspect(%q) = %v, want ErrNoInput", path, err)
		}
	}
	dir := t.TempDir()
	txt := filepath.Join(dir, "a.txt")
	if err := os.WriteFile(txt, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Inspect(txt, ""); !errors.Is(err, ErrNotPDF) {
		t.Errorf("Inspect(txt) = %v, want ErrNotPDF", err)
	}
	if _, err := Inspect(dir, ""); !errors.Is(err, ErrNotPDF) {
		t.Errorf("Inspect(dir) = %v, want ErrNotPDF", err)
	}
}

func TestCompressArgumentErrors(t *testing.T) {
	if _, err := Compress(Options{}, nil); !errors.Is(err, ErrNoInput) {
		t.Errorf("无输入应报 ErrNoInput，得到 %v", err)
	}
	path := filepath.Join(t.TempDir(), "book.pdf")
	writeTestPDF(t, path, 1)
	if _, err := Compress(Options{Path: path}, nil); !errors.Is(err, ErrNoOutPath) {
		t.Errorf("无输出应报 ErrNoOutPath，得到 %v", err)
	}
	txt := filepath.Join(t.TempDir(), "a.txt")
	if err := os.WriteFile(txt, []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := Compress(Options{Path: txt, OutPath: filepath.Join(t.TempDir(), "o.pdf")}, nil); !errors.Is(err, ErrNotPDF) {
		t.Errorf("非 PDF 应报 ErrNotPDF，得到 %v", err)
	}
}

func TestCompressWithPDFCPUEngine(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "book.pdf")
	writeTestPDF(t, src, 4)
	dst := filepath.Join(dir, "out.pdf")

	var phases []string
	res, err := Compress(Options{
		Path:    src,
		OutPath: dst,
		Engine:  EnginePDFCPU,
		Preset:  PresetEbook,
	}, func(phase string, percent int) { phases = append(phases, phase) })
	if err != nil {
		t.Fatalf("压缩失败：%v", err)
	}
	if res.Engine != string(EnginePDFCPU) {
		t.Errorf("Engine = %q, want pdfcpu", res.Engine)
	}
	if res.Pages != 4 {
		t.Errorf("Pages = %d, want 4", res.Pages)
	}
	if res.InPlace {
		t.Error("另存为新文件时 InPlace 应为 false")
	}
	if res.OutBytes <= 0 || res.InBytes <= 0 {
		t.Errorf("大小不对：in=%d out=%d", res.InBytes, res.OutBytes)
	}
	if res.SavedBytes != res.InBytes-res.OutBytes {
		t.Errorf("SavedBytes = %d, want %d", res.SavedBytes, res.InBytes-res.OutBytes)
	}
	if res.Path != dst {
		t.Errorf("Path = %q, want %q", res.Path, dst)
	}
	if res.Preset != string(PresetEbook) || res.DPI != 150 {
		t.Errorf("档位信息不对：%+v", res)
	}
	if res.Seconds <= 0 {
		t.Error("Seconds 应该大于 0")
	}
	if _, err := os.Stat(src); err != nil {
		t.Errorf("原文件不该被删：%v", err)
	}
	if len(phases) == 0 || phases[0] != "prep" || phases[len(phases)-1] != "done" {
		t.Errorf("进度阶段不对：%v", phases)
	}
	// 输出必须仍是能读的 PDF
	info, err := Inspect(dst, "")
	if err != nil || info.Pages != 4 {
		t.Errorf("输出不可读：%+v %v", info, err)
	}
}

func TestCompressInPlaceWithPDFCPUEngine(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "book.pdf")
	writeTestPDF(t, src, 2)

	res, err := Compress(Options{Path: src, OutPath: src, Engine: EnginePDFCPU}, nil)
	if err != nil {
		t.Fatalf("原地压缩失败：%v", err)
	}
	if !res.InPlace {
		t.Error("InPlace 应为 true")
	}
	info, err := Inspect(src, "")
	if err != nil || info.Pages != 2 {
		t.Errorf("原地覆盖后文件损坏：%+v %v", info, err)
	}
	// 临时文件不该留下
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.Contains(e.Name(), "bookmanager-") {
			t.Errorf("残留临时文件：%s", e.Name())
		}
	}
}

func TestCompressEncryptedInPlaceRefused(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "secret.pdf")
	writeTestPDF(t, src, 1)
	if _, err := pdfcrypt.Protect(src, pdfcrypt.Options{UserPassword: "pw123"}); err != nil {
		t.Fatalf("加密测试文件失败：%v", err)
	}

	if _, err := Compress(Options{Path: src, OutPath: src, Password: "pw123", Engine: EnginePDFCPU}, nil); !errors.Is(err, ErrEncryptedInPlace) {
		t.Errorf("加密 PDF 原地覆盖应被拒绝，得到 %v", err)
	}

	// 另存为新文件则允许，并且输出不再需要密码
	dst := filepath.Join(dir, "out.pdf")
	if _, err := Compress(Options{Path: src, OutPath: dst, Password: "pw123", Engine: EnginePDFCPU}, nil); err != nil {
		t.Fatalf("加密 PDF 另存失败：%v", err)
	}
	if _, err := Inspect(dst, ""); err != nil {
		t.Errorf("压缩结果应该不需要密码：%v", err)
	}
}

func TestCompressWrongPassword(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "secret.pdf")
	writeTestPDF(t, src, 1)
	if _, err := pdfcrypt.Protect(src, pdfcrypt.Options{UserPassword: "pw123"}); err != nil {
		t.Fatalf("加密测试文件失败：%v", err)
	}
	_, err := Compress(Options{Path: src, OutPath: filepath.Join(dir, "o.pdf"), Password: "wrong", Engine: EnginePDFCPU}, nil)
	if !errors.Is(err, pdfcrypt.ErrPasswordRequired) {
		t.Errorf("错误密码应报 ErrPasswordRequired，得到 %v", err)
	}
}
