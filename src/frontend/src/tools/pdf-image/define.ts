import type {ToolDef} from '../types';

/** 转存图片：把 PDF 的页面导成 PNG / JPEG 图片，可只导指定页。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '🖼️',
  nameKey: 'tools.pdfImage',
  descKey: 'tools.pdfImageDesc',
  order: 60,
  bookFormats: ['pdf'],
};
