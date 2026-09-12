import type {ToolDef} from '../types';

/** 提取页面：挑出 PDF 里的若干页，另存成一个新的 PDF。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '✂️',
  nameKey: 'tools.pdfExtract',
  descKey: 'tools.pdfExtractDesc',
  order: 50,
  bookFormats: ['pdf'],
};
