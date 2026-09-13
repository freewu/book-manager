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

