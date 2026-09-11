// PDF 设置密码工具的后端调用封装。
import type {PdfFileInfo, PdfProtectOptions} from '../../types';
import {App} from '../../api';

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

/** 设置 / 修改打开密码（原文件写入失败时保持不变） */
export function setPdfPassword(opts: PdfProtectOptions): Promise<PdfFileInfo> {
  return App.SetPdfPassword(opts);
}
