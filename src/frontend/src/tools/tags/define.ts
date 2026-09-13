import type {ToolDef} from '../types';

/**
 * 标签管理：新建 / 改名换色 / 冻结 / 删除标签。
 *
 * 这是「整页工具」：page 指向 App 的 tags 页面，工具卡片和侧栏的「标签」
 * 入口共用同一实现（src/tools/tags/page.tsx）。
 */
export const def: ToolDef = {
  category: 'other',
  icon: '🏷️',
  nameKey: 'tools.tags',
  descKey: 'tools.tagsDesc',
  order: 20,
  page: 'tags',
};
