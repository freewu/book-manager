// PDF 转存 EPUB 工具的后端调用封装。
import type {PdfFileInfo, PdfToEpubOptions, PdfToEpubProgress, PdfToEpubResult} from '../../types';
import {App, onPdf2EpubProgress} from '../../api';

/** 打开系统文件选择框挑一个本地 PDF（取消返回空串） */
export function pickPdfFile(): Promise<string> {
  return App.PickPdfFile();
}

/**
 * 读取 PDF 基本信息。
 * 已加密且密码不对时不会报错，而是返回 needs_password=true。
 */
export function inspectPdf(path: string, password = ''): Promise<PdfFileInfo> {
  return App.PdfInspect(path, password);
}

/** 选择保存目录（defaultDir 为对话框的起始目录） */
export function pickOutDir(defaultDir: string): Promise<string> {
  return App.PickOutDir(defaultDir);
}

/** 转换 PDF → EPUB（扫描版 / 需要密码时用返回值里的标志位表示，不抛错） */
export function convertPdfToEpub(opts: PdfToEpubOptions): Promise<PdfToEpubResult> {
  return App.ConvertPdfToEpub(opts);
}

/** 订阅转换进度，返回取消订阅函数 */
export function subscribeProgress(cb: (p: PdfToEpubProgress) => void): () => void {
  return onPdf2EpubProgress(cb);
}

/** 在资源管理器里定位生成的 EPUB */
export function revealFile(path: string): Promise<void> {
  return App.OpenPath(path);
}
