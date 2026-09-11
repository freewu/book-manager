// 数据目录工具的后端调用封装。
import {App} from '../../api';

/** 应用数据目录（book.db / 封面缓存 / 阅读器缓存都在这） */
export function dataDirPath(): Promise<string> {
  return App.DataDir();
}

/** 在系统文件管理器里定位文件或目录 */
export function openPath(path: string): Promise<void> {
  return App.OpenPath(path);
}
