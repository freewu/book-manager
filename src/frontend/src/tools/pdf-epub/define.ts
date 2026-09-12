import type {ToolDef} from '../types';

/** 转存 EPUB：把 PDF 的文字层转成 epub（可选保存目录）。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '📗',
  nameKey: 'tools.pdfEpub',
  descKey: 'tools.pdfEpubDesc',
  order: 30,
  bookFormats: ['pdf'],
};
