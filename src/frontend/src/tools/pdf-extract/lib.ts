// 提取页面工具的后端调用封装。
import type {PdfExtractInfo, PdfExtractOptions, PdfExtractResult} from '../../types';
import {App} from '../../api';

/** 打开系统文件选择框选择 PDF（取消返回空串） */
export function pickPdfFile(): Promise<string> {
  return App.PickPdfFile();
}

/** 看源文件的页数 / 是否加密 / 是否读得出来 */
export function inspectSource(path: string, password: string): Promise<PdfExtractInfo> {
  return App.PdfExtractInspect(path, password);
}

/** 取文件原始字节（base64），交给 pdf.js 画缩略图 */
export function readPdfData(path: string): Promise<string> {
  return App.ReadPdfData(path);
}

/** 选择新 PDF 的保存位置（取消返回空串） */
export function pickOutPdfFile(defaultName: string, defaultDir: string): Promise<string> {
  return App.PickOutPdfFile(defaultName, defaultDir, '保存提取出的 PDF');
}

/** 按页码生成新 PDF */
export function extractPdfPages(opts: PdfExtractOptions): Promise<PdfExtractResult> {
  return App.ExtractPdfPages(opts);
}

/** 在资源管理器里定位生成的 PDF */
export function revealFile(path: string): Promise<void> {
  return App.OpenPath(path);
}
