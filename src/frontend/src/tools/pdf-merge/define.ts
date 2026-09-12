import type {ToolDef} from '../types';

/** 合并 PDF：把多个 PDF 按顺序拼成一个新文件（可选生成书签目录）。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '🧷',
  nameKey: 'tools.pdfMerge',
  descKey: 'tools.pdfMergeDesc',
  order: 40,
  bookFormats: ['pdf'],
};
