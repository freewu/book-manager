import type {ToolDef} from '../types';

/** 扫描书库：把本地目录里的新电子书加入书架。 */
export const def: ToolDef = {
  category: 'other',
  icon: '🔍',
  nameKey: 'tools.scan',
  descKey: 'tools.scanDesc',
  order: 10,
};
