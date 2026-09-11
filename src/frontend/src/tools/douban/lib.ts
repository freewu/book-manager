// 豆瓣补全工具的后端调用封装。
import type {DoubanProgress} from '../../types';
import {App, onDoubanDone, onDoubanProgress} from '../../api';

/** 开始批量补全，返回待处理数量（进度通过 douban:progress / douban:done 事件推送） */
export function startEnrichAll(): Promise<number> {
  return App.StartEnrichAll();
}

/** 当前是否已有补全任务在跑（用于避免重复启动） */
export function enrichRunning(): Promise<boolean> {
  return App.DoubanRunning();
}

export function watchDoubanProgress(cb: (p: DoubanProgress) => void): () => void {
  return onDoubanProgress(cb);
}

export function watchDoubanDone(cb: () => void): () => void {
  return onDoubanDone(cb);
}
