// 扫描工具的后端调用封装。
import type {ScanProgress} from '../../types';
import {App, onScanProgress} from '../../api';

/** 已保存的扫描目录 */
export function listScanDirs(): Promise<string[]> {
  return App.ListScanDirs();
}

/** 打开系统目录选择框（后端会记住所选目录） */
export async function pickScanDir(): Promise<string> {
  const dir = await App.PickScanDir();
  return dir || '';
}

/** 从已保存的扫描目录里移除一个 */
export function removeScanDir(dir: string): Promise<void> {
  return App.RemoveScanDir(dir);
}

/** 记住扫描选项（格式 / 豆瓣自动补全） */
export function saveScanOptions(formats: string[], doubanAuto: boolean): Promise<void> {
  return App.SetSettings({formats: formats.join(','), douban_auto: doubanAuto ? '1' : '0'});
}

/** 启动扫描（进度通过 scan:progress 事件推送） */
export function startScan(dirs: string[]): Promise<void> {
  return App.ScanStart(dirs);
}

/** 订阅扫描进度，返回取消订阅函数 */
export function watchScanProgress(cb: (p: ScanProgress) => void): () => void {
  return onScanProgress(cb);
}
