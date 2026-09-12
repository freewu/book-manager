import type {ToolDef} from '../types';

/** 修改文档：改 PDF 的标题 / 作者 / 主题 / 关键词，可另存也可覆盖原文件。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '📝',
  nameKey: 'tools.pdfMeta',
  descKey: 'tools.pdfMetaDesc',
  order: 70,
  bookFormats: ['pdf'],
};
