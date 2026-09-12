// 修改文档工具的后端调用封装 + 关键词解析。
//
// 四个字段以「想要的值」提交给后端（空字符串 = 删掉这个键），后端只把真正
// 改动过的键写回 Info 字典。
import type {PdfMetaInfo, PdfMetaOptions, PdfMetaResult} from '../../types';
import {App} from '../../api';

/** 打开系统文件选择框选择 PDF（取消返回空串） */
export function pickPdfFile(): Promise<string> {
  return App.PickPdfFile();
}

/** 读出文档信息（加密且密码不对时 needs_password = true） */
export function inspectMeta(path: string, password: string): Promise<PdfMetaInfo> {
  return App.PdfMetaInspect(path, password);
}

/** 保存文档信息 */
export function savePdfMeta(opts: PdfMetaOptions): Promise<PdfMetaResult> {
  return App.SavePdfMeta(opts);
}

/** 选择另存位置（取消返回空串）；title 是保存对话框标题 */
export function pickOutPdfFile(name: string, dir: string, title: string): Promise<string> {
  return App.PickOutPdfFile(name, dir, title);
}

/** 在资源管理器里定位文件 */
export function revealFile(path: string): Promise<void> {
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

/** 「另存为新文件」的默认文件名：<原名>-文档信息.pdf */
export function defaultOutName(path: string, suffix: string): string {
  return `${stemOf(path) || 'document'}-${suffix}.pdf`;
}

/**
 * 把输入框里的一串关键词拆成数组：, ， ; ； 、 和换行都算分隔符，
 * 去空白、去重复（保持原顺序）。
 */
export function parseKeywords(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[,，;；、\n\r]+/)) {
    const k = part.trim();
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

/** 关键词数组 → 输入框里的文字 */
export function keywordsText(list: string[] | null | undefined): string {
  return (list ?? []).join(', ');
}

/** 两组关键词是否等价（顺序、空白差异不算改动） */
export function sameKeywords(a: string[], b: string[]): boolean {
  const x = parseKeywords(a.join(','));
  const y = parseKeywords(b.join(','));
  if (x.length !== y.length) return false;
  const sx = [...x].sort();
  const sy = [...y].sort();
  return sx.every((v, i) => v === sy[i]);
}

/** 人类可读的 PDF 日期（D:20240102030405+08'00' → 2024-01-02 03:04） */
export function pdfDate(value: string): string {
  const m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?/.exec(value ?? '');
  if (!m) return value || '';
  const [, y, mo, d, h, mi] = m;
  const time = h && mi ? ` ${h}:${mi}` : '';
  return `${y}-${mo}-${d}${time}`;
}
