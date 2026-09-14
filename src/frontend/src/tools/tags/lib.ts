// 标签工具的后端调用封装。
import type {Tag} from '../../types';
import {App} from '../../api';

export function listTags(): Promise<Tag[]> {
  return App.ListTags();
}

export function createTag(name: string, color: string): Promise<number> {
  return App.CreateTag(name, color);
}

export function updateTag(id: number, name: string, color: string): Promise<void> {
  return App.UpdateTag(id, name, color);
}

/** 冻结 / 解冻标签（保留已有打标关系，只是不再出现在书籍详情的可选列表）。 */
export function freezeTag(id: number, frozen: boolean): Promise<void> {
  return App.FreezeTag(id, frozen);
}

export function deleteTag(id: number): Promise<void> {
  return App.DeleteTag(id);
}

/** 拖拽排序：按传入的标签 id 顺序重写顺序（整批一个事务）。 */
export function reorderTags(ids: number[]): Promise<void> {
  return App.ReorderTags(ids);
}

/**
 * 随机生成一个标签颜色。
 * 色相全随机，饱和度 / 明度限制在偏中间的区间，避免随机到
 * 接近纯白（在白底上看不见）或接近纯黑（和深色文字糊在一起）的颜色。
 */
export function randomTagColor(): string {
  const h = Math.floor(Math.random() * 360);
  const s = 55 + Math.floor(Math.random() * 20); // 55% ~ 74%
  const l = 44 + Math.floor(Math.random() * 12); // 44% ~ 55%
  return hslToHex(h, s, l);
}

/** HSL(色相 0-360, 饱和度 %, 明度 %) → #rrggbb */
function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

