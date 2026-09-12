// Package pdfcompress 压缩 PDF：默认调用 Ghostscript 重写文件（按档位降采样
// 图像、去掉重复图片、压缩并子集化内嵌字体），这台机器上没装 Ghostscript 时
// 退回 pdfcpu 的无损优化。
//
// Ghostscript 没有逐页进度输出（官方文档里没有这样的开关），所以进度按阶段
// 上报：准备 → 压缩中 → 校验，百分比是估算值，界面上要如实说明。
//
// 输出先写到目标目录下的临时文件，校验能读、页数对得上之后再改名，
// 覆盖原文件时也不会留下半个文件。
package pdfcompress

import (
	"bytes"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/log"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"

	"bookmanager/internal/pdfcrypt"
)

// EnvGS 是环境变量里指定 Ghostscript 可执行文件的地方（优先于 PATH）。
const EnvGS = "BOOKMANAGER_GS"

var (
	// ErrNoInput 没有选择 PDF 文件。
	ErrNoInput = errors.New("no pdf file")
	// ErrNoOutPath 没有保存位置。
	ErrNoOutPath = errors.New("no output file")
	// ErrNotPDF 不是 PDF 文件（没有 %PDF- 头）。
	ErrNotPDF = errors.New("not a pdf file")
	// ErrEncryptedInPlace 加密的 PDF 不能原地覆盖：压缩后的文件不再加密，
	// 原地覆盖等于把密码保护删掉了。
	ErrEncryptedInPlace = errors.New("cannot rewrite an encrypted pdf in place")
	// ErrGSMissing 指定用 Ghostscript，但机器上没有找到。
	ErrGSMissing = errors.New("ghostscript not found")
	// ErrGSFailed Ghostscript 执行失败（错误信息在包装里）。
	ErrGSFailed = errors.New("ghostscript failed")
	// ErrPassword 密码缺失或不对。
	ErrPassword = errors.New("wrong or missing pdf password")
	// ErrBadOutput 压缩结果读不出来（页数为 0 或不是 PDF）。
	ErrBadOutput = errors.New("compressed output is not a readable pdf")
)

// Preset 是压缩档位，直接对应 Ghostscript 的 PDFSETTINGS 预设。
// 图像分辨率分别是 72 / 150 / 300 / 300 dpi。
type Preset string

const (
	// PresetScreen 屏幕：72 dpi，文件最小。
	PresetScreen Preset = "screen"
	// PresetEbook 电子书：150 dpi，默认档位，体积和清晰度平衡。
	PresetEbook Preset = "ebook"
	// PresetPrinter 打印：300 dpi，适合还要打印的书。
	PresetPrinter Preset = "printer"
	// PresetPrepress 印前：300 dpi 且不改变色彩空间，压缩率最低。
	PresetPrepress Preset = "prepress"
)

// DPI 是该档位降采样后的图像分辨率。
func (p Preset) DPI() int {
	switch normalizePreset(p) {
	case PresetScreen:
		return 72
	case PresetPrinter, PresetPrepress:
		return 300
	default:
		return 150
	}
}

func normalizePreset(p Preset) Preset {
	switch Preset(strings.ToLower(strings.TrimSpace(string(p)))) {
	case PresetScreen:
		return PresetScreen
	case PresetPrinter:
		return PresetPrinter
	case PresetPrepress:
		return PresetPrepress
	default:
		return PresetEbook
	}
}

// Engine 是压缩引擎。
type Engine string

const (
	// EngineAuto 有 Ghostscript 就用它，否则用 pdfcpu（默认）。
	EngineAuto Engine = "auto"
	// EngineGhostscript 只用 Ghostscript，找不到就报错。
	EngineGhostscript Engine = "ghostscript"
	// EnginePDFCPU 只用 pdfcpu 的无损优化（不动图像分辨率）。
	EnginePDFCPU Engine = "pdfcpu"
)

func normalizeEngine(e Engine) Engine {
	switch Engine(strings.ToLower(strings.TrimSpace(string(e)))) {
	case EngineGhostscript:
		return EngineGhostscript
	case EnginePDFCPU:
		return EnginePDFCPU
	default:
		return EngineAuto
	}
}

// Ghostscript 的来源，界面据此告诉用户是哪里找来的。
const (
	SourceManual   = "manual"   // 界面里手动指定
	SourceEnv      = "env"      // 环境变量 BOOKMANAGER_GS
	SourceRegistry = "registry" // 注册表里的安装信息
	SourcePath     = "path"     // PATH
	SourceCommon   = "common"   // 常见安装目录
)

// Hint 是调用方（界面 / 注册表）提供的 Ghostscript 候选路径，
// 优先级高于环境变量和 PATH。
type Hint struct {
	Path   string
	Source string
}

// Ghostscript 描述本机的 Ghostscript。
type Ghostscript struct {
	Found   bool   `json:"found"`
	Path    string `json:"path"`
	Version string `json:"version"`
	Source  string `json:"source"`
}

// Info 是待压缩 PDF 的概况。
type Info struct {
	Path    string
	Name    string
	Size    int64
	Pages   int
	Version string
	// Encrypted 表示文件本身加密（可能只是权限加密，打开不需要密码）。
	Encrypted bool
}

// Options 是压缩参数。OutPath 与 Path 相同时就是原地覆盖。
type Options struct {
	Path     string
	Password string
	OutPath  string

	// Preset 是压缩档位（默认 ebook）。
	Preset Preset
	// DPI 大于 0 时覆盖档位的图像分辨率。
	DPI int
	// Grayscale 把彩色转成灰度（扫描件能小很多）。
	Grayscale bool
	// Engine 是压缩引擎：auto / ghostscript / pdfcpu。
	Engine Engine

	// GSPath 是用户在界面里手动指定的 gswin64c.exe。
	GSPath string
	// GSHints 是额外的候选路径（注册表等）。
	GSHints []Hint
}

// Result 是压缩结果。SavedBytes 为负表示压缩后反而更大。
type Result struct {
	Path       string
	InPath     string
	InBytes    int64
	OutBytes   int64
	SavedBytes int64
	// SavedPercent 是省下的百分比（保留一位小数，负数表示变大）。
	SavedPercent float64
	Pages        int
	Engine       string
	GSVersion    string
	Preset       string
	DPI          int
	InPlace      bool
	Seconds      float64
}

// ProgressFunc 上报进度：phase 是阶段名（prep/compress/verify/done），
// percent 是估算百分比。Ghostscript 不提供逐页进度，所以压缩阶段只有
// 一个粗粒度值。
type ProgressFunc func(phase string, percent int)

// 新建输出文件前的等待：Ghostscript 处理大文件可能要几分钟，这里不设上限，
// 只有探测版本号时才用超时。
const probeTimeout = 8 * time.Second

// silenceOnce 关掉 pdfcpu 的控制台日志：这是个 GUI 程序，
// "using AES-256" 之类的输出没有地方可去。
var silenceOnce sync.Once

func silencePDFCPU() {
	silenceOnce.Do(log.DisableLoggers)
}

// Detect 找一个可用的 Ghostscript。hints 里的路径优先（界面指定 / 注册表），
// 然后是环境变量 BOOKMANAGER_GS、PATH、常见安装目录。
func Detect(hints ...Hint) Ghostscript {
	seen := make(map[string]bool)

	try := func(path, source string) (Ghostscript, bool) {
		path = strings.TrimSpace(strings.Trim(path, `"`))
		if path == "" {
			return Ghostscript{}, false
		}
		key := strings.ToLower(filepath.Clean(path))
		if seen[key] {
			return Ghostscript{}, false
		}
		seen[key] = true
		st, err := os.Stat(path)
		if err != nil || st.IsDir() {
			return Ghostscript{}, false
		}
		return Ghostscript{Found: true, Path: path, Version: gsVersion(path), Source: source}, true
	}

	for _, h := range hints {
		src := h.Source
		if src == "" {
			src = SourceManual
		}
		if gs, ok := try(h.Path, src); ok {
			return gs
		}
	}
	if gs, ok := try(os.Getenv(EnvGS), SourceEnv); ok {
		return gs
	}
	for _, name := range gsNames() {
		if path, err := exec.LookPath(name); err == nil {
			if gs, ok := try(path, SourcePath); ok {
				return gs
			}
		}
	}
	for _, path := range commonPaths() {
		if gs, ok := try(path, SourceCommon); ok {
			return gs
		}
	}
	return Ghostscript{}
}

// gsNames 是 PATH 里要找的可执行文件名（Windows 上控制台版是 gswinXXc.exe，
// 带窗口的 gswinXX.exe 会弹黑框，所以不找它）。
func gsNames() []string {
	if runtime.GOOS == "windows" {
		return []string{"gswin64c.exe", "gswin32c.exe", "gs.exe", "gs"}
	}
	return []string{"gs"}
}

// commonPaths 列出常见安装位置里的 gswin64c.exe（新版本排前面）。
func commonPaths() []string {
	var out []string
	glob := func(patterns ...string) {
		for _, pattern := range patterns {
			matches, err := filepath.Glob(pattern)
			if err != nil || len(matches) == 0 {
				continue
			}
			// gs\gs10.08.0 > gs\gs9.55.0：字符串倒序就够用
			sort.Sort(sort.Reverse(sort.StringSlice(matches)))
			out = append(out, matches...)
		}
	}

	if runtime.GOOS != "windows" {
		return []string{"/usr/bin/gs", "/usr/local/bin/gs", "/opt/homebrew/bin/gs"}
	}

	exes := []string{"gswin64c.exe", "gswin32c.exe"}
	for _, root := range []string{
		os.Getenv("ProgramFiles"),
		os.Getenv("ProgramFiles(x86)"),
		filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs"),
		os.Getenv("LOCALAPPDATA"),
		filepath.Join(os.Getenv("ProgramData"), "chocolatey", "lib"),
	} {
		if strings.TrimSpace(root) == "" {
			continue
		}
		var patterns []string
		for _, exe := range exes {
			patterns = append(patterns,
				filepath.Join(root, "gs", "gs*", "bin", exe),
				filepath.Join(root, "gs*", "bin", exe),
			)
		}
		glob(patterns...)
	}
	if home := os.Getenv("USERPROFILE"); home != "" {
		glob(filepath.Join(home, "scoop", "apps", "ghostscript", "current", "bin", "gswin64c.exe"))
	}
	for _, dir := range []string{`C:\ProgramData\scoop\apps\ghostscript\current\bin`, `C:\ProgramData\chocolatey\bin`} {
		glob(filepath.Join(dir, "gswin64c.exe"))
	}
	return out
}

// gsVersion 探测 Ghostscript 版本号；探不到就返回空串（不影响压缩）。
func gsVersion(exe string) string {
	if out, err := runProbe(exe, "--version"); err == nil {
		if v := parseGSVersion(out); v != "" {
			return v
		}
	}
	// 老版本没有 --version，用 -v 的横幅兜底
	if out, err := runProbe(exe, "-v"); err == nil {
		return parseGSVersion(out)
	}
	return ""
}

// gsVersionRE 匹配 "10.08.0" / "9.55" 这样的版本号。
var gsVersionRE = regexp.MustCompile(`\d+\.\d+(?:\.\d+)?`)

func parseGSVersion(out string) string {
	if m := gsVersionRE.FindString(out); m != "" {
		return m
	}
	return ""
}

// runProbe 执行一次带超时的探测命令，stdout 和 stderr 一起收集。
func runProbe(exe string, args ...string) (string, error) {
	if strings.TrimSpace(exe) == "" {
		return "", errors.New("empty executable")
	}
	cmd := exec.Command(exe, args...)
	cmd.SysProcAttr = hiddenWindow()
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf
	done := make(chan error, 1)
	if err := cmd.Start(); err != nil {
		return "", err
	}
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		return buf.String(), err
	case <-time.After(probeTimeout):
		_ = cmd.Process.Kill()
		<-done
		return buf.String(), errors.New("timeout")
	}
}

// Inspect 读出待压缩 PDF 的页数、版本等信息。加密文件没有给（对的）密码时
// 返回 pdfcrypt.ErrPasswordRequired，调用方据此提示用户输入密码。
func Inspect(path, password string) (Info, error) {
	path = strings.TrimSpace(path)
	info := Info{Path: path}
	if path == "" {
		return info, ErrNoInput
	}
	silencePDFCPU()

	fi, err := os.Stat(path)
	if err != nil {
		return info, fmt.Errorf("文件读取失败：%w", err)
	}
	if fi.IsDir() || fi.Size() == 0 {
		return info, ErrNotPDF
	}
	info.Name = filepath.Base(path)
	info.Size = fi.Size()

	f, err := os.Open(path)
	if err != nil {
		return info, fmt.Errorf("文件读取失败：%w", err)
	}
	defer f.Close()

	conf := model.NewDefaultConfiguration()
	conf.UserPW = password
	pi, err := api.PDFInfo(f, path, nil, false, conf)
	if err != nil {
		if isPasswordError(err) {
			info.Encrypted = true
			return info, pdfcrypt.ErrPasswordRequired
		}
		if !hasPDFHeader(path) {
			return info, ErrNotPDF
		}
		return info, fmt.Errorf("读取 PDF 失败：%w", err)
	}

	info.Pages = pi.PageCount
	info.Version = pi.Version
	info.Encrypted = pi.Encrypted

	if info.Encrypted && password == "" {
		// 有些加密文件在被要求解密之前就把信息报出来了；交给 pdfcrypt 判断
		// 打开密码是否真的为空（只加密权限的文件不用问密码）。
		if _, err := pdfcrypt.Inspect(path, ""); errors.Is(err, pdfcrypt.ErrPasswordRequired) {
			return info, pdfcrypt.ErrPasswordRequired
		}
	}
	return info, nil
}

// Compress 压缩 PDF。progress 可以为 nil。
func Compress(opts Options, progress ProgressFunc) (Result, error) {
	report := func(phase string, percent int) {
		if progress != nil {
			progress(phase, percent)
		}
	}
	start := time.Now()
	var res Result

	src := strings.TrimSpace(opts.Path)
	if src == "" {
		return res, ErrNoInput
	}
	dst := strings.TrimSpace(opts.OutPath)
	if dst == "" {
		return res, ErrNoOutPath
	}
	if !hasPDFHeader(src) {
		return res, ErrNotPDF
	}

	in, err := Inspect(src, opts.Password)
	if err != nil {
		return res, err
	}
	if in.Size == 0 || in.Pages == 0 {
		return res, ErrNotPDF
	}
	res.InPath = src
	res.InBytes = in.Size
	res.Pages = in.Pages

	inPlace := sameFile(src, dst)
	res.InPlace = inPlace
	if inPlace && in.Encrypted {
		// 压缩后的文件不再带密码，覆盖原文件等于把密码保护删掉了
		return res, ErrEncryptedInPlace
	}

	report("prep", 5)

	gs := Detect(hintsOf(opts)...)
	engine := normalizeEngine(opts.Engine)
	switch engine {
	case EngineGhostscript:
		if !gs.Found {
			return res, ErrGSMissing
		}
	case EngineAuto:
		if gs.Found {
			engine = EngineGhostscript
		} else {
			engine = EnginePDFCPU
		}
	}
	res.Engine = string(engine)
	res.GSVersion = gs.Version
	res.Preset = string(normalizePreset(opts.Preset))
	res.DPI = effectiveDPI(opts)

	tmp, err := tempPath(dst)
	if err != nil {
		return res, fmt.Errorf("创建临时文件失败：%w", err)
	}
	defer os.Remove(tmp)

	report("compress", 20)
	switch engine {
	case EngineGhostscript:
		if err := runGhostscript(gs.Path, buildGSArgs(opts, src, tmp), tmp); err != nil {
			return res, err
		}
	default:
		if err := optimizeWithPDFCPU(src, tmp, opts.Password); err != nil {
			return res, err
		}
	}

	report("verify", 92)
	out, err := Inspect(tmp, "")
	if err != nil {
		return res, fmt.Errorf("%w：%v", ErrBadOutput, err)
	}
	if out.Pages == 0 {
		if in.Encrypted {
			// 密码不对时 Ghostscript 往往"成功"地输出一个空文档
			return res, ErrPassword
		}
		return res, ErrBadOutput
	}
	res.Pages = out.Pages

	fi, err := os.Stat(tmp)
	if err != nil {
		return res, fmt.Errorf("压缩结果读取失败：%w", err)
	}
	res.OutBytes = fi.Size()

	mode := os.FileMode(0o644)
	if st, err := os.Stat(dst); err == nil {
		mode = st.Mode().Perm()
	}
	_ = os.Chmod(tmp, mode)
	if err := os.Rename(tmp, dst); err != nil {
		return res, fmt.Errorf("保存失败：%w", err)
	}

	res.Path = dst
	res.SavedBytes = res.InBytes - res.OutBytes
	if res.InBytes > 0 {
		res.SavedPercent = math.Round(float64(res.SavedBytes)/float64(res.InBytes)*1000) / 10
	}
	res.Seconds = time.Since(start).Seconds()
	report("done", 100)
	return res, nil
}

// buildGSArgs 拼出 Ghostscript 的命令行。
//
// 除了档位，还固定带上几个"别把书弄坏"的开关：字体全部内嵌（中文必需）、
// 压缩并子集化字体、去掉重复图片、不自动旋转页面（扫描件常被转歪）。
func buildGSArgs(opts Options, src, dst string) []string {
	preset := normalizePreset(opts.Preset)
	dpi := effectiveDPI(opts)

	args := []string{
		"-dBATCH", "-dNOPAUSE", "-dQUIET", "-dSAFER",
		"-sDEVICE=pdfwrite",
		"-dCompatibilityLevel=1.7",
		"-dPDFSETTINGS=/" + string(preset),
		"-dEmbedAllFonts=true",
		"-dCompressFonts=true",
		"-dSubsetFonts=true",
		"-dDetectDuplicateImages=true",
		"-dAutoRotatePages=/None",
	}
	if opts.DPI > 0 {
		// 自定义分辨率：显式打开降采样，否则 PDFSETTINGS 里的开关还是原档位的
		args = append(args,
			"-dDownsampleColorImages=true", "-dColorImageResolution="+strconv.Itoa(dpi),
			"-dDownsampleGrayImages=true", "-dGrayImageResolution="+strconv.Itoa(dpi),
			"-dDownsampleMonoImages=true", "-dMonoImageResolution="+strconv.Itoa(max(300, dpi)),
		)
	}
	if opts.Grayscale {
		args = append(args, "-dColorConversionStrategy=/Gray")
	}
	if opts.Password != "" {
		args = append(args, "-sPDFPassword="+opts.Password)
	}
	args = append(args, "-sOutputFile="+dst, src)
	return args
}

// effectiveDPI 返回本次实际使用的图像分辨率。
func effectiveDPI(opts Options) int {
	if opts.DPI > 0 {
		return opts.DPI
	}
	return normalizePreset(opts.Preset).DPI()
}

func hintsOf(opts Options) []Hint {
	var hints []Hint
	if p := strings.TrimSpace(opts.GSPath); p != "" {
		hints = append(hints, Hint{Path: p, Source: SourceManual})
	}
	return append(hints, opts.GSHints...)
}

// runGhostscript 跑一次 Ghostscript 并检查输出文件确实生成了。
func runGhostscript(exe string, args []string, outPath string) error {
	if strings.TrimSpace(exe) == "" {
		return ErrGSMissing
	}
	cmd := exec.Command(exe, args...)
	cmd.SysProcAttr = hiddenWindow()
	var buf bytes.Buffer
	w := &limitWriter{buf: &buf, left: 32 << 10}
	cmd.Stdout = w
	cmd.Stderr = w

	err := cmd.Run()
	output := buf.String()
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return ErrGSMissing
		}
		if isPasswordOutput(output) {
			return ErrPassword
		}
		msg := strings.TrimSpace(output)
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("%w：%s", ErrGSFailed, tail(msg, 3))
	}
	if fi, statErr := os.Stat(outPath); statErr != nil || fi.Size() == 0 {
		if isPasswordOutput(output) {
			return ErrPassword
		}
		return fmt.Errorf("%w：没有生成输出文件", ErrGSFailed)
	}
	return nil
}

// isPasswordOutput 判断 Ghostscript 的输出是不是密码问题。
func isPasswordOutput(out string) bool {
	s := strings.ToLower(out)
	return strings.Contains(s, "invalidfileaccess") ||
		strings.Contains(s, "requires a password") ||
		strings.Contains(s, "password is required")
}

// tail 取最后 n 行，压成一行给用户看（Ghostscript 的报错前缀很长）。
func tail(s string, n int) string {
	lines := strings.Split(strings.TrimSpace(strings.ReplaceAll(s, "\r\n", "\n")), "\n")
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	out := strings.TrimSpace(strings.Join(lines, " / "))
	if len(out) > 400 {
		out = out[:400] + "…"
	}
	return out
}

// optimizeWithPDFCPU 用 pdfcpu 做无损优化（对象流、去重复、重写交叉引用表）。
// 它不会降采样图像，所以省下的空间比 Ghostscript 少得多。
func optimizeWithPDFCPU(src, dst, password string) error {
	silencePDFCPU()
	conf := model.NewDefaultConfiguration()
	conf.ValidationMode = model.ValidationRelaxed
	conf.UserPW = password
	// 压缩结果不带密码保护（Ghostscript 写出来的也是明文），否则
	// pdfcpu 会把输入的加密设置原样带进输出文件。
	conf.RemoveEncryption = true
	conf.Cmd = model.OPTIMIZE
	if err := api.OptimizeFile(src, dst, conf); err != nil {
		if isPasswordError(err) {
			return ErrPassword
		}
		return fmt.Errorf("优化失败：%w", err)
	}
	return nil
}

// tempPath 在目标目录里占一个临时文件名：先建再删，交给引擎自己创建，
// 避免两个引擎对"输出文件已存在"的处理不一致。
func tempPath(dst string) (string, error) {
	dir := filepath.Dir(dst)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	f, err := os.CreateTemp(dir, "."+filepath.Base(dst)+".bookmanager-*")
	if err != nil {
		return "", err
	}
	name := f.Name()
	if err := f.Close(); err != nil {
		os.Remove(name)
		return "", err
	}
	if err := os.Remove(name); err != nil {
		return "", err
	}
	return name, nil
}

// limitWriter 只留前 n 个字节的输出，免得坏文件把内存刷爆。
type limitWriter struct {
	buf  *bytes.Buffer
	left int
}

func (l *limitWriter) Write(p []byte) (int, error) {
	n := len(p)
	if l.left <= 0 {
		return n, nil
	}
	if len(p) > l.left {
		p = p[:l.left]
	}
	l.left -= len(p)
	l.buf.Write(p)
	return n, nil
}

// hasPDFHeader 判断文件开头是否像 PDF（pdfcpu 对坏文件报的错五花八门，
// 统一成 ErrNotPDF 更好提示）。
func hasPDFHeader(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	buf := make([]byte, 1024)
	n, _ := f.Read(buf)
	return strings.Contains(string(buf[:n]), "%PDF-")
}

// sameFile 判断两个路径是否指向同一个文件（含同一路径的不同写法）。
func sameFile(a, b string) bool {
	if a == b {
		return true
	}
	pa, err1 := filepath.Abs(a)
	pb, err2 := filepath.Abs(b)
	if err1 != nil || err2 != nil {
		return false
	}
	if strings.EqualFold(filepath.Clean(pa), filepath.Clean(pb)) {
		return true
	}
	fa, err1 := os.Stat(a)
	fb, err2 := os.Stat(b)
	return err1 == nil && err2 == nil && os.SameFile(fa, fb)
}

func isPasswordError(err error) bool {
	return errors.Is(err, pdfcpu.ErrWrongPassword) ||
		errors.Is(err, pdfcpu.ErrOwnerPasswordRequired)
}
