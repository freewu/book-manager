import type {ToolDef} from '../types';

/** 误录管理：查看并恢复被标记为误录的文件（整页工具）。 */
export const def: ToolDef = {
  category: 'other',
  icon: '🚫',
  nameKey: 'tools.misrecords',
  descKey: 'tools.misrecordsDesc',
  order: 30,
  badgeKey: 'misrecords',
  page: 'misrecords',
};
