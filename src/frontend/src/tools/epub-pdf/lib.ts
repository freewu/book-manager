// EPUB 转存 PDF 工具的后端调用封装。
import type {EpubFileInfo, EpubToPdfOptions, EpubToPdfProgress, EpubToPdfResult} from '../../types';
import {App, onEpub2PdfProgress} from '../../api';

/** 打开系统文件选择框挑一个本地 EPUB（取消返回空串） */
export function pickEpubFile(): Promise<string> {
  return App.PickEpubFile();
}

/** 读取 EPUB 基本信息（书名 / 作者 / 章节数 / 字数） */
export function inspectEpub(path: string): Promise<EpubFileInfo> {
  return App.EpubInspect(path);
}

/** 选择保存目录（defaultDir 为对话框的起始目录） */
export function pickOutDir(defaultDir: string): Promise<string> {
  return App.PickOutDir(defaultDir);
}

/** 转换 EPUB → PDF（没有正文时用返回值里的 no_text 标志表示，不抛错） */
export function convertEpubToPdf(opts: EpubToPdfOptions): Promise<EpubToPdfResult> {
  return App.EpubToPdf(opts);
}

/** 订阅转换进度，返回取消订阅函数 */
export function subscribeProgress(cb: (p: EpubToPdfProgress) => void): () => void {
  return onEpub2PdfProgress(cb);
}

/** 在资源管理器里定位生成的 PDF */
export function revealFile(path: string): Promise<void> {
  return App.OpenPath(path);
}
