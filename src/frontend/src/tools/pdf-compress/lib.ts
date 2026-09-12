// 压缩文档工具的后端调用封装 + 档位 / 引擎表。
import type {
  PdfCompressEngine,
  PdfCompressGhostscript,
  PdfCompressInfo,
  PdfCompressOptions,
  PdfCompressPreset,
  PdfCompressProgress,
  PdfCompressResult,
} from '../../types';
import {App, onPdfCompressProgress} from '../../api';

/** 打开系统文件选择框选择 PDF（取消返回空串） */
export function pickPdfFile(): Promise<string> {
  return App.PickPdfFile();
}

/** 读取源文件信息 + 本机 Ghostscript 状态（加密且密码不对时 needs_password = true） */
export function inspectPdf(path: string, password: string): Promise<PdfCompressInfo> {
  return App.PdfCompressInspect(path, password);
}

/** 压缩 PDF */
export function compressPdf(opts: PdfCompressOptions): Promise<PdfCompressResult> {
  return App.CompressPdf(opts);
}

/** 重新检测本机 Ghostscript */
export function detectGhostscript(): Promise<PdfCompressGhostscript> {
  return App.DetectGhostscript();
}

/** 手动指定 gswin64c.exe（取消返回空串），成功后路径会存进设置 */
export function pickGhostscriptExe(): Promise<string> {
  return App.PickGhostscriptExe();
}

/** 选择另存位置（取消返回空串） */
export function pickOutPdfFile(name: string, dir: string, title: string): Promise<string> {
  return App.PickOutPdfFile(name, dir, title);
}

/** 在资源管理器里定位文件 */
export function revealFile(path: string): Promise<void> {
  return App.OpenPath(path);
}

/** 订阅压缩进度，返回取消订阅函数 */
export function subscribeProgress(cb: (p: PdfCompressProgress) => void): () => void {
  return onPdfCompressProgress(cb);
}

/** 取路径所在目录（\ 与 / 都支持） */
export function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i > 0 ? p.slice(0, i) : '';
}

/** 取文件名 */
export function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** 取不带扩展名的文件名 */
export function stemOf(p: string): string {
  return baseName(p).replace(/\.[^.]+$/, '');
}

/** 「另存为新文件」的默认文件名：<原名>-压缩.pdf */
export function defaultOutName(path: string, suffix: string): string {
  return `${stemOf(path) || 'document'}-${suffix}.pdf`;
}

/** 压缩档位（对应后端的 ghostscript PDFSETTINGS 预设） */
export interface PresetDef {
  id: PdfCompressPreset;
  /** 档位默认图像分辨率，界面上显示 */
  dpi: number;
  labelKey: string;
  hintKey: string;
}

export const PRESETS: PresetDef[] = [
  {id: 'screen', dpi: 72, labelKey: 'tools.pdfCompressPresetScreen', hintKey: 'tools.pdfCompressPresetScreenHint'},
  {id: 'ebook', dpi: 150, labelKey: 'tools.pdfCompressPresetEbook', hintKey: 'tools.pdfCompressPresetEbookHint'},
  {id: 'printer', dpi: 300, labelKey: 'tools.pdfCompressPresetPrinter', hintKey: 'tools.pdfCompressPresetPrinterHint'},
  {id: 'prepress', dpi: 300, labelKey: 'tools.pdfCompressPresetPrepress', hintKey: 'tools.pdfCompressPresetPrepressHint'},
];

export interface EngineDef {
  id: PdfCompressEngine;
  labelKey: string;
  hintKey: string;
}

export const ENGINES: EngineDef[] = [
  {id: 'auto', labelKey: 'tools.pdfCompressEngineAuto', hintKey: 'tools.pdfCompressEngineAutoHint'},
  {id: 'ghostscript', labelKey: 'tools.pdfCompressEngineGs', hintKey: 'tools.pdfCompressEngineGsHint'},
  {id: 'pdfcpu', labelKey: 'tools.pdfCompressEnginePdfcpu', hintKey: 'tools.pdfCompressEnginePdfcpuHint'},
];

export function presetDef(id: PdfCompressPreset): PresetDef {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[1];
}

/** 后端上报的引擎名 → 界面上显示的名字 */
export function engineName(engine: string): string {
  if (engine === 'ghostscript') return 'Ghostscript';
  if (engine === 'pdfcpu') return 'pdfcpu';
  return engine;
}

/** 进度阶段 → i18n 键后缀（配合 t(`tools.pdfCompressPhase${...}`) 使用） */
export function phaseSuffix(phase: string): string {
  switch (phase) {
    case 'prep':
      return 'Prep';
    case 'verify':
      return 'Verify';
    case 'done':
      return 'Done';
    default:
      return 'Compress';
  }
}

/** 省下的百分比（负数表示变大） → "+58.3%" / "-3.2%" */
export function percentText(n: number): string {
  const v = Math.round((n || 0) * 10) / 10;
  return `${v > 0 ? '+' : ''}${v}%`;
}
