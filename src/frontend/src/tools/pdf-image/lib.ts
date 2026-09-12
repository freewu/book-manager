// 转存图片工具的后端调用封装 + 页码范围解析。
//
// 位图由前端的 pdf.js 逐页渲染（后端没有光栅化能力），每页调用一次
// SavePdfImage 落盘；文件名规则（前缀 + 补零页码）与后端 internal/pdfimage
// 保持一致，这里只用来做界面上的预览。
import type {PdfExtractInfo, PdfImageOptions, PdfImageResult} from '../../types';
import type {TFunc} from '../../i18n';
import {App} from '../../api';

/** 打开系统文件选择框选择 PDF（取消返回空串） */
export function pickPdfFile(): Promise<string> {
  return App.PickPdfFile();
}

/** 看源文件的页数 / 是否加密 / 是否读得出来 */
export function inspectSource(path: string, password: string): Promise<PdfExtractInfo> {
  return App.PdfExtractInspect(path, password);
}

/** 取文件原始字节（base64），交给 pdf.js 渲染 */
export function readPdfData(path: string): Promise<string> {
  return App.ReadPdfData(path);
}

/** 选择输出目录（取消返回空串） */
export function pickOutDir(defaultDir: string): Promise<string> {
  return App.PickOutDir(defaultDir);
}

/** 写入一页图片 */
export function savePdfImage(opts: PdfImageOptions): Promise<PdfImageResult> {
  return App.SavePdfImage(opts);
}

/** 在资源管理器里打开图片所在目录 */
export function revealDir(path: string): Promise<void> {
  return App.OpenPath(path);
}

/** 取路径所在目录（\ 与 / 都支持） */
export function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i > 0 ? p.slice(0, i) : '';
}

/** 取不带扩展名的文件名 */
export function stemOf(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? '';
  return base.replace(/\.[^.]+$/, '');
}

/** 默认输出目录：源 PDF 旁边的「<文件名>-images」文件夹 */
export function defaultOutDir(path: string): string {
  const dir = dirOf(path);
  const stem = stemOf(path) || 'pdf';
  const name = `${stem}-images`;
  return dir ? `${dir}\\${name}` : name;
}

/** 和 internal/pdfimage 一致的前缀清理 */
export function sanitizePrefix(prefix: string): string {
  const cleaned = prefix
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  return cleaned || 'page';
}

/** 页码补零位数：至少 3 位，页数上千时按实际位数 */
export function padWidth(total: number): number {
  return Math.max(3, String(Math.max(0, total)).length);
}

/** 与后端一致的图片文件名 */
export function plannedName(prefix: string, format: string, page: number, total: number): string {
  const ext = format === 'png' ? '.png' : '.jpg';
  return `${sanitizePrefix(prefix)}-${String(page).padStart(padWidth(total), '0')}${ext}`;
}

/** 把页码压成 1-3, 5, 8-10 这样的说明文字 */
export function rangesText(pages: number[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < pages.length) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    parts.push(j > i ? `${pages[i]}-${pages[j]}` : String(pages[i]));
    i = j + 1;
  }
  return parts.join(', ');
}

export interface PageRange {
  /** 升序去重后的页码；解析失败时是空数组 */
  pages: number[];
  /** 出错原因（已翻译），空串表示没问题 */
  error: string;
}

function allPages(total: number): number[] {
  const out: number[] = [];
  for (let n = 1; n <= total; n++) out.push(n);
  return out;
}

/**
 * 解析页码范围：空串 = 全部页面；支持 1-3,5,8-10 这样的写法，
 * 范围两侧可以省略（-5 表示 1-5，8- 表示 8 到最后一页）。
 */
export function parsePages(text: string, total: number, t: TFunc): PageRange {
  const raw = text.trim();
  if (!raw) return {pages: allPages(total), error: ''};

  const out = new Set<number>();
  const tokens = raw.split(/[,，;；、\s]+/).filter(Boolean);
  for (const tok of tokens) {
    const range = /^(\d+)?\s*[-~—]\s*(\d+)?$/.exec(tok);
    if (range) {
      const from = range[1] ? parseInt(range[1], 10) : 1;
      const to = range[2] ? parseInt(range[2], 10) : total;
      if (from < 1 || from > total || to > total || from > to) {
        return {pages: [], error: t('tools.pdfImageRangeOut', {token: tok, total})};
      }
      for (let n = from; n <= to; n++) out.add(n);
      continue;
    }
    if (/^\d+$/.test(tok)) {
      const n = parseInt(tok, 10);
      if (n < 1 || n > total) {
        return {pages: [], error: t('tools.pdfImageRangeOut', {token: tok, total})};
      }
      out.add(n);
      continue;
    }
    return {pages: [], error: t('tools.pdfImageRangeBad', {token: tok})};
  }

  const pages = [...out].sort((a, b) => a - b);
  if (pages.length === 0) return {pages: [], error: t('tools.pdfImageRangeEmpty')};
  return {pages, error: ''};
}

/** Blob → 不带 data URL 前缀的 base64 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result ?? '');
      const comma = s.indexOf(',');
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    fr.onerror = () => reject(fr.error ?? new Error('read blob failed'));
    fr.readAsDataURL(blob);
  });
}
