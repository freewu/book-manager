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

export function deleteTag(id: number): Promise<void> {
  return App.DeleteTag(id);
}
