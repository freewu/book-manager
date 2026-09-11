import type {ToolDef} from '../types';

/** 清除密码：去掉 PDF 的打开密码（可选本地文件，也可作用书架里的 PDF）。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '🔓',
  nameKey: 'tools.pdfUnlock',
  descKey: 'tools.pdfUnlockDesc',
  order: 20,
  bookFormats: ['pdf'],
};
