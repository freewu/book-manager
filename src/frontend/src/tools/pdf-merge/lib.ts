// 合并 PDF 工具的后端调用封装。
import type {PdfMergeFile, PdfMergeOptions, PdfMergeProgress, PdfMergeResult} from '../../types';
import {App, onPdfMergeProgress} from '../../api';

/** 打开系统文件选择框多选 PDF（取消返回空数组） */
export function pickPdfFiles(): Promise<string[]> {
  return App.PickPdfFiles();
}

/** 读取每个输入文件的信息（页数 / 是否加密 / 是否读得出来） */
export function inspectPdfFiles(paths: string[], passwords: Record<string, string> = {}): Promise<PdfMergeFile[]> {
  return App.PdfMergeInspect(paths, passwords);
}

/** 选择合并后的保存位置（取消返回空串） */
export function pickOutPdfFile(defaultName: string, defaultDir: string): Promise<string> {
  return App.PickOutPdfFile(defaultName, defaultDir, '保存合并后的 PDF');
}

/** 合并，成功后返回结果（合并结果本身不带密码） */
export function mergePdfs(opts: PdfMergeOptions): Promise<PdfMergeResult> {
  return App.MergePdfs(opts);
}

/** 订阅进度，返回取消订阅函数 */
export function subscribeProgress(cb: (p: PdfMergeProgress) => void): () => void {
  return onPdfMergeProgress(cb);
}

/** 在资源管理器里定位生成的 PDF */
export function revealFile(path: string): Promise<void> {
  return App.OpenPath(path);
}
