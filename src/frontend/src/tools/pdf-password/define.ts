import type {ToolDef} from '../types';

/** 设置密码：给 PDF 加上打开密码（可选本地文件，也可作用书架里的 PDF）。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '🔒',
  nameKey: 'tools.pdfPassword',
  descKey: 'tools.pdfPasswordDesc',
  order: 10,
  bookFormats: ['pdf'],
};
