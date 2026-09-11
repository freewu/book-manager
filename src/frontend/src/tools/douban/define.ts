import type {ToolDef} from '../types';

/** 豆瓣补全：为缺少评分 / 封面的书批量获取豆瓣信息。 */
export const def: ToolDef = {
  category: 'other',
  icon: '🌐',
  nameKey: 'tools.douban',
  descKey: 'tools.doubanDesc',
  order: 40,
};
