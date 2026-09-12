import type {ToolDef} from '../types';

/** 转存 PDF：把 epub 排版成带目录书签的 pdf（可选保存目录）。 */
export const def: ToolDef = {
  category: 'epub',
  icon: '📕',
  nameKey: 'tools.epubPdf',
  descKey: 'tools.epubPdfDesc',
  order: 10,
  bookFormats: ['epub', 'kepub'],
};
