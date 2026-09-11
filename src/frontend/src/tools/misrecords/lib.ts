// 误录工具的后端调用封装。
import type {Misrecord} from '../../types';
import {App, fmtDate} from '../../api';

export {fmtDate};

export function listMisrecords(): Promise<Misrecord[]> {
  return App.GetMisrecords();
}

/** 恢复一条误录（下次扫描时会重新收录） */
export function restoreMisrecord(id: number): Promise<void> {
  return App.RemoveMisrecord(id);
}

export function clearMisrecords(): Promise<void> {
  return App.ClearMisrecords();
}
