import type {ToolDef} from '../types';

/** 压缩文档：交给 Ghostscript 重写 PDF，按档位降采样图像来减小体积。 */
export const def: ToolDef = {
  category: 'pdf',
  icon: '🗜️',
  nameKey: 'tools.pdfCompress',
  descKey: 'tools.pdfCompressDesc',
  order: 80,
  bookFormats: ['pdf'],
};
