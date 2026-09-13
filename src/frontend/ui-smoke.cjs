const http = require('http');
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');

const DIST = path.resolve(__dirname, 'dist');
const PORT = 8743;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, {'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

// AES-256 加密的一页 PDF（用户密码 secret），由 internal/pdfcrypt 生成，
// 用于验证阅读器的密码输入流程。
const PDF_ENC_B64 = 'JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PC9QYWdlcyAyIDAgUi9UeXBlL0NhdGFsb2c+PgplbmRvYmoKMyAwIG9iago8PC9Db250ZW50cyA0IDAgUi9NZWRpYUJveFswIDAgMjAwIDIwMF0vUGFyZW50IDIgMCBSL1Jlc291cmNlczw8L0ZvbnQ8PC9GMSA1IDAgUj4+Pj4vVHlwZS9QYWdlPj4KZW5kb2JqCjQgMCBvYmoKPDwvTGVuZ3RoIDY0Pj4Kc3RyZWFtClTbNepIWFPqxFzl1MnkK4uuA6w/Y3PAEvakJfS3aTYrY7vfPTfUAPjd/SRDhvdw3ndA6fCVsn/hqljHNIPrcD4KZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8L0Jhc2VGb250L0hlbHZldGljYS9TdWJ0eXBlL1R5cGUxL1R5cGUvRm9udD4+CmVuZG9iagoyIDAgb2JqCjw8L0NvdW50IDEvS2lkc1szIDAgUl0vVHlwZS9QYWdlcz4+CmVuZG9iago2IDAgb2JqCjw8L0NyZWF0aW9uRGF0ZShcbibCBlx0/NlcXHxqhGUqzeuqlTj35G/z3MYz9QHrbYUzLVr2+GFcKfVr/exVdLdnl06CKS9Nb2REYXRlKNRPc9zCif2FosnFx689an97MtpNtVLIXGLpX5pJMbg6XG5SpzBJPTl2wMfmB0gH8g66KS9Qcm9kdWNlcigge3prdVc/+bZWv+uKGDfPnnlJl44wgAMzLxOOA6ZeXHIh6/QFlh6fmJUnmA/gxkoSKT4+CmVuZG9iago3IDAgb2JqCjw8L0NGPDwvU3RkQ0Y8PC9BdXRoRXZlbnQvRG9jT3Blbi9DRk0vQUVTVjMvTGVuZ3RoIDI1Nj4+Pj4vRmlsdGVyL1N0YW5kYXJkL0xlbmd0aCAyNTYvTzw5ODQ0ZmIyYTY4Mjg5ZGJhMWQyMWZlMjhlZmI3YjcyZmYyMTJhMTNmODBjZjNiZDIyNWFiNzI0MWUwOTA4MDc0YmFmNmJhYzZkY2QxYzcwZDBlMGY1NDU2OTJlYzMzNzU+L09FPGVkMDFlYzhkYTNjZGI2N2IxODhkZDBjOTY3ZGI1MDE5MTI3MjA5ZjU5NzQ2MTdmZDkwYjQwNWFlMGIzMzFmZTM+L1AgLTM5MDEvUGVybXM8NGI5ZGZmOGFjMGQ1ZDNkMzdhOGJlZjIzM2FlNzhiYTc+L1IgNS9TdG1GL1N0ZENGL1N0ckYvU3RkQ0YvVTw1MTY1ODQyN2I3NmU5ZTU2MDI0OWQ0MTYzY2I3NTk3YTc3MmJkNGI5NjFmMTEyYmI0NGRlNTljMThlNzk4YmE4YmZlNzM3Njc5NTY4NDg0NWQ1NTUzNTk4MzliZWYyYTQ+L1VFPGFkMDUzYjE0NWQ3OTM3NTQ4MTRmZWU3MGQ5OWQ5YjZiNzUxMTcyMDFkYTQwNmZjYmI1YWFmYmE0MDljOGIxOWU+L1YgNT4+CmVuZG9iagp4cmVmCjAgOAowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDM0NyAwMDAwMCBuIAowMDAwMDAwMDYwIDAwMDAwIG4gCjAwMDAwMDAxNzIgMDAwMDAgbiAKMDAwMDAwMDI4NCAwMDAwMCBuIAowMDAwMDAwMzk4IDAwMDAwIG4gCjAwMDAwMDA2MDUgMDAwMDAgbiAKdHJhaWxlcgo8PC9FbmNyeXB0IDcgMCBSL0lEWzwwMTAyMDMwNDA1MDYwNzA4MDkwQTBCMEMwRDBFMEYxMD4gPDJFRkQ1NjA3OUQ2QjBGNkM3NzQ2RUU2NDIwRUIyMDcyPl0vSW5mbyA2IDAgUi9Sb290IDEgMCBSL1NpemUgOD4+CnN0YXJ0eHJlZgoxMTI0CiUlRU9GCg==';

const BOOKS = [
  {id: 1, path: 'E:\\Books\\santi.epub', file_name: 'santi.epub', format: 'epub', title: '三体', author: '刘慈欣', publisher: '重庆出版社', language: 'zh', description: '地球往事三部曲之一。', size: 1048576, hash: 'abc', cover_path: '', has_cover: false, douban_url: 'https://book.douban.com/subject/2567698/', douban_rating: 8.9, douban_rating_count: 517493, douban_authors: '刘慈欣', misrecord: false, current_location: '', current_page: 0, total_pages: 0, read_progress: 0, last_read_at: '', total_read_seconds: 0, note_count: 0, tags: [{id: 1, name: '科幻', color: '#5b7cfa', frozen: false, book_count: 1, created_at: ''}], created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00'},
  {id: 2, path: 'E:\\Books\\huozhe.pdf', file_name: 'huozhe.pdf', format: 'pdf', title: '活着', author: '余华', publisher: '作家出版社', language: 'zh', description: '讲述福贵的一生。', size: 5242880, hash: 'def', cover_path: '', has_cover: false, douban_url: '', douban_rating: 0, douban_rating_count: 0, douban_authors: '', misrecord: false, current_location: '12', current_page: 12, total_pages: 120, read_progress: 10, last_read_at: '2026-02-01 20:00:00', total_read_seconds: 3600, note_count: 2, tags: [], created_at: '2026-01-02 10:00:00', updated_at: '2026-02-01 20:00:00'},
];

// 书架滚动位置测试用的一屏放不下的书（window.__manyBooks 打开时返回）
const MANY_BOOKS = Array.from({length: 40}, (_, i) => ({
  ...BOOKS[0],
  id: 100 + i,
  path: 'E:\\Books\\scroll' + i + '.epub',
  file_name: 'scroll' + i + '.epub',
  title: '滚动测试 ' + (i + 1),
  has_cover: false,
  tags: [],
}));

const MOCK = `
// 标签页测试用的标签表（ListTags / CreateTag / UpdateTag / FreezeTag / DeleteTag 共享）
window.__tags = [
  {id: 1, name: '科幻', color: '#5b7cfa', frozen: false, book_count: 1, created_at: ''},
  {id: 2, name: '待读', color: '#22c55e', frozen: false, book_count: 0, created_at: ''},
];
window.__lastTagAction = null;
// 误录管理页用的记录表（GetMisrecords / RemoveMisrecord / ClearMisrecords 共享）
window.__misrecords = [
  {id: 1, path: 'E:\\\\Books\\\\broken1.epub', file_name: 'broken1.epub', reason: '解析失败：缺少 OPF', created_at: '2026-03-01 10:00:00'},
  {id: 2, path: 'E:\\\\Books\\\\broken2.pdf', file_name: 'broken2.pdf', reason: '', created_at: '2026-03-02 11:30:00'},
];
window.__lastMisAction = null;
// 生成 n 页的最小 PDF（纯 ASCII，btoa 直接可用）：提取页面工具靠它渲染缩略图
window.__mkPdf = (n) => {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids = [];
  for (let i = 0; i < n; i++) {
    const pageObj = objs.length + 1;
    const contentObj = pageObj + 1;
    kids.push(pageObj + ' 0 R');
    const stream = 'BT /F1 24 Tf 20 100 Td (p' + (i + 1) + ') Tj ET';
    objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ' + contentObj + ' 0 R /Resources << /Font << /F1 3 0 R >> >> >>');
    objs.push('<< /Length ' + stream.length + ' >>\\nstream\\n' + stream + '\\nendstream');
  }
  objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>';
  let out = '%PDF-1.4\\n';
  const offsets = [];
  for (let i = 0; i < objs.length; i++) {
    offsets.push(out.length);
    out += (i + 1) + ' 0 obj\\n' + objs[i] + '\\nendobj\\n';
  }
  const xref = out.length;
  out += 'xref\\n0 ' + (objs.length + 1) + '\\n0000000000 65535 f \\n';
  for (const off of offsets) out += String(off).padStart(10, '0') + ' 00000 n \\n';
  out += 'trailer\\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\\nstartxref\\n' + xref + '\\n%%EOF\\n';
  return btoa(out);
};
window.go = { main: { App: {
  GetBooks: async (q) => {
    const all = window.__manyBooks ? ${JSON.stringify(MANY_BOOKS)} : ${JSON.stringify(BOOKS)};
    const ids = (q && q.tag_ids) || [];
    if (!ids.length) return all;
    return all.filter((b) => (b.tags || []).some((x) => ids.indexOf(x.id) >= 0));
  },
  GetBook: async (id) => ${JSON.stringify(BOOKS)}.find(b => b.id === id) || ${JSON.stringify(BOOKS)}[0],
  GetCoverData: async (id) => id === 1 ? 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AV//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AV//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z' : '', GetBookData: async (id) => id === 1 ? 'UEsDBBQACAAIAAAAAAAAAAAAAAAAAAAAAAAWAAAATUVUQS1JTkYvY29udGFpbmVyLnhtbFSNwUoGMQyEX6XkKvtXr6XtD4JnBZ8gdrNabJPQZmV9e9HDqreBmfm+eD16cx80ZhVOcHe5hWuORdiwMo3/jTt645lgHxwEZ52BsdMMVoIo8Spl78QWfmbhhECOQ8S22mj+RrftrS2K9pbg8eH+6dl/H4jtIrqB67RWXOxTKQGqtlrQqrAXetG5KJZ3fKWbozfwOfo/fH9681cAAAD//1BLBwgeC9fJnwAAAN0AAABQSwMEFAAIAAgAAAAAAAAAAAAAAAAAAAAAABEAAABPRUJQUy9jb250ZW50Lm9wZpySPY7bMBCFr0KwDSzqpwhgUPRZCHIkjUNSDDWylfQBnDpN+rQ5QJrcxvE5AsuyvAa22S313nyfhgTlbvKOHSAN2IeaF1nOd0pGbT7pFtjkXRhq3hHFrRDH4zFDG5usT60o8/yj6GPDH3CV5ZyNAT+PsEELgbBBSDVHy5X0QNpq0jfn1ppVG8fkZqU1Ahx4CDSIIisEV9KaLSE5UOc/389/f0ixBtfKJNDUJ/Xv9PPy7XT5/Wvu7+l1wunQjroF9bWbu/V73ocF7aHmpj9A4sz0gSBQzQ1yoaS4b6yk1wEbGEhJJPAM7TzDugTNQmf72HLmwaLe0JcINUevWxD7CO1V9uCKlSuyqSPvnjEdo0OjCfsg5vrD5N2zoVwN5TsN1Wqo3mQQj4sYIga4ORM0DO1ypvuPXobla2E1CxeNWB6c+h8AAP//UEsHCHs40dpGAQAAjwIAAFBLAwQUAAgACAAAAAAAAAAAAAAAAAAAAAAADwAAAE9FQlBTL2NvdmVyLmpwZ+zAsREAEBQFMCOYSfHv2L+gs8mzhiLJzm191awBAAB8L+cFAAD//1BLBwhcv7vFJwAAAMQLAABQSwMEFAAIAAgAAAAAAAAAAAAAAAAAAAAAAA4AAABPRUJQUy9jMS54aHRtbOzXT07CQBTH8asQDsCkcVUzzl00EGtSpNEmxV0hgBrrv1giNSaYmGBTqJUFKa2oh2HezLDyCqb2DOze8uX9Pgf4UsNumpV20zw+3asatm3tEuI4Ts3ZqbVODomm6zppF5sqo0Zjv86ofWSbDcaXl/zrgZLyoqT8HbTqZ4waGpOzGV+6cvpSkW/3EE/UdyaHHiWGxqjFxDwS6Ur0xnDxoc4jSOdyGsBzyPMBz3Ppj+VTD647ED+qNIHb17XbpcQqpPoJxCgRiyuVDGHQh/fsd+VJP+T5zSbyVNKR/gLiO55NNqO+Sj4hCNduFxUqVKhQoUKFChUqVKi2p/5zhZQ5RIp8Yn8BAAD//1BLBwhQn93LCAEAAGkNAABQSwMEFAAIAAgAAAAAAAAAAAAAAAAAAAAAAA4AAABPRUJQUy9jMi54aHRtbLLJKMnNUajIzckrtlXKKCkpsNLXLy8v1ys31ssvStc3tLS01K8AqVGys8lITUyxsynJLMlJtXu+Zs2TXT3PVy+w0YcI2OhDpJPyUyrtbDIMESoUnvZveD6h2UY/w9DOpsDuyY7GJ7tXPZ2z4um6eS9X9Txdt+Rle8+ziW1P97Q8n9sAUfu4oclGv8DORh9imj7IAXaAAAAA//9QSwcID5zQCJoAAACrAAAAUEsDBBQACAAIAAAAAAAAAAAAAAAAAAAAAAAOAAAAT0VCUFMvYzMueGh0bWyyySjJzVGoyM3JK7ZVyigpKbDS1y8vL9crN9bLL0rXN7S0tNSvAKlRsrPJSE1MsbMpySzJSbV7vmbNkx2dz1cvsNGHCNjoQ6ST8lMq7WwyDBEqFJ5uaHnW2f1kR9/TtjlP5+x6smO3jX6GoZ1Ngd3zzpXPJ7Q9Xbvs6c5tT3b0Pl074+mcFY8bmmz0C+xs9CFG6YNstwMEAAD//1BLBwjM+MXYmwAAAKgAAABQSwECFAAUAAgACAAAAAAAHgvXyZ8AAADdAAAAFgAAAAAAAAAAAAAAAAAAAAAATUVUQS1JTkYvY29udGFpbmVyLnhtbFBLAQIUABQACAAIAAAAAAB7ONHaRgEAAI8CAAARAAAAAAAAAAAAAAAAAOMAAABPRUJQUy9jb250ZW50Lm9wZlBLAQIUABQACAAIAAAAAABcv7vFJwAAAMQLAAAPAAAAAAAAAAAAAAAAAGgCAABPRUJQUy9jb3Zlci5qcGdQSwECFAAUAAgACAAAAAAAUJ/dywgBAABpDQAADgAAAAAAAAAAAAAAAADMAgAAT0VCUFMvYzEueGh0bWxQSwECFAAUAAgACAAAAAAAD5zQCJoAAACrAAAADgAAAAAAAAAAAAAAAAAQBAAAT0VCUFMvYzIueGh0bWxQSwECFAAUAAgACAAAAAAAzPjF2JsAAACoAAAADgAAAAAAAAAAAAAAAADmBAAAT0VCUFMvYzMueGh0bWxQSwUGAAAAAAYABgB0AQAAvQUAAAAA' : ${JSON.stringify(PDF_ENC_B64)}, GetStats: async () => ({total_books: 2, total_size: 6291456, total_read_seconds: 3600, total_notes: 2, total_tags: 1, total_misrecords: window.__misrecords.length, reading_books: 1, finished_books: 0, unread_books: 1, format_counts: {epub: 1, pdf: 1}}),
  GetSettings: async () => ({idle_seconds: '60', formats: 'epub,pdf,mobi,azw3,kepub', douban_auto: '0', theme: 'light'}),
  SetSettings: async () => {}, ListTags: async () => window.__tags.map((x) => Object.assign({}, x)),
  ListScanDirs: async () => ['E:\\\\Books'], AddScanDir: async () => {}, RemoveScanDir: async () => {}, PickScanDir: async () => '', ScanStart: async () => {}, ScanStatus: async () => false,
  ListNotes: async () => [], CreateNote: async () => 1, UpdateNote: async () => {}, DeleteNote: async () => {},
  DeleteBook: async () => {}, UpdateBookMeta: async () => {}, MarkMisrecord: async () => {}, UnmarkMisrecord: async () => {},
  SetBookTags: async (id, ids) => { window.__lastBookTags = {id: id, ids: ids}; },
  SetBooksTags: async (ids, tagIDs, mode) => { window.__lastTagAction = {op: 'batchTags', ids: ids, tagIDs: tagIDs, mode: mode}; },
  DeleteBooks: async (ids) => { window.__lastTagAction = {op: 'batchDelete', ids: ids}; return ids.length; },
  CreateTag: async (name, color) => {
    if (window.__tags.some((x) => x.name === name)) throw new Error('标签名已存在');
    const id = window.__tags.reduce((m, x) => Math.max(m, x.id), 0) + 1;
    window.__tags.push({id: id, name: name, color: color, frozen: false, book_count: 0, created_at: ''});
    window.__lastTagAction = {op: 'create', name: name, color: color};
    return id;
  },
  UpdateTag: async (id, name, color) => {
    const tg = window.__tags.find((x) => x.id === id);
    if (tg) { tg.name = name; tg.color = color; }
    window.__lastTagAction = {op: 'update', id: id, name: name, color: color};
  },
  FreezeTag: async (id, frozen) => {
    const tg = window.__tags.find((x) => x.id === id);
    if (tg) { tg.frozen = frozen; }
    window.__lastTagAction = {op: 'freeze', id: id, frozen: frozen};
  },
  DeleteTag: async (id) => {
    window.__tags = window.__tags.filter((x) => x.id !== id);
    window.__lastTagAction = {op: 'delete', id: id};
  },
  GetMisrecords: async () => window.__misrecords.map((x) => Object.assign({}, x)),
  RemoveMisrecord: async (id) => {
    window.__misrecords = window.__misrecords.filter((x) => x.id !== id);
    window.__lastMisAction = {op: 'restore', id: id};
  },
  ClearMisrecords: async () => {
    window.__misrecords = [];
    window.__lastMisAction = {op: 'clear'};
  },
  SaveProgress: async () => {}, ReportReading: async () => 3600, ListReadingSessions: async () => [],
  GetVersion: async () => 'v0.1.0-test', GetSystemDarkMode: async () => false, SetUiTheme: async () => {}, AutoEnrichBook: async () => {}, GetBookDataRange: async () => '',
  KKFileAddr: async () => '', SetKKFileAddr: async () => {}, OpenWithKKFileView: async () => {},
  DoubanSearch: async () => [], FetchDouban: async (id) => ${JSON.stringify(BOOKS)}[0], EnrichBookByTitle: async () => {}, EnrichAllMissing: async () => 0, ClearDoubanInfo: async () => {}, OpenBookFolder: async () => {}, DataDir: async () => 'E:\\\\AppData',
  PickPdfFile: async () => (window.__pickTarget || 'E:\\\\Books\\\\huozhe.pdf'),
  PdfInspect: async (p, pw) => {
    const name = String(p).split(/[\\/]/).pop();
    const locked = name.includes('locked');
    return {path: p, name, size: 5242880, pages: 120, title: '活着', encrypted: locked || pw === 'secret', needs_password: locked && pw !== 'secret'};
  },
  SetPdfPassword: async (o) => ({path: o.path, name: 'huozhe.pdf', size: 5242880, pages: 120, title: '活着', encrypted: true, needs_password: false}),
  RemovePdfPassword: async (o) => ({path: o.path, name: 'locked.pdf', size: 5242880, pages: 120, title: '活着', encrypted: false, needs_password: false}),
  // ---- 合并 PDF：多选 + 顺序 + 加密文件密码 ----
  PickPdfFiles: async () => (window.__pickMerge || ['E:\\\\Books\\\\a.pdf', 'E:\\\\Books\\\\b.pdf']),
  PdfMergeInspect: async (paths, passwords) => (paths || []).map((p) => {
    const name = String(p).split(/[\\\\/]/).pop();
    const locked = name.includes('locked');
    const pw = (passwords || {})[p] || '';
    return {path: p, name, size: 1048576, pages: 10, encrypted: locked, needs_password: locked && pw !== 'secret', error: name.includes('bad') ? '不是有效的 PDF 文件' : ''};
  }),
  PickOutPdfFile: async (name, dir, title) => {
    window.__lastOutTitle = title;
    window.__lastOutName = name;
    return window.__mergeOut === undefined ? (dir || 'E:\\\\Books') + '\\\\' + (name || 'merged.pdf') : window.__mergeOut;
  },
  MergePdfs: async (o) => {
    // 模拟后端逐个准备文件 + 开始合并（真实运行时是 pdfmerge:progress 事件）
    const fire = (p) => (window.__events['pdfmerge:progress'] || []).forEach((cb) => cb(p));
    window.__lastMerge = o;
    const files = o.files || [];
    for (let i = 0; i < files.length; i++) {
      fire({current: i, total: files.length, name: String(files[i]).split(/[\\\\/]/).pop(), phase: 'prepare'});
      await new Promise((r) => setTimeout(r, 60));
    }
    fire({current: files.length, total: files.length, name: '', phase: 'merge'});
    await new Promise((r) => setTimeout(r, 700));
    const blocked = files.some((f) => String(f).includes('locked') && !((o.passwords || {})[f]));
    if (blocked) throw new Error('《locked.pdf》已加密，需要先输入打开密码');
    return {path: o.out_path, files: files.length, pages: files.length * 10, bytes: 2097152, added: o.add_to_shelf, book_id: o.add_to_shelf ? 5 : 0, shelf_error: ''};
  },
  // ---- 提取页面：pdf.js 缩略图 + 跨组选择 ----
  ReadPdfData: async (p) => window.__pdfData || window.__mkPdf(23),
  PdfExtractInspect: async (p, pw) => {
    const name = String(p).split(/[\\\\/]/).pop();
    const locked = name.includes('locked');
    const needPw = locked && pw !== 'secret';
    return {path: p, name, size: 5242880, pages: needPw ? 0 : 23, encrypted: locked, needs_password: needPw, error: needPw ? 'PDF 已加密，需要先输入打开密码' : ''};
  },
  ExtractPdfPages: async (o) => {
    window.__lastExtract = o;
    await new Promise((r) => setTimeout(r, 400));
    return {path: o.out_path, pages: (o.pages || []).slice().sort((a, b) => a - b), bytes: 3145728, added: o.add_to_shelf, book_id: o.add_to_shelf ? 6 : 0, shelf_error: ''};
  },
  // ---- 转存图片：pdf.js 逐页渲染 → 一页一次落盘 ----
  SavePdfImage: async (o) => {
    const bin = atob(o.data || '');
    const u32 = (i) => ((bin.charCodeAt(i) << 24) | (bin.charCodeAt(i + 1) << 16) | (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3)) >>> 0;
    const isPng = bin.slice(0, 4) === '\\x89PNG';
    const isJpg = bin.slice(0, 2) === '\\xff\\xd8';
    let w = 0;
    let h = 0;
    if (isPng) {
      w = u32(16);
      h = u32(20);
    } else if (isJpg) {
      for (let i = 2; i + 9 < bin.length; i++) {
        if (bin.charCodeAt(i) !== 0xff) continue;
        const m = bin.charCodeAt(i + 1);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
          h = (bin.charCodeAt(i + 5) << 8) | bin.charCodeAt(i + 6);
          w = (bin.charCodeAt(i + 7) << 8) | bin.charCodeAt(i + 8);
          break;
        }
      }
    }
    const rec = {
      dir: o.dir,
      prefix: o.prefix,
      format: o.format,
      page: o.page,
      total: o.total,
      len: bin.length,
      png: isPng,
      jpg: isJpg,
      w,
      h,
    };
    // 头几张把原始 base64 也带上，Node 侧落盘后用真图片解码器复核
    if ((window.__savedImages || []).length < 3) rec.b64 = o.data;
    (window.__savedImages = window.__savedImages || []).push(rec);
    await new Promise((r) => setTimeout(r, 20));
    const name = o.prefix + '-' + String(o.page).padStart(3, '0') + '.' + (o.format === 'png' ? 'png' : 'jpg');
    return {path: o.dir + '\\\\' + name, name, bytes: bin.length, page: o.page, existed: o.page === 2};
  },
  // ---- 修改文档：读 / 写 PDF 文档信息 ----
  PdfMetaInspect: async (p, pw) => {
    const name = String(p).split(/[\\/]/).pop();
    const locked = name.includes('locked');
    const blank = {title: '', author: '', subject: '', keywords: [], creator: '', producer: '', creation_date: '', mod_date: ''};
    if (locked && pw !== 'secret') {
      return Object.assign({path: p, name, size: 5242880, pages: 0, version: '', encrypted: true, needs_password: true, error: 'PDF 已加密，需要先输入打开密码'}, blank);
    }
    window.__lastMetaInspect = {path: p, pw};
    return Object.assign({path: p, name, size: 5242880, pages: 23, version: locked ? '1.4' : '1.7', encrypted: locked, needs_password: false, error: ''}, blank, {
      title: '活着',
      author: '余华',
      subject: '长篇小说',
      keywords: ['当代文学', '中国文学'],
      creator: 'Microsoft Word 2019',
      producer: 'pdfcpu v0.15.0',
      creation_date: "D:20240102030405+08'00'",
      mod_date: "D:20240304050607+08'00'",
    });
  },
  SavePdfMeta: async (o) => {
    window.__lastMeta = o;
    await new Promise((r) => setTimeout(r, 300));
    const orig = {title: '活着', author: '余华', subject: '长篇小说', keywords: '当代文学,中国文学'};
    const changed = [];
    if ((o.title || '').trim() !== orig.title) changed.push('Title');
    if ((o.author || '').trim() !== orig.author) changed.push('Author');
    if ((o.subject || '').trim() !== orig.subject) changed.push('Subject');
    if ((o.keywords || []).join(',') !== orig.keywords) changed.push('Keywords');
    const inPlace = o.out_path === o.path;
    return {path: o.out_path, bytes: 5240000, changed, in_place: inPlace, added: !inPlace && o.add_to_shelf, book_id: o.add_to_shelf ? 7 : 0, shelf_error: ''};
  },
  // ---- 压缩文档：读源文件信息 / 检测 Ghostscript / 压缩 ----
  PdfCompressInspect: async (p, pw) => {
    const name = String(p).split(/[\\/]/).pop();
    const locked = name.includes('locked');
    const gs = window.__gs || {found: false, path: '', version: '', source: ''};
    window.__lastCompressInspect = {path: p, pw};
    if (locked && pw !== 'secret') {
      return {path: p, name, size: 5242880, pages: 0, version: '', encrypted: true, needs_password: true, error: 'PDF 已加密，需要先输入打开密码', ghostscript: gs};
    }
    return {path: p, name, size: 5242880, pages: 23, version: '1.7', encrypted: locked, needs_password: false, error: '', ghostscript: gs};
  },
  DetectGhostscript: async () => window.__gs || {found: false, path: '', version: '', source: ''},
  PickGhostscriptExe: async () => {
    window.__gs = {found: true, path: 'C:\\\\Program Files\\\\gs\\\\gs10.05.1\\\\bin\\\\gswin64c.exe', version: '10.05.1', source: 'manual'};
    return window.__gs.path;
  },
  CompressPdf: async (o) => {
    window.__lastCompress = o;
    // 模拟后端阶段式上报（真实运行时是 pdfcompress:progress 事件）
    const fire = (p) => (window.__events['pdfcompress:progress'] || []).forEach((cb) => cb(p));
    fire({phase: 'prep', percent: 5, elapsed: 0.1});
    await new Promise((r) => setTimeout(r, 150));
    fire({phase: 'compress', percent: 20, elapsed: 0.3});
    await new Promise((r) => setTimeout(r, 400));
    fire({phase: 'verify', percent: 92, elapsed: 0.8});
    const gs = o.engine !== 'pdfcpu' && (window.__gs || {}).found;
    const inBytes = 5242880;
    const outBytes = o.grayscale ? 1310720 : 1835008;
    return {
      path: o.out_path || o.path,
      in_path: o.path,
      in_bytes: inBytes,
      out_bytes: outBytes,
      saved_bytes: inBytes - outBytes,
      saved_percent: Math.round(((inBytes - outBytes) / inBytes) * 1000) / 10,
      pages: 23,
      engine: gs ? 'ghostscript' : 'pdfcpu',
      gs_version: gs ? '10.05.1' : '',
      preset: o.preset,
      dpi: o.dpi > 0 ? o.dpi : gs ? 150 : 0,
      in_place: o.out_path === o.path,
      seconds: 12.4,
      added: o.add_to_shelf && o.out_path !== o.path,
      book_id: o.add_to_shelf ? 9 : 0,
      shelf_error: '',
    };
  },
  OpenPath: async () => {}, DoubanRunning: async () => false, StartEnrichAll: async () => 0,
  PickOutDir: async () => (window.__outDir === undefined ? 'E:\\\\Books\\\\out' : window.__outDir),
  PickEpubFile: async () => (window.__pickEpub || 'E:\\\\Books\\\\santi.epub'),
  EpubInspect: async (p) => {
    const name = String(p).split(/[\\/]/).pop();
    return {path: p, name, size: 1048576, title: '三体', author: '刘慈欣', language: 'zh', chapters: 187, chars: 199856, has_cover: true};
  },
  EpubToPdf: async (o) => {
    const name = String(o.path).split(/[\\/]/).pop();
    if (name.includes('notext')) {
      return {path: o.path, file_name: '', pages: 0, chars: 0, chapters: 0, bytes: 0, no_text: true, added: false, book_id: 0, shelf_error: ''};
    }
    // 模拟后端逐章上报进度（真实运行时是 epub2pdf:progress 事件）
    const fire = (p) => (window.__events['epub2pdf:progress'] || []).forEach((cb) => cb(p));
    window.__lastEpubConvert = o;
    await new Promise((r) => setTimeout(r, 150));
    fire({current: 60, total: 187, chars: 50000});
    await new Promise((r) => setTimeout(r, 600));
    fire({current: 187, total: 187, chars: 199856});
    const base = (o.file_name || o.title || name.replace(/\.[^.]+$/, '')) + '.pdf';
    const dir = o.out_dir || String(o.path).replace(/[\\/][^\\/]*$/, '');
    return {path: dir + '\\\\' + base, file_name: base, pages: 212, chars: 199856, chapters: 187, bytes: 855716, no_text: false, added: o.add_to_shelf, book_id: o.add_to_shelf ? 4 : 0, shelf_error: ''};
  },
  ConvertPdfToEpub: async (o) => {
    const name = String(o.path).split(/[\\/]/).pop();
    if (name.includes('locked') && o.password !== 'secret') {
      return {path: o.path, file_name: '', pages: 0, chars: 0, bytes: 0, needs_password: true, no_text: false, dropped: 0, added: false, book_id: 0, shelf_error: ''};
    }
    // 模拟后端逐页上报进度（真实运行时是 pdf2epub:progress 事件）
    const fire = (p) => (window.__events['pdf2epub:progress'] || []).forEach((cb) => cb(p));
    window.__lastConvert = o;
    await new Promise((r) => setTimeout(r, 150));
    fire({current: 60, total: 120, chars: 12345});
    await new Promise((r) => setTimeout(r, 600));
    fire({current: 120, total: 120, chars: 45678});
    const base = (o.file_name || o.title || name.replace(/\.[^.]+$/, '')) + '.epub';
    const dir = o.out_dir || String(o.path).replace(/[\\/][^\\/]*$/, '');
    return {path: dir + '\\\\' + base, file_name: base, pages: 120, chars: 45678, bytes: 87654, needs_password: false, no_text: false, dropped: 4, added: o.add_to_shelf, book_id: o.add_to_shelf ? 3 : 0, shelf_error: ''};
  },
} } };
// 未来新增的绑定如果忘了加 mock，回退成“什么都不做”而不是报 TypeError
window.go.main.App = new Proxy(window.go.main.App, {
  get: (target, prop) => (prop in target ? target[prop] : async () => null),
});
// 极简事件总线：让 pdf2epub:progress 这类事件能被 mock 主动触发
window.__events = {};
window.runtime = {
  EventsOn: (name, cb) => {
    (window.__events[name] = window.__events[name] || []).push(cb);
  },
  // generated runtime.js 的 EventsOn 实际走的是 EventsOnMultiple
  EventsOnMultiple: (name, cb) => {
    (window.__events[name] = window.__events[name] || []).push(cb);
  },
  EventsOff: (name) => {
    delete window.__events[name];
  },
  EventsOffAll: () => {
    window.__events = {};
  },
  EventsOnce: () => {},
  EventsEmit: () => {},
  LogPrint: () => {},
};
`;

async function main() {
  const failures = [];
  // 断言：既能打日志，也能在回归时让脚本以非 0 退出
  const check = (label, ok, extra) => {
    console.log(label + ':', extra === undefined ? ok : extra);
    if (!ok) failures.push(label + (extra === undefined ? '' : ' = ' + extra));
  };
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 250)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 250)));
  await page.addInitScript(MOCK);
  await page.goto('http://localhost:' + PORT + '/', {waitUntil: 'networkidle'});
  await page.waitForTimeout(1200);
  if (errors.length) console.log('EARLY JS ERRORS:', errors.slice(0, 3).join(' | '));

  check('cards = 2', (await page.locator('.book-card').count()) === 2, await page.locator('.book-card').count());
  check('filter tag chips = 2', (await page.locator('.tag-chips .chip').count()) === 2, await page.locator('.tag-chips .chip').count());
  const logoOk = await page.evaluate(() => { const img = document.querySelector('.logo img.icon'); return img ? (img.src.length > 0 && img.naturalWidth > 0) : false; });
  check('sidebar logo img loaded', logoOk);

  // 统计页
  await page.evaluate(() => { document.querySelectorAll('.nav-item').forEach((b) => { if (b.textContent.includes('统计')) b.click(); }); });
  await page.waitForTimeout(400);
  check('stat cards = 8', (await page.locator('.stat-card').count()) === 8, await page.locator('.stat-card').count());
  await page.evaluate(() => { document.querySelectorAll('.nav-item').forEach((b) => { if (b.textContent.includes('书架')) b.click(); }); });
  await page.waitForTimeout(300);

  // open scan dialog (工具栏「扫描」按钮)
  await page.evaluate(() => { document.querySelectorAll('.toolbar button').forEach(b => { if (b.textContent.includes('扫描')) b.click(); }); });
  await page.waitForTimeout(400);
  check('scan dialog open', (await page.locator('text=扫描格式').count()) > 0);
  await page.screenshot({path: 'screens/scan.png'});
  await page.evaluate(() => document.querySelector('.modal-close')?.click());

  // ---- 标签页（侧栏「标签」入口）：列表 + 新建 / 编辑 / 冻结 / 删除 ----
  const nav = (text) => page.evaluate((tx) => {
    document.querySelectorAll('.nav-item').forEach((b) => { if (b.textContent.includes(tx)) b.click(); });
  }, text);
  await nav('标签');
  await page.waitForTimeout(400);
  check('侧栏「标签」打开标签页', (await page.locator('.tags-page').count()) === 1, await page.locator('.tags-page').count());
  check('标签行 = 2', (await page.locator('.tag-row').count()) === 2, await page.locator('.tag-row').count());
  const firstCount = (await page.locator('.tag-row .tag-count-btn').first().textContent()) || '';
  check('标签显示书籍数量', firstCount.includes('1 本书'), firstCount);
  check('使用中分组存在', (await page.locator('.page-section-title').allTextContents()).some((x) => x.includes('使用中')));

  // 随机颜色按钮：点一下换一个合法的 #rrggbb（且不等于默认色）
  const colorInput = page.locator('.tag-new-row .tag-color-input');
  const beforeColor = await colorInput.inputValue();
  let randomOk = false;
  for (let i = 0; i < 8 && !randomOk; i++) {
    await page.locator('[data-testid="tag-random"]').click();
    const v = await colorInput.inputValue();
    randomOk = /^#[0-9a-f]{6}$/.test(v) && v !== beforeColor;
  }
  check('随机颜色按钮生成合法颜色', randomOk, beforeColor);
  await page.screenshot({path: 'screens/tags.png'});

  // 新建标签
  await page.locator('.tag-name-input').first().fill('测试标签');
  await page.locator('.tag-new-row .btn-primary').click();
  await page.waitForTimeout(350);
  check('新建后标签行 = 3', (await page.locator('.tag-row').count()) === 3, await page.locator('.tag-row').count());
  check('新建调用参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'create' && a.name === '测试标签' && String(a.color).startsWith('#');
  }));
  check('新建后输入框已清空', (await page.locator('.tag-name-input').first().inputValue()) === '');

  // 重名 → 页面内报错，不再发请求
  await page.locator('.tag-name-input').first().fill('测试标签');
  await page.locator('.tag-new-row .btn-primary').click();
  await page.waitForTimeout(250);
  const dupErr = (await page.locator('.tag-err').textContent()) || '';
  check('同名标签报错', dupErr.includes('已经有同名标签'), dupErr);

  // 编辑：改名 + 换色（进入编辑态后行内没有文本，用 data-tag-id 定位）
  const editId = await page.locator('.tag-row').filter({hasText: '测试标签'}).getAttribute('data-tag-id');
  const target = page.locator('.tag-row[data-tag-id="' + editId + '"]');
  await target.locator('button', {hasText: '编辑'}).click();
  await page.waitForTimeout(250);
  await target.locator('.tag-name-input').fill('改名标签');
  await target.locator('.tag-color-input').evaluate((el) => {
    // React 会拦截 value 的 setter（value tracker），必须走原生 setter 才能触发 onChange
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '#ff0000');
    el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await target.locator('button', {hasText: '保存'}).click();
  await page.waitForTimeout(350);
  check('改名换色调用参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'update' && a.name === '改名标签' && a.color === '#ff0000';
  }));
  check('改名后列表已更新', (await page.locator('.tag-row').filter({hasText: '改名标签'}).count()) === 1);

  // 冻结 / 解冻
  const renamed = page.locator('.tag-row').filter({hasText: '改名标签'});
  await renamed.locator('button', {hasText: '冻结'}).click();
  await page.waitForTimeout(350);
  check('冻结调用参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'freeze' && a.frozen === true;
  }));
  check('冻结行样式 + 徽标', (await page.locator('.tag-row.frozen').count()) === 1, await page.locator('.tag-row.frozen').count());
  check('已冻结分组存在', (await page.locator('.page-section-title').allTextContents()).some((x) => x.includes('已冻结')));
  await page.screenshot({path: 'screens/tags-frozen.png'});

  // 点数量 → 跳到书架并按该标签筛选（冻结的标签不再出现在筛选条里）
  await page.locator('.tag-row').filter({hasText: '科幻'}).locator('.tag-count-btn').click();
  await page.waitForTimeout(400);
  check('跳到书架', (await page.locator('.book-grid').count()) === 1 && (await page.locator('.tags-page').count()) === 0);
  check('书架按标签筛选（1 本）', (await page.locator('.book-card').count()) === 1, await page.locator('.book-card').count());
  check('筛选条选中该标签', (await page.locator('.tag-chips .chip.active').count()) === 1);
  check('冻结标签不出现在筛选条', (await page.locator('.tag-chips .chip').count()) === 2, await page.locator('.tag-chips .chip').count());
  await page.screenshot({path: 'screens/tags-jump.png'});
  await page.locator('.filter-bar .btn-ghost').click(); // 清除筛选
  await page.waitForTimeout(400);
  check('清除筛选后回到 2 本', (await page.locator('.book-card').count()) === 2, await page.locator('.book-card').count());

  // 书架工具栏「标签管理」也进同一个页面
  await page.evaluate(() => { document.querySelectorAll('.toolbar button').forEach(b => { if (b.textContent.includes('标签')) b.click(); }); });
  await page.waitForTimeout(400);
  check('书架「标签管理」进入标签页', (await page.locator('.tags-page').count()) === 1);
  check('书架入口不弹窗', (await page.locator('.modal').count()) === 0);

  // 回到标签页继续：解冻 → 删除
  await nav('标签');
  await page.waitForTimeout(350);
  await page.locator('.tag-row').filter({hasText: '改名标签'}).locator('button', {hasText: '解冻'}).click();
  await page.waitForTimeout(350);
  check('解冻调用参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'freeze' && a.frozen === false;
  }));
  check('解冻后回到使用中', (await page.locator('.tag-row.frozen').count()) === 0);

  page.once('dialog', (d) => d.accept());
  await page.locator('.tag-row').filter({hasText: '改名标签'}).locator('button', {hasText: '删除'}).click();
  await page.waitForTimeout(400);
  check('删除调用参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'delete';
  }));
  check('删除后标签行 = 2', (await page.locator('.tag-row').count()) === 2, await page.locator('.tag-row').count());

  await nav('书架');
  await page.waitForTimeout(350);
  check('回到书架', (await page.locator('.book-card').count()) === 2);

  // ---- 书架批量管理：勾选 / 批量打标签 / 批量删除 ----
  const batchToggle = page.locator('[data-testid="batch-toggle"]');
  check('批量按钮初始文案', (await batchToggle.innerText()).includes('批量管理'), await batchToggle.innerText());
  await batchToggle.click();
  await page.waitForTimeout(300);
  check('批量操作条出现', (await page.locator('.batch-bar').count()) === 1);
  check('批量按钮变退出', (await batchToggle.innerText()).includes('退出批量'), await batchToggle.innerText());
  check('每本书都有勾选框', (await page.locator('.book-card .pick-box').count()) === 2, await page.locator('.book-card .pick-box').count());
  check('未选时从 0 本开始', (await page.locator('.batch-count').innerText()).includes('0'), await page.locator('.batch-count').innerText());
  check('未选时设置标签禁用', await page.locator('[data-testid="batch-tags"]').isDisabled());
  check('未选时删除禁用', await page.locator('[data-testid="batch-del"]').isDisabled());

  // 点卡片 = 勾选，不再打开阅读器
  await page.locator('.book-card').first().click();
  await page.waitForTimeout(250);
  check('点卡片变成勾选', (await page.locator('.book-card.picked').count()) === 1);
  check('点卡片不再进阅读器', (await page.locator('.reader-root').count()) === 0);
  check('已选 1 本', (await page.locator('.batch-count').innerText()).includes('1'), await page.locator('.batch-count').innerText());
  check('已选后按钮可用', !(await page.locator('[data-testid="batch-tags"]').isDisabled()) && !(await page.locator('[data-testid="batch-del"]').isDisabled()));
  check('勾选标记', (await page.locator('.book-card.picked .pick-box[data-picked="1"]').count()) === 1);

  // 全选 / 取消全选
  await page.locator('[data-testid="batch-all"]').click();
  await page.waitForTimeout(200);
  check('全选 2 本', (await page.locator('.book-card.picked').count()) === 2);
  check('全选后按钮变取消', (await page.locator('[data-testid="batch-all"]').innerText()).includes('取消全选'));
  await page.locator('[data-testid="batch-all"]').click();
  await page.waitForTimeout(200);
  check('取消全选', (await page.locator('.book-card.picked').count()) === 0);
  await page.locator('[data-testid="batch-all"]').click();
  await page.waitForTimeout(200);

  // 批量设置标签：追加
  await page.locator('[data-testid="batch-tags"]').click();
  await page.waitForTimeout(350);
  check('批量标签弹窗', (await page.locator('.modal .modal-head h2', {hasText: '批量设置标签'}).count()) === 1);
  check('弹窗提示 2 本书', (await page.locator('.modal .sub').innerText()).includes('2'), await page.locator('.modal .sub').innerText());
  check('三种方式 chip', (await page.locator('.modal .chip-row .chip').count()) === 3, await page.locator('.modal .chip-row .chip').count());
  check('默认追加方式', (await page.locator('.modal .chip-row .chip.active').innerText()).includes('追加'));
  check('可选标签 2 个', (await page.locator('.modal .tag-picker .tag-choice').count()) === 2);
  check('没选标签时应用禁用', await page.locator('[data-testid="batch-apply"]').isDisabled());
  await page.locator('.modal .tag-choice').first().click();
  await page.waitForTimeout(200);
  check('标签选中高亮', (await page.locator('.modal .tag-choice.on').count()) === 1);
  check('选了标签后应用可用', !(await page.locator('[data-testid="batch-apply"]').isDisabled()));
  await page.screenshot({path: 'screens/batch-tags.png'});
  await page.locator('[data-testid="batch-apply"]').click();
  await page.waitForTimeout(500);
  check('追加标签的参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'batchTags' && a.mode === 'add' && a.ids.length === 2 && a.tagIDs.length === 1 && a.ids[0] === 1 && a.ids[1] === 2;
  }), JSON.stringify(await page.evaluate(() => window.__lastTagAction)));
  check('弹窗已关闭', (await page.locator('.modal').count()) === 0);
  check('打标签后保持选择', (await page.locator('.book-card.picked').count()) === 2);

  // 移除方式
  await page.locator('[data-testid="batch-tags"]').click();
  await page.waitForTimeout(350);
  check('重开弹窗不残留选择', (await page.locator('.modal .tag-choice.on').count()) === 0);
  await page.locator('.modal .chip-row .chip', {hasText: '移除'}).click();
  await page.waitForTimeout(200);
  check('切到移除方式', (await page.locator('.modal .chip-row .chip.active').innerText()).includes('移除'));
  await page.locator('.modal .tag-choice').nth(1).click();
  await page.locator('[data-testid="batch-apply"]').click();
  await page.waitForTimeout(500);
  check('移除标签的参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'batchTags' && a.mode === 'remove' && a.tagIDs.length === 1 && a.tagIDs[0] === 2;
  }), JSON.stringify(await page.evaluate(() => window.__lastTagAction)));

  // 替换方式 + 冻结标签不进选择器
  await page.evaluate(() => { window.__tags[1].frozen = true; });
  await page.evaluate(() => { document.querySelectorAll('.toolbar button').forEach((b) => { if (b.textContent.includes('刷新')) b.click(); }); });
  await page.waitForTimeout(500);
  await page.locator('[data-testid="batch-tags"]').click();
  await page.waitForTimeout(350);
  check('冻结标签不出现在批量选择器', (await page.locator('.modal .tag-picker .tag-choice').count()) === 1, await page.locator('.modal .tag-picker .tag-choice').count());
  await page.locator('.modal .chip-row .chip', {hasText: '替换'}).click();
  await page.waitForTimeout(200);
  await page.locator('.modal .tag-choice').first().click();
  await page.locator('[data-testid="batch-apply"]').click();
  await page.waitForTimeout(500);
  check('替换标签的参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'batchTags' && a.mode === 'replace' && a.tagIDs.length === 1 && a.tagIDs[0] === 1;
  }), JSON.stringify(await page.evaluate(() => window.__lastTagAction)));
  await page.evaluate(() => { window.__tags[1].frozen = false; });
  await page.evaluate(() => { document.querySelectorAll('.toolbar button').forEach((b) => { if (b.textContent.includes('刷新')) b.click(); }); });
  await page.waitForTimeout(500);
  check('还原后筛选标签 chip = 2', (await page.locator('.tag-chips .chip').count()) === 2, await page.locator('.tag-chips .chip').count());
  check('刷新后选择还在', (await page.locator('.book-card.picked').count()) === 2);

  // 批量删除：取消 → 不删、留在批量模式
  page.once('dialog', (d) => d.dismiss());
  await page.locator('[data-testid="batch-del"]').click();
  await page.waitForTimeout(400);
  check('取消删除留在批量模式', (await page.locator('.batch-bar').count()) === 1 && (await page.locator('.book-card.picked').count()) === 2);
  check('取消删除不调后端', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !a || a.op !== 'batchDelete';
  }));
  await page.locator('[data-testid="batch-exit"]').click();
  await page.waitForTimeout(250);
  check('退出批量后操作条消失', (await page.locator('.batch-bar').count()) === 0);
  check('退出后勾选框消失', (await page.locator('.book-card .pick-box').count()) === 0);
  check('退出后文案还原', (await batchToggle.innerText()).includes('批量管理'));

  // 批量删除：确认 → 调用后端并退出批量
  await batchToggle.click();
  await page.waitForTimeout(250);
  await page.locator('.book-card').nth(1).click();
  await page.waitForTimeout(200);
  check('重新批量后只有 1 本', (await page.locator('.book-card.picked').count()) === 1);
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-testid="batch-del"]').click();
  await page.waitForTimeout(600);
  check('批量删除的参数', await page.evaluate(() => {
    const a = window.__lastTagAction;
    return !!a && a.op === 'batchDelete' && a.ids.length === 1 && a.ids[0] === 2;
  }), JSON.stringify(await page.evaluate(() => window.__lastTagAction)));
  check('删除后自动退出批量', (await page.locator('.batch-bar').count()) === 0 && (await page.locator('.book-card .pick-box').count()) === 0);
  check('删除后书还在（mock 不删列表）', (await page.locator('.book-card').count()) === 2);
  await page.screenshot({path: 'screens/shelf.png'});

  // ---- 误录管理：整页（不再是弹窗）----
  await nav('统计');
  await page.waitForTimeout(450);
  check('统计页误录角标', (await page.locator('.mis-badge').innerText()).includes('2'), await page.locator('.mis-badge').innerText());
  await page.locator('.toolbar button', {hasText: '误录管理'}).click();
  await page.waitForTimeout(500);
  check('统计页误录入口进整页', (await page.locator('.mis-page').count()) === 1);
  check('误录页不弹窗', (await page.locator('.modal').count()) === 0);
  check('误录行 = 2', (await page.locator('.mis-table tbody tr').count()) === 2, await page.locator('.mis-table tbody tr').count());
  check('误录页记录数', (await page.locator('.mis-page .toolbar-note').innerText()).includes('2'), await page.locator('.mis-page .toolbar-note').innerText());
  check('误录页有说明文字', (await page.locator('.mis-intro').count()) === 1);
  await page.screenshot({path: 'screens/misrecords.png'});

  // 恢复一条
  await page.locator('[data-testid="mis-restore"]').first().click();
  await page.waitForTimeout(450);
  check('恢复误录调用参数', await page.evaluate(() => {
    const a = window.__lastMisAction;
    return !!a && a.op === 'restore' && a.id === 1;
  }), JSON.stringify(await page.evaluate(() => window.__lastMisAction)));
  check('恢复后行 = 1', (await page.locator('.mis-table tbody tr').count()) === 1, await page.locator('.mis-table tbody tr').count());
  check('恢复后有 toast 提示', (await page.locator('.toast').count()) > 0);

  // 工具页卡片也进整页
  await nav('工具');
  await page.waitForTimeout(450);
  await page.locator('.tool-card').filter({hasText: '误录管理'}).click();
  await page.waitForTimeout(500);
  check('工具卡片进入误录页', (await page.locator('.mis-page').count()) === 1);
  check('工具卡片不弹窗', (await page.locator('.modal').count()) === 0);

  // 全部清除（confirm 接受）
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-testid="mis-clear"]').click();
  await page.waitForTimeout(500);
  check('清空调用的后端', await page.evaluate(() => {
    const a = window.__lastMisAction;
    return !!a && a.op === 'clear';
  }));
  check('清空后是空状态', (await page.locator('.mis-table').count()) === 0 && (await page.locator('.mis-page .empty').count()) === 1);
  check('清空后按钮消失', (await page.locator('[data-testid="mis-clear"]').count()) === 0);
  await nav('书架');
  await page.waitForTimeout(400);
  check('误录页返回书架', (await page.locator('.book-card').count()) === 2);

  // 设置页（侧栏导航）
  await page.evaluate(() => { document.querySelectorAll('.nav-item').forEach((b) => { if (b.textContent.includes('设置')) b.click(); }); });
  await page.waitForTimeout(300);
  check('settings open', (await page.locator('text=阅读计时闲置上限').count()) > 0);
  await page.evaluate(() => { document.querySelectorAll('.nav-item').forEach((b) => { if (b.textContent.includes('书架')) b.click(); }); });
  await page.waitForTimeout(300);

  // 书籍详情（右键菜单 → 详情）
  await page.locator('.book-card').first().click({button: 'right'});
  await page.waitForTimeout(300);
  await page.locator('.ctx-menu button').first().click();
  await page.waitForTimeout(600);
  check('detail modal', (await page.locator('text=书籍详情').count()) > 0);
  await page.screenshot({path: 'screens/detail.png'});
  await page.evaluate(() => document.querySelector('.modal-close')?.click());

  // open reader (GetBookData returns '' -> error state)
  await page.evaluate(() => document.querySelector('.book-card')?.click());
  await page.waitForTimeout(800);
  check('reader opened', (await page.locator('.reader-root').count()) > 0);
  await page.waitForTimeout(2500);
  const epubState = await page.evaluate(() => {
    const iframe = document.querySelector('#epub-view iframe');
    if (!iframe) return 'no iframe';
    try {
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      const h1 = doc.querySelector('h1');
      const p = doc.querySelector('p');
      return JSON.stringify({h1: h1 ? h1.textContent : null, pCount: doc.querySelectorAll('p').length, bodyLen: (doc.body ? doc.body.textContent : '').length});
    } catch (e) { return 'err: ' + e.message; }
  });
  check('epub rendered', epubState.includes('第一章'), epubState);

  // ---- 阅读器工具栏：显示当前字号 + 字号右侧的护眼模式开关 ----
  const fsNum = (await page.locator('[data-testid="reader-fontsize"] .font-num').innerText()) || '';
  check('阅读器显示当前字号', fsNum.trim() === '18', fsNum);
  check(
    '护眼按钮在字号选择右侧',
    await page.evaluate(() => {
      const fs = document.querySelector('[data-testid="reader-fontsize"]');
      const eye = document.querySelector('[data-testid="reader-eyecare"]');
      if (!fs || !eye) return false;
      const a = fs.getBoundingClientRect();
      const b = eye.getBoundingClientRect();
      return b.left >= a.right - 1 && Math.abs(b.top - a.top) < 12;
    }),
  );
  check('护眼按钮默认关闭', (await page.locator('.reader-root.eyecare').count()) === 0);

  await page.locator('[data-testid="reader-eyecare"]').click();
  await page.waitForTimeout(350);
  check('点击开启护眼模式', (await page.locator('.reader-root.eyecare').count()) === 1);
  check('护眼按钮高亮', (await page.locator('[data-testid="reader-eyecare"].on').count()) === 1);
  check(
    '护眼模式阅读区变羊皮纸色',
    (await page.evaluate(() => getComputedStyle(document.querySelector('.reader-body')).backgroundColor)) ===
      'rgb(243, 234, 216)',
    await page.evaluate(() => getComputedStyle(document.querySelector('.reader-body')).backgroundColor),
  );
  check(
    '护眼模式正文也是羊皮纸色（epub 主题生效）',
    await page.evaluate(() => {
      const doc = document.querySelector('#epub-view iframe')?.contentDocument;
      if (!doc) return false;
      return getComputedStyle(doc.body).backgroundColor === 'rgb(243, 234, 216)';
    }),
  );
  await page.screenshot({path: 'screens/reader-eyecare.png'});
  await page.locator('[data-testid="reader-eyecare"]').click();
  await page.waitForTimeout(300);
  check('再点关闭护眼模式', (await page.locator('.reader-root.eyecare').count()) === 0);

  // 面板里改字号 → 工具栏上的数字同步
  await page.locator('[data-testid="reader-fontsize"]').click();
  await page.waitForTimeout(300);
  check('字号面板打开', (await page.locator('.reader-settings-panel').count()) === 1);
  check(
    '面板里也有护眼模式开关',
    (await page.locator('[data-testid="panel-eyecare"]').count()) === 1,
  );
  await page.locator('.reader-settings-panel input[type="range"]').evaluate((el) => {
    // React 会拦截 value 的 setter，必须走原生 setter 才能触发 onChange
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, '24');
    el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await page.waitForTimeout(350);
  const fsNum2 = (await page.locator('[data-testid="reader-fontsize"] .font-num').innerText()) || '';
  check('字号变化后工具栏数字同步', fsNum2.trim() === '24', fsNum2);
  await page.locator('[data-testid="reader-fontsize"]').click();
  await page.waitForTimeout(250);

  await page.screenshot({path: 'screens/reader.png'});
  await page.evaluate(() => { const b = document.querySelector('.reader-toolbar button:last-child'); b?.click(); });

  // ---- 工具页：分类分组 + 工具卡片 ----
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('工具')) b.click();
    });
  });
  await page.waitForTimeout(500);
  const sections = await page.locator('.page-section-title').allTextContents();
  check('tool sections = 其他/PDF/EPUB', JSON.stringify(sections) === JSON.stringify(['其他', 'PDF', 'EPUB']), JSON.stringify(sections));
  check('tool cards = 14', (await page.locator('.tool-card').count()) === 14, await page.locator('.tool-card').count());
  const cardText = (await page.locator('.tool-card').first().textContent()) || '';
  check('工具卡片无「打开 ›」动作行', !cardText.includes('打开'), cardText);
  const sameRow = await page.evaluate(() => {
    const card = document.querySelector('.tool-card');
    if (!card) return false;
    const icon = card.querySelector('.tool-icon').getBoundingClientRect();
    const title = card.querySelector('.tool-title').getBoundingClientRect();
    const overlap = Math.min(icon.bottom, title.bottom) - Math.max(icon.top, title.top);
    return overlap > 0 && title.left > icon.left;
  });
  check('图标与名字在同一行', sameRow);

  // 「标签管理」卡片是整页工具：点它进标签页，而不是弹窗
  await page.locator('.tool-card').filter({hasText: '标签管理'}).click();
  await page.waitForTimeout(450);
  check('工具卡片进入标签页', (await page.locator('.tags-page').count()) === 1);
  check('工具卡片不弹窗', (await page.locator('.modal').count()) === 0);
  await nav('工具');
  await page.waitForTimeout(400);
  check('返回工具页', (await page.locator('.tool-card').count()) === 14, await page.locator('.tool-card').count());

  // 工具栏右侧的「类型」筛选：点分类只剩该类工具，点全部恢复
  check(
    '筛选栏：类型 + 全部/其他/PDF/EPUB 一行排开且不溢出',
    await page.evaluate(() => {
      const bar = document.querySelector('.filter-bar');
      if (!bar) return false;
      const chips = [...bar.querySelectorAll('.chip')];
      if (chips.length !== 4) return false;
      const tops = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)));
      const right = Math.max(...chips.map((c) => c.getBoundingClientRect().right));
      return (
        tops.size === 1 &&
        right <= window.innerWidth &&
        document.documentElement.scrollWidth <= window.innerWidth &&
        (bar.querySelector('.filter-label')?.textContent || '') === '类型'
      );
    }),
  );
  check(
    '筛选默认选中「全部」',
    (await page.locator('.filter-bar .chip.active').first().textContent() || '').startsWith('全部'),
    await page.locator('.filter-bar .chip.active').first().textContent(),
  );
  const clickChip = async (label, wait = 200) => {
    await page.evaluate((l) => {
      document.querySelectorAll('.filter-bar .chip').forEach((b) => {
        if (b.textContent.startsWith(l)) b.click();
      });
    }, label);
    await page.waitForTimeout(wait);
  };
  await clickChip('PDF');
  check(
    '筛选 PDF：只剩 PDF 分组',
    JSON.stringify(await page.locator('.page-section-title').allTextContents()) === JSON.stringify(['PDF']),
    JSON.stringify(await page.locator('.page-section-title').allTextContents()),
  );
  check('筛选 PDF：8 张卡片', (await page.locator('.tool-card').count()) === 8, await page.locator('.tool-card').count());
  check(
    '筛选 PDF：包含「压缩文档」卡片',
    (await page.locator('.tool-card').allTextContents()).some((c) => c.includes('压缩文档') && c.includes('🗜️')),
    JSON.stringify(await page.locator('.tool-card').allTextContents()),
  );
  check(
    '筛选 PDF：包含「修改文档」卡片',
    (await page.locator('.tool-card').allTextContents()).some((c) => c.includes('修改文档') && c.includes('📝')),
    JSON.stringify(await page.locator('.tool-card').allTextContents()),
  );
  check(
    '筛选 PDF：包含「转存图片」卡片',
    (await page.locator('.tool-card').allTextContents()).some((c) => c.includes('转存图片') && c.includes('🖼️')),
    JSON.stringify(await page.locator('.tool-card').allTextContents()),
  );
  check(
    '筛选 PDF：包含「提取页面」卡片',
    (await page.locator('.tool-card').allTextContents()).some((c) => c.includes('提取页面') && c.includes('✂️')),
    JSON.stringify(await page.locator('.tool-card').allTextContents()),
  );
  check(
    '筛选 PDF：包含「合并 PDF」卡片',
    (await page.locator('.tool-card').allTextContents()).some((c) => c.includes('合并 PDF') && c.includes('🧷')),
    JSON.stringify(await page.locator('.tool-card').allTextContents()),
  );
  check(
    '工具描述不再带「书架里右键」说明',
    !(await page.locator('.tool-desc').allTextContents()).some((d) => d.includes('右键')),
  );
  await clickChip('EPUB');
  check(
    '筛选 EPUB：1 张卡片（转存 PDF）',
    (await page.locator('.tool-card').count()) === 1 &&
      ((await page.locator('.tool-card').first().textContent()) || '').includes('转存 PDF'),
    await page.locator('.tool-card').first().textContent(),
  );
  await page.screenshot({path: 'screens/tools-filter.png'});
  await clickChip('全部');
  check('筛选「全部」：恢复 14 张卡片', (await page.locator('.tool-card').count()) === 14, await page.locator('.tool-card').count());
  await page.screenshot({path: 'screens/tools.png'});

  // PDF 工具：选文件 → 识别信息 → 设置密码
  await page.locator('.tool-card', {hasText: '设置密码'}).first().click();
  await page.waitForTimeout(400);
  check('pdf dialog open', (await page.locator('.modal .modal-head h2', {hasText: '设置密码'}).count()) > 0);
  const noFile = (await page.locator('.path-box').first().textContent()) || '';
  check('pdf dialog 未选文件占位', noFile.includes('尚未选择文件'), noFile);
  await page.locator('.modal .btn-soft', {hasText: '选择文件'}).click();
  await page.waitForTimeout(500);
  const pdfStatus = (await page.locator('.pdf-badge').first().textContent()) || '';
  check('pdf info + 未加密徽标', (await page.locator('.pdf-info-val').count()) === 3 && pdfStatus.includes('未加密'), (await page.locator('.pdf-info-val').count()) + ' / ' + pdfStatus);
  const pwInputs = page.locator('.modal input[type="password"]');
  await pwInputs.nth(0).fill('newpass');
  await pwInputs.nth(1).fill('newpass');
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForTimeout(500);
  check('pdf protect done', (await page.locator('.tool-note.ok').count()) > 0);
  await page.screenshot({path: 'screens/pdf-password.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 书架右键 PDF → PDF 工具 → 设置密码
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('书架')) b.click();
    });
  });
  await page.waitForTimeout(400);
  await page.locator('.book-card').nth(1).click({button: 'right'});
  await page.waitForTimeout(400);
  check('ctx menu open', (await page.locator('.ctx-menu').count()) > 0);
  check('ctx PDF 工具入口', (await page.locator('.ctx-sub > button', {hasText: 'PDF'}).count()) > 0);
  await page.locator('.ctx-sub').first().hover();
  await page.waitForTimeout(300);
  const subItems = await page.locator('.ctx-submenu button').allTextContents();
  check(
    'ctx 子菜单 = [设置密码, 清除密码, 转存 EPUB, 合并 PDF, 提取页面, 转存图片, 修改文档, 压缩文档]',
    subItems.length === 8 &&
      subItems[0].includes('设置密码') &&
      subItems[1].includes('清除密码') &&
      subItems[2].includes('转存 EPUB') &&
      subItems[3].includes('合并 PDF') &&
      subItems[4].includes('提取页面') &&
      subItems[5].includes('转存图片') &&
      subItems[6].includes('修改文档') &&
      subItems[7].includes('压缩文档'),
    JSON.stringify(subItems),
  );
  await page.screenshot({path: 'screens/ctx-pdf.png'});
  await page.locator('.ctx-submenu button', {hasText: '设置密码'}).first().click();
  await page.waitForTimeout(600);
  const shelfHint = (await page.locator('.modal .hint').first().textContent()) || '';
  check('书架入口提示', shelfHint.includes('活着'), shelfHint);
  await page.screenshot({path: 'screens/pdf-password-shelf.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 书架右键 PDF → PDF 工具 → 清除密码（未加密的文件给出提示）
  await page.locator('.book-card').nth(1).click({button: 'right'});
  await page.waitForTimeout(400);
  await page.locator('.ctx-sub').first().hover();
  await page.waitForTimeout(300);
  await page.locator('.ctx-submenu button', {hasText: '清除密码'}).first().click();
  await page.waitForTimeout(600);
  check('清除密码弹窗', (await page.locator('.modal .modal-head h2', {hasText: '清除密码'}).count()) > 0);
  check('未加密文件提示', (await page.locator('.tool-note.ok', {hasText: '未加密'}).count()) > 0);
  await page.screenshot({path: 'screens/pdf-unlock-plain.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 工具页 → 清除密码：选加密文件 → 密码错误提示 → 正确密码 → 清除成功
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('工具')) b.click();
    });
  });
  await page.waitForTimeout(400);
  await page.locator('.tool-card', {hasText: '清除密码'}).first().click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__pickTarget = 'E:\\Books\\locked.pdf';
  });
  await page.locator('.modal .btn-soft', {hasText: '选择文件'}).click();
  await page.waitForTimeout(500);
  const unlockBadge = (await page.locator('.pdf-badge').first().textContent()) || '';
  check('加密文件被识别', unlockBadge.includes('已加密'), unlockBadge);
  const unlockErr = (await page.locator('.tool-note.err').textContent().catch(() => '')) || '';
  check('未填当前密码提示', unlockErr.includes('当前密码不正确'), unlockErr);
  await page.locator('.modal input[type="password"]').fill('secret');
  await page.locator('.modal .btn-soft', {hasText: '验证'}).click();
  await page.waitForTimeout(400);
  check('验证后错误消失', (await page.locator('.tool-note.err').count()) === 0);
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForTimeout(500);
  const unlockDone = (await page.locator('.tool-note.ok').textContent().catch(() => '')) || '';
  check('清除密码成功', unlockDone.includes('已清除密码'), unlockDone);
  await page.screenshot({path: 'screens/pdf-unlock.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 工具页 → 转存 EPUB：选文件 → 默认保存目录 / 文件名 → 转换（进度条） → 完成统计
  await page.locator('.tool-card', {hasText: '转存 EPUB'}).first().click();
  await page.waitForTimeout(400);
  check('转存 EPUB 弹窗', (await page.locator('.modal .modal-head h2', {hasText: '转存 EPUB'}).count()) > 0);
  await page.evaluate(() => {
    window.__pickTarget = 'E:\\Books\\kaifa.pdf';
  });
  await page.locator('.modal .btn-soft', {hasText: '选择文件'}).click();
  await page.waitForTimeout(500);
  check('转存 EPUB 识别 PDF 信息', (await page.locator('.pdf-info-val').count()) === 3);
  const outBox = (await page.locator('.path-box').nth(1).textContent()) || '';
  check('默认保存目录 = PDF 目录', outBox.includes('E:\\Books'), outBox);
  const nameInput = page.locator('.modal .form-row input').nth(0);
  check('默认文件名 = 原文件名', (await nameInput.inputValue()) === 'kaifa', await nameInput.inputValue());
  await page.screenshot({path: 'screens/pdf-epub.png'});
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForTimeout(450);
  check('转换进度条可见', (await page.locator('.progress-track .fill').count()) > 0);
  const progText = (await page.locator('.progress-track + .hint').textContent().catch(() => '')) || '';
  check('进度文案含页数与字数', progText.includes('60/120') && progText.includes('12345'), progText);
  await page.waitForTimeout(900);
  const epubDone = (await page.locator('.tool-note.ok').textContent().catch(() => '')) || '';
  check('转存完成统计', epubDone.includes('转换完成') && epubDone.includes('120 页') && epubDone.includes('45678'), epubDone);
  check('转存结果已入库提示', epubDone.includes('kaifa.epub') && epubDone.includes('已加入书架'), epubDone);
  const convertOpts = await page.evaluate(() => window.__lastConvert);
  check(
    '转换参数（目录/文件名/封面/入库）',
    convertOpts && convertOpts.out_dir === '' && convertOpts.file_name === 'kaifa' && convertOpts.use_cover === true && convertOpts.add_to_shelf === true && !!convertOpts.language,
    JSON.stringify(convertOpts),
  );
  check('完成后可打开所在目录', (await page.locator('.modal-foot .btn-primary', {hasText: '打开所在目录'}).count()) > 0);
  await page.screenshot({path: 'screens/pdf-epub-done.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 工具页 → 转存 PDF：选文件 → 默认保存目录 / 文件名 → 纸张 → 转换（进度条） → 完成统计
  await page.locator('.tool-card', {hasText: '转存 PDF'}).first().click();
  await page.waitForTimeout(400);
  check('转存 PDF 弹窗', (await page.locator('.modal .modal-head h2', {hasText: '转存 PDF'}).count()) > 0);
  await page.evaluate(() => {
    window.__pickEpub = 'E:\\Books\\santi2.epub';
  });
  await page.locator('.modal .btn-soft', {hasText: '选择文件'}).click();
  await page.waitForTimeout(500);
  check('转存 PDF 识别 EPUB 信息', (await page.locator('.pdf-info-val').count()) === 3);
  const epubInfo = (await page.locator('.pdf-info').textContent()) || '';
  check('信息含章节与字数', epubInfo.includes('187 章') && epubInfo.includes('199856 字'), epubInfo);
  const epubOutBox = (await page.locator('.path-box').nth(1).textContent()) || '';
  check('转存 PDF 默认目录 = EPUB 目录', epubOutBox.includes('E:\\Books'), epubOutBox);
  const epubNameInput = page.locator('.modal .form-row input').nth(0);
  check('转存 PDF 默认文件名 = 原文件名', (await epubNameInput.inputValue()) === 'santi2', await epubNameInput.inputValue());
  check('纸张默认 A4', (await page.locator('.modal select').inputValue()) === 'A4');
  await page.locator('.modal select').selectOption('16K');
  await page.screenshot({path: 'screens/epub-pdf.png'});
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForTimeout(450);
  check('转存 PDF 进度条可见', (await page.locator('.progress-track .fill').count()) > 0);
  const epubProgText = (await page.locator('.progress-track + .hint').textContent().catch(() => '')) || '';
  check('转存 PDF 进度文案含章节与字数', epubProgText.includes('60/187') && epubProgText.includes('50000'), epubProgText);
  await page.waitForTimeout(900);
  const pdfDone = (await page.locator('.tool-note.ok').textContent().catch(() => '')) || '';
  check('转存 PDF 完成统计', pdfDone.includes('转换完成') && pdfDone.includes('212 页') && pdfDone.includes('187 章'), pdfDone);
  check('转存 PDF 结果已入库提示', pdfDone.includes('santi2.pdf') && pdfDone.includes('已加入书架'), pdfDone);
  const epubOpts = await page.evaluate(() => window.__lastEpubConvert);
  check(
    '转存 PDF 参数（纸张/目录/封面/入库）',
    epubOpts && epubOpts.page_size === '16K' && epubOpts.out_dir === '' && epubOpts.use_cover === true && epubOpts.add_to_shelf === true && epubOpts.file_name === 'santi2',
    JSON.stringify(epubOpts),
  );
  await page.screenshot({path: 'screens/epub-pdf-done.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 工具页 → 合并 PDF：多选 → 调顺序 → 移除 → 加密文件密码 → 合并（进度） → 完成统计
  await page.locator('.tool-card', {hasText: '合并 PDF'}).first().click();
  await page.waitForTimeout(400);
  check('合并 PDF 弹窗', (await page.locator('.modal .modal-head h2', {hasText: '合并 PDF'}).count()) > 0);
  check('合并 PDF 空列表提示', (await page.locator('.merge-empty').count()) === 1);
  check('合并 PDF 未选文件时不能合并', await page.locator('.modal-foot .btn-primary').isDisabled());
  await page.locator('.modal .btn-soft', {hasText: '添加 PDF'}).click();
  await page.waitForTimeout(500);
  const mergeNames = () => page.locator('.merge-name').allTextContents();
  check('合并 PDF 添加了 2 个文件', (await page.locator('.merge-item').count()) === 2, await page.locator('.merge-item').count());
  check('合并 PDF 列表 = [a.pdf, b.pdf]', JSON.stringify(await mergeNames()) === JSON.stringify(['a.pdf', 'b.pdf']), JSON.stringify(await mergeNames()));
  const mergeHead = (await page.locator('.modal .form-row label').first().textContent()) || '';
  check('合并 PDF 显示总页数与大小', mergeHead.includes('2') && mergeHead.includes('20 页'), mergeHead);
  check('合并 PDF 第一个不能上移', await page.locator('.merge-item').first().locator('.btn-icon').nth(0).isDisabled());
  await page.locator('.merge-item').first().locator('.btn-icon').nth(1).click(); // ↓ 下移
  await page.waitForTimeout(200);
  check('合并 PDF 顺序可调整', JSON.stringify(await mergeNames()) === JSON.stringify(['b.pdf', 'a.pdf']), JSON.stringify(await mergeNames()));
  await page.locator('.merge-item').nth(1).locator('.btn-icon').nth(2).click(); // ✕ 移除 a.pdf
  await page.waitForTimeout(200);
  check('合并 PDF 可移除文件', JSON.stringify(await mergeNames()) === JSON.stringify(['b.pdf']), JSON.stringify(await mergeNames()));
  await page.locator('.modal .btn-soft', {hasText: '添加 PDF'}).click(); // 再加回 a.pdf
  await page.waitForTimeout(400);
  check('合并 PDF 不重复添加已选文件', JSON.stringify(await mergeNames()) === JSON.stringify(['b.pdf', 'a.pdf']), JSON.stringify(await mergeNames()));
  const mergeLayout = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    if (!modal) return null;
    const r = modal.getBoundingClientRect();
    const items = [...document.querySelectorAll('.merge-item')];
    const actions = [...document.querySelectorAll('.merge-actions')].map((a) => a.getBoundingClientRect().right);
    return {
      right: Math.round(r.right),
      inner: window.innerWidth,
      itemOverflow: items.some((it) => it.scrollWidth > it.clientWidth + 1),
      maxActionRight: actions.length ? Math.round(Math.max(...actions)) : 0,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  check(
    '合并 PDF 弹窗不溢出、操作按钮在框内',
    !!mergeLayout &&
      mergeLayout.right <= mergeLayout.inner &&
      !mergeLayout.itemOverflow &&
      !mergeLayout.pageOverflow &&
      mergeLayout.maxActionRight <= mergeLayout.right,
    JSON.stringify(mergeLayout),
  );
  await page.screenshot({path: 'screens/pdf-merge.png'});

  // 加密文件：默认不能合并，需要先验证密码
  await page.evaluate(() => {
    window.__pickMerge = ['E:\\Books\\locked.pdf'];
  });
  await page.locator('.modal .btn-soft', {hasText: '添加 PDF'}).click();
  await page.waitForTimeout(500);
  check('合并 PDF 加密文件带徽标', (await page.locator('.merge-item').nth(2).locator('.pdf-badge.on').count()) === 1);
  check(
    '合并 PDF 提示需要打开密码',
    ((await page.locator('.merge-item').nth(2).textContent()) || '').includes('需要打开密码'),
  );
  check('合并 PDF 有密码未验证时不能合并', await page.locator('.modal-foot .btn-primary').isDisabled());
  await page.locator('.merge-item').nth(2).locator('input[type="password"]').fill('secret');
  await page.locator('.merge-item').nth(2).locator('.btn-soft', {hasText: '验证'}).click();
  await page.waitForTimeout(400);
  check(
    '合并 PDF 验证密码后可以合并',
    !(await page.locator('.modal-foot .btn-primary').isDisabled()) &&
      !((await page.locator('.merge-item').nth(2).textContent()) || '').includes('需要打开密码'),
  );

  await page.locator('.modal-foot .btn-primary').click(); // 未选保存位置 → 走保存对话框（mock）
  await page.waitForTimeout(300);
  check('合并 PDF 进度条可见', (await page.locator('.progress-track .fill').count()) > 0);
  const mergeProgText = (await page.locator('.progress-track + .hint').textContent().catch(() => '')) || '';
  check('合并 PDF 进度文案', /正在准备|正在合并/.test(mergeProgText), mergeProgText);
  await page.waitForTimeout(1100);
  const mergeDone = (await page.locator('.tool-note.ok').textContent().catch(() => '')) || '';
  check('合并 PDF 完成统计', mergeDone.includes('合并完成') && mergeDone.includes('3 个文件') && mergeDone.includes('30 页'), mergeDone);
  check('合并 PDF 结果已入库提示', mergeDone.includes('-合并.pdf') && mergeDone.includes('已加入书架'), mergeDone);
  const mergeOpts = await page.evaluate(() => window.__lastMerge);
  check(
    '合并 PDF 参数（顺序/密码/书签/入库）',
    mergeOpts &&
      JSON.stringify((mergeOpts.files || []).map((f) => String(f).split(/[\\/]/).pop())) === JSON.stringify(['b.pdf', 'a.pdf', 'locked.pdf']) &&
      mergeOpts.passwords['E:\\Books\\locked.pdf'] === 'secret' &&
      mergeOpts.bookmarks === true &&
      mergeOpts.add_to_shelf === true &&
      /-合并\.pdf$/.test(mergeOpts.out_path),
    JSON.stringify(mergeOpts),
  );
  await page.screenshot({path: 'screens/pdf-merge-done.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 工具页 → 提取页面：一组 20 页缩略图 → 选中 → 翻组不丢 → 放大细看 → 提取
  await page.evaluate(() => {
    window.__pickTarget = 'E:\\Books\\huozhe.pdf';
  });
  await page.locator('.tool-card', {hasText: '提取页面'}).first().click();
  await page.waitForTimeout(400);
  check('提取页面弹窗', (await page.locator('.modal .modal-head h2', {hasText: '提取页面'}).count()) > 0);
  check(
    '提取页面：未选文件占位 + 不能提取',
    ((await page.locator('.path-box').first().textContent()) || '').includes('还没有选择') &&
      (await page.locator('.modal-foot .btn-primary').isDisabled()),
  );
  await page.locator('.modal .btn-soft', {hasText: '选择 PDF 文件'}).click();
  await page.waitForSelector('.page-thumb[data-page="20"]', {timeout: 15000}).catch(() => {});
  const exSrc = (await page.locator('.path-box').first().textContent()) || '';
  check('提取页面：识别页数/大小', exSrc.includes('huozhe.pdf') && exSrc.includes('23') && exSrc.includes('5.0 MB'), exSrc);
  check('提取页面：一组 20 页', (await page.locator('.page-thumb').count()) === 20, await page.locator('.page-thumb').count());
  const exRange1 = (await page.locator('.thumb-range').first().textContent()) || '';
  check('提取页面：页码范围 第 1-20 页 · 共 23 页', exRange1.includes('1-20') && exRange1.includes('23'), exRange1);
  const exPainted = await page.evaluate(() => {
    const c = document.querySelector('.page-thumb[data-page="1"] canvas');
    if (!c || !c.width) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 200) dark++;
    return dark;
  });
  check('提取页面：缩略图真的画出了内容', exPainted > 20, exPainted);
  check('提取页面：第一组不能再上一组', await page.locator('.thumb-toolbar .btn-soft', {hasText: '上一组'}).isDisabled());
  await page.locator('.page-thumb[data-page="3"] .page-thumb-canvas').click();
  await page.waitForTimeout(200);
  const exSelLabel = async () => ((await page.locator('.modal .form-row > label', {hasText: '已选'}).first().textContent()) || '');
  check(
    '提取页面：点缩略图选中第 3 页',
    (await page.locator('.page-thumb.on').count()) === 1 &&
      (await page.locator('.sel-chip').count()) === 1 &&
      (await exSelLabel()).includes('已选 1 页'),
    await exSelLabel(),
  );
  await page.locator('.thumb-toolbar .btn-soft', {hasText: '下一组'}).click();
  await page.waitForSelector('.page-thumb[data-page="21"]', {timeout: 15000});
  check('提取页面：第二组只剩 3 页', (await page.locator('.page-thumb').count()) === 3, await page.locator('.page-thumb').count());
  const exRange2 = (await page.locator('.thumb-range').first().textContent()) || '';
  check('提取页面：翻到 第 21-23 页', exRange2.includes('21-23'), exRange2);
  check(
    '提取页面：翻组后选择不丢',
    (await page.locator('.sel-chip').count()) === 1 && ((await page.locator('.sel-chip').first().textContent()) || '').startsWith('3'),
    JSON.stringify(await page.locator('.sel-chip').allTextContents()),
  );
  check('提取页面：最后一组不能再下一组', await page.locator('.thumb-toolbar .btn-soft', {hasText: '下一组'}).isDisabled());
  await page.locator('.page-thumb[data-page="22"] .page-thumb-canvas').click();
  await page.waitForTimeout(200);
  check('提取页面：已选 2 页', (await page.locator('.sel-chip').count()) === 2, await page.locator('.sel-chip').count());

  // 放大查看单页
  await page.locator('.page-thumb[data-page="22"] .page-thumb-zoom').click();
  await page.waitForSelector('.viewer-stage canvas', {timeout: 15000}).catch(() => {});
  check('提取页面：打开放大查看', (await page.locator('.viewer').count()) > 0);
  check('提取页面：放大页是第 22 页', ((await page.locator('.viewer-page').textContent()) || '').includes('22 / 23'), await page.locator('.viewer-page').textContent());
  const vw0 = await page.evaluate(() => document.querySelector('.viewer-stage canvas')?.width || 0);
  check('提取页面：放大后画布远大于缩略图', vw0 > 900 && vw0 < 1300, vw0);
  await page.locator('.viewer-bar button', {hasText: '＋'}).click();
  await page.waitForTimeout(500);
  const vw1 = await page.evaluate(() => document.querySelector('.viewer-stage canvas')?.width || 0);
  check('提取页面：还能继续放大', vw1 > vw0, vw0 + ' -> ' + vw1);
  await page.locator('.viewer-bar button', {hasText: '适应'}).click();
  await page.waitForTimeout(500);
  const vw2 = await page.evaluate(() => document.querySelector('.viewer-stage canvas')?.width || 0);
  check(
    '提取页面：「适应」回到 100%',
    vw2 === 720 && ((await page.locator('.viewer-zoom').textContent()) || '').trim() === '100%',
    vw2 + ' / ' + (await page.locator('.viewer-zoom').textContent()),
  );
  check('提取页面：放大时这一页是选中态', (await page.locator('.viewer-bar button', {hasText: '取消本页'}).count()) === 1);
  await page.locator('.viewer-bar button', {hasText: '取消本页'}).click();
  await page.waitForTimeout(300);
  check(
    '提取页面：放大时能取消选中',
    (await page.locator('.sel-chip').count()) === 1 && (await page.locator('.viewer-bar button', {hasText: '选中本页'}).count()) === 1,
  );
  await page.locator('.viewer-bar button', {hasText: '选中本页'}).click();
  await page.waitForTimeout(300);
  check('提取页面：放大时能重新选中', (await page.locator('.sel-chip').count()) === 2);
  await page.locator('.viewer-bar button', {hasText: '上一页'}).click();
  await page.waitForTimeout(500);
  check('提取页面：放大时能翻页', ((await page.locator('.viewer-page').textContent()) || '').includes('21 / 23'), await page.locator('.viewer-page').textContent());
  await page.screenshot({path: 'screens/pdf-extract-viewer.png'});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('提取页面：Esc 关闭放大查看', (await page.locator('.viewer').count()) === 0);

  // 跳页 + 缩略图大小
  await page.locator('.thumb-jump').fill('23');
  await page.locator('.thumb-toolbar .btn-soft', {hasText: '跳转'}).click();
  await page.waitForTimeout(300);
  const exRange3 = (await page.locator('.thumb-range').first().textContent()) || '';
  check('提取页面：按页码跳到第 23 页所在组', exRange3.includes('21-23'), exRange3);
  const exSmall = await page.evaluate(() => document.querySelector('.page-thumb[data-page="21"] canvas')?.width || 0);
  await page.locator('.thumb-toolbar .chip', {hasText: '大'}).click();
  await page.waitForSelector('.page-thumb[data-page="21"] canvas', {timeout: 15000});
  await page.waitForTimeout(700);
  const exLarge = await page.evaluate(() => document.querySelector('.page-thumb[data-page="21"] canvas')?.width || 0);
  check('提取页面：缩略图大小可调', exLarge > exSmall, exSmall + ' -> ' + exLarge);

  // 整组选择 / 清空
  await page.locator('.thumb-toolbar .btn-soft', {hasText: '选中本组'}).click();
  await page.waitForTimeout(400);
  check(
    '提取页面：选中本组 → 3 + 1 页',
    (await page.locator('.sel-chip').count()) === 4 && ((await page.locator('.sel-chip').first().textContent()) || '').startsWith('3'),
    JSON.stringify(await page.locator('.sel-chip').allTextContents()),
  );
  await page.locator('.thumb-toolbar .btn-soft', {hasText: '取消本组'}).click();
  await page.waitForTimeout(400);
  check('提取页面：取消本组 → 只剩第 3 页', (await page.locator('.sel-chip').count()) === 1, JSON.stringify(await page.locator('.sel-chip').allTextContents()));
  await page.locator('.thumb-toolbar .btn-soft', {hasText: '清空选择'}).click();
  await page.waitForTimeout(400);
  check(
    '提取页面：清空选择',
    (await page.locator('.sel-chip').count()) === 0 &&
      (await page.locator('.merge-empty').count()) === 1 &&
      (await page.locator('.modal-foot .btn-primary').isDisabled()),
  );
  await page.screenshot({path: 'screens/pdf-extract.png'});

  // 提取两个页 → 保存框 → 完成
  await page.locator('.page-thumb[data-page="21"] .page-thumb-canvas').click();
  await page.locator('.page-thumb[data-page="23"] .page-thumb-canvas').click();
  await page.waitForTimeout(200);
  check('提取页面：已选页码 [21, 23]', JSON.stringify(await page.locator('.sel-chip').allTextContents()) === JSON.stringify(['21 ✕', '23 ✕']), JSON.stringify(await page.locator('.sel-chip').allTextContents()));
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForTimeout(1000);
  const exDone = (await page.locator('.tool-note.ok').textContent().catch(() => '')) || '';
  check(
    '提取页面：完成统计',
    exDone.includes('提取完成') && exDone.includes('从 23 页中提取 2 页') && exDone.includes('3.0 MB') && exDone.includes('已加入书架'),
    exDone,
  );
  const exOpts = await page.evaluate(() => ({opts: window.__lastExtract, title: window.__lastOutTitle, name: window.__lastOutName}));
  check(
    '提取页面：参数（页码升序 / 输出名 / 入库 / 保存框标题）',
    exOpts.opts &&
      JSON.stringify(exOpts.opts.pages) === JSON.stringify([21, 23]) &&
      /huozhe-提取\.pdf$/.test(exOpts.opts.out_path) &&
      exOpts.opts.add_to_shelf === true &&
      exOpts.title === '保存提取出的 PDF' &&
      exOpts.name === 'huozhe-提取.pdf',
    JSON.stringify(exOpts),
  );
  await page.screenshot({path: 'screens/pdf-extract-done.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 工具页 → 转存图片：默认所有页面 → 每页一张 PNG → 覆盖同名文件提示
  await page.evaluate(() => {
    window.__savedImages = [];
    window.__pickTarget = 'E:\\Books\\huozhe.pdf';
  });
  await page.locator('.tool-card', {hasText: '转存图片'}).first().click();
  await page.waitForTimeout(400);
  check('转存图片弹窗', (await page.locator('.modal .modal-head h2', {hasText: '转存图片'}).count()) > 0);
  check(
    '转存图片：未选文件占位 + 不能导出',
    ((await page.locator('.path-box').first().textContent()) || '').includes('还没有选择') &&
      (await page.locator('.modal-foot .btn-primary').isDisabled()),
  );
  await page.locator('.modal .btn-soft', {hasText: '选择 PDF 文件'}).click();
  await page.waitForSelector('.img-summary', {timeout: 15000}).catch(() => {});
  await page.waitForTimeout(300);
  const imSrc = (await page.locator('.path-box').first().textContent()) || '';
  check('转存图片：识别页数/大小', imSrc.includes('huozhe.pdf') && imSrc.includes('23') && imSrc.includes('5.0 MB'), imSrc);
  const imSummary = async () => (((await page.locator('.form-row .img-summary').first().textContent()) || '') + '').trim();
  const imPreview = async () => (((await page.locator('.img-summary').last().textContent()) || '') + '').trim();
  check(
    '转存图片：默认「所有页面」',
    (((await page.locator('.modal .chip.active').first().textContent()) || '').includes('所有页面')),
    await page.locator('.modal .chip.active').first().textContent(),
  );
  check(
    '转存图片：所有页面 → 23 页',
    (await imSummary()).includes('将导出 23 页') && (await imSummary()).includes('1-23') && (await imSummary()).includes('共 23 页'),
    await imSummary(),
  );
  const imDir = (await page.locator('.path-box').nth(1).textContent()) || '';
  check('转存图片：默认输出到源文件旁边的 huozhe-images', imDir.includes('huozhe-images') && imDir.includes('Books'), imDir);
  check('转存图片：文件名预览（补零页码）', (await imPreview()).includes('huozhe-001.png') && (await imPreview()).includes('huozhe-023.png'), await imPreview());
  // 指定页面：写法错误 → 超范围 → 正常
  await page.locator('.modal .chip', {hasText: '指定页面'}).first().click();
  await page.waitForTimeout(200);
  check('转存图片：可切换成指定页面（出现范围输入框）', (await page.locator('.img-range').count()) === 1);
  await page.locator('.img-range').fill('abc');
  await page.waitForTimeout(200);
  check(
    '转存图片：范围写法错误会提示 + 不能导出',
    (((await page.locator('.merge-err').first().textContent()) || '').includes('页码写法不对')) &&
      (await page.locator('.modal-foot .btn-primary').isDisabled()),
    await page.locator('.merge-err').first().textContent(),
  );
  await page.locator('.img-range').fill('1-3,99');
  await page.waitForTimeout(200);
  const imOutErr = ((await page.locator('.merge-err').first().textContent()) || '') + '';
  check('转存图片：页码超范围会提示', imOutErr.includes('超出范围') && imOutErr.includes('共 23 页'), imOutErr);
  await page.locator('.img-range').fill('1-3,5');
  await page.waitForTimeout(200);
  check('转存图片：解析 1-3,5 → 4 页', (await imSummary()).includes('将导出 4 页') && (await imSummary()).includes('1-3, 5'), await imSummary());
  check('转存图片：页码变了文件名预览也跟着变', (await imPreview()).includes('huozhe-005.png'), await imPreview());
  // 回到所有页面，导出 23 张 PNG
  await page.locator('.modal .chip', {hasText: '所有页面'}).first().click();
  await page.waitForTimeout(200);
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForSelector('.tool-note.ok', {timeout: 120000});
  await page.waitForTimeout(300);
  const imDone = ((await page.locator('.tool-note.ok').textContent()) || '') + '';
  check(
    '转存图片：导出完成统计（23 张 + 覆盖 1 张同名）',
    imDone.includes('导出完成') && imDone.includes('23 张图片') && imDone.includes('覆盖了 1 张同名图片') && imDone.includes('huozhe-images'),
    imDone,
  );
  check(
    '转存图片：完成后按钮变成「打开所在目录」',
    (((await page.locator('.modal-foot .btn-primary').textContent()) || '').includes('打开所在目录')),
    await page.locator('.modal-foot .btn-primary').textContent(),
  );
  const imSaved = await page.evaluate(() => window.__savedImages || []);
  check(
    '转存图片：23 页各落盘一次且页码齐全',
    imSaved.length === 23 && imSaved[0].page === 1 && imSaved[22].page === 23 && imSaved.every((r) => r.png),
    'len=' + imSaved.length + ' ' + JSON.stringify(imSaved.slice(0, 2).map((r) => r.page)),
  );
  check(
    '转存图片：默认 150 DPI → 416×416 像素',
    imSaved.every((r) => r.w === 416 && r.h === 416),
    JSON.stringify(imSaved.slice(0, 2).map((r) => r.w + 'x' + r.h)),
  );
  check(
    '转存图片：目录/前缀/格式/总页数参数',
    imSaved.every((r) => r.dir.endsWith('huozhe-images') && r.prefix === 'huozhe' && r.format === 'png' && r.total === 23),
    JSON.stringify({...imSaved[0], b64: undefined}),
  );
  check('转存图片：图片真的有内容（不是空画布）', imSaved.every((r) => r.len > 500), JSON.stringify(imSaved.slice(0, 4).map((r) => r.len)));
  if (imSaved[0] && imSaved[0].b64) {
    fs.mkdirSync('screens', {recursive: true});
    fs.writeFileSync('screens/pdf-image-page1.png', Buffer.from(imSaved[0].b64, 'base64'));
  }
  await page.screenshot({path: 'screens/pdf-image-done.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 书架右键 PDF → PDF 工具 → 转存 EPUB（预填书名/作者）
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('书架')) b.click();
    });
  });
  await page.waitForTimeout(400);
  await page.locator('.book-card').nth(1).click({button: 'right'});
  await page.waitForTimeout(400);
  await page.locator('.ctx-sub').first().hover();
  await page.waitForTimeout(300);
  await page.locator('.ctx-submenu button', {hasText: '转存 EPUB'}).first().click();
  await page.waitForTimeout(700);
  check('书架入口进入转存 EPUB', (await page.locator('.modal .modal-head h2', {hasText: '转存 EPUB'}).count()) > 0);
  const shelfTitle = await page.locator('.modal .form-row input').nth(1).inputValue();
  const shelfAuthor = await page.locator('.modal .form-row input').nth(2).inputValue();
  check('预填书名/作者', shelfTitle === '活着' && shelfAuthor === '余华', shelfTitle + ' / ' + shelfAuthor);
  await page.screenshot({path: 'screens/pdf-epub-shelf.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 书架右键 PDF → PDF 工具 → 合并 PDF（把这本书作为第一个文件）
  await page.locator('.book-card').nth(1).click({button: 'right'});
  await page.waitForTimeout(400);
  await page.locator('.ctx-sub').first().hover();
  await page.waitForTimeout(300);
  await page.locator('.ctx-submenu button', {hasText: '合并 PDF'}).first().click();
  await page.waitForTimeout(700);
  check('书架入口进入合并 PDF', (await page.locator('.modal .modal-head h2', {hasText: '合并 PDF'}).count()) > 0);
  const shelfMergeNames = await page.locator('.merge-name').allTextContents();
  check('书架入口已带入这本书', JSON.stringify(shelfMergeNames) === JSON.stringify(['huozhe.pdf']), JSON.stringify(shelfMergeNames));
  check(
    '合并 PDF 书架入口提示',
    (await page.locator('.modal .hint').allTextContents()).some((h) => h.includes('活着')),
    JSON.stringify(await page.locator('.modal .hint').allTextContents()),
  );
  await page.screenshot({path: 'screens/pdf-merge-shelf.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 书架右键 PDF → PDF 工具 → 提取页面（把这本书带进来，直接出缩略图）
  await page.locator('.book-card').nth(1).click({button: 'right'});
  await page.waitForTimeout(400);
  await page.locator('.ctx-sub').first().hover();
  await page.waitForTimeout(300);
  await page.locator('.ctx-submenu button', {hasText: '提取页面'}).first().click();
  await page.waitForSelector('.page-thumb[data-page="20"]', {timeout: 15000}).catch(() => {});
  check('书架入口进入提取页面', (await page.locator('.modal .modal-head h2', {hasText: '提取页面'}).count()) > 0);
  const exShelfSrc = (await page.locator('.path-box').first().textContent()) || '';
  check('书架入口已带入这本书', exShelfSrc.includes('huozhe.pdf') && exShelfSrc.includes('23'), exShelfSrc);
  check(
    '提取页面书架入口提示',
    (await page.locator('.modal .hint').allTextContents()).some((h) => h.includes('活着')),
    JSON.stringify(await page.locator('.modal .hint').allTextContents()),
  );
  check('书架入口进来就有缩略图', (await page.locator('.page-thumb').count()) === 20, await page.locator('.page-thumb').count());
  const exLayout = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    if (!modal) return null;
    const r = modal.getBoundingClientRect();
    const grid = document.querySelector('.thumb-grid');
    return {
      right: Math.round(r.right),
      inner: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      gridOverflow: grid ? grid.scrollWidth > grid.clientWidth + 1 : false,
    };
  });
  check(
    '提取页面弹窗不溢出、缩略图网格不横溢',
    !!exLayout && exLayout.right <= exLayout.inner && !exLayout.pageOverflow && !exLayout.gridOverflow,
    JSON.stringify(exLayout),
  );
  await page.screenshot({path: 'screens/pdf-extract-shelf.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 书架右键 PDF → PDF 工具 → 转存图片（带入文件 → JPEG + 300DPI + 自定义目录/前缀）
  await page.evaluate(() => {
    window.__outDir = 'E:\\Books\\img-out';
  });
  const openImageFromShelf = async () => {
    await page.locator('.book-card').nth(1).click({button: 'right'});
    await page.waitForTimeout(400);
    await page.locator('.ctx-sub').first().hover();
    await page.waitForTimeout(300);
    await page.locator('.ctx-submenu button', {hasText: '转存图片'}).first().click();
    await page.waitForSelector('.img-summary', {timeout: 15000}).catch(() => {});
    await page.waitForTimeout(400);
  };
  await openImageFromShelf();
  check('书架入口进入转存图片', (await page.locator('.modal .modal-head h2', {hasText: '转存图片'}).count()) > 0);
  const imShelfSrc = (await page.locator('.path-box').first().textContent()) || '';
  check('转存图片：书架入口已带入这本书', imShelfSrc.includes('huozhe.pdf') && imShelfSrc.includes('23'), imShelfSrc);
  check(
    '转存图片：书架入口提示',
    (await page.locator('.modal .hint').allTextContents()).some((h) => h.includes('活着')),
    JSON.stringify(await page.locator('.modal .hint').allTextContents()),
  );
  check('转存图片：进来就能导出（不用再选文件）', !(await page.locator('.modal-foot .btn-primary').isDisabled()));
  // JPEG + 300 DPI + 质量 60 + 指定页面 1-2,5 + 自定义目录/前缀
  await page.evaluate(() => {
    window.__savedImages = [];
  });
  await page.locator('.modal .chip', {hasText: '指定页面'}).first().click();
  await page.locator('.img-range').fill('1-2,5');
  await page.locator('.modal .chip', {hasText: 'JPEG'}).first().click();
  await page.waitForTimeout(150);
  check('转存图片：选 JPEG 才出现质量滑块', (await page.locator('.img-quality input[type="range"]').count()) === 1);
  await page.locator('.img-quality input[type="range"]').fill('60');
  await page.waitForTimeout(150);
  check('转存图片：质量滑块显示 60', (((await page.locator('.img-quality-val').textContent()) || '').trim()) === '60', await page.locator('.img-quality-val').textContent());
  await page.locator('.modal .chip', {hasText: '300 DPI'}).first().click();
  await page.locator('.modal .btn-soft', {hasText: '选择目录'}).click();
  await page.waitForTimeout(300);
  await page.locator('.modal input[placeholder="huozhe"]').fill('三体');
  await page.waitForTimeout(200);
  check('转存图片：自定义输出目录生效', (((await page.locator('.path-box').nth(1).textContent()) || '').includes('img-out')), await page.locator('.path-box').nth(1).textContent());
  check('转存图片：文件名预览用自定义前缀', (await imPreview()).includes('三体-001.jpg') && (await imPreview()).includes('将导出 3 张'), await imPreview());
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForSelector('.tool-note.ok', {timeout: 120000});
  await page.waitForTimeout(300);
  const im2 = await page.evaluate(() => window.__savedImages || []);
  check(
    '转存图片：JPEG 300DPI 导出 3 页（页码来自范围）',
    im2.length === 3 && JSON.stringify(im2.map((r) => r.page)) === '[1,2,5]' && im2.every((r) => r.jpg && r.format === 'jpg'),
    JSON.stringify(im2.map((r) => ({p: r.page, jpg: r.jpg}))),
  );
  check(
    '转存图片：300 DPI → 833×833 像素',
    im2.every((r) => r.w === 833 && r.h === 833),
    JSON.stringify(im2.map((r) => r.w + 'x' + r.h)),
  );
  check(
    '转存图片：自定义目录/前缀传到后端',
    im2.every((r) => r.dir.endsWith('img-out') && r.prefix === '三体' && r.total === 23),
    JSON.stringify({...im2[0], b64: undefined}),
  );
  const q60len = im2[0] ? im2[0].len : 0;
  if (im2[0] && im2[0].b64) {
    fs.mkdirSync('screens', {recursive: true});
    fs.writeFileSync('screens/pdf-image-page1.jpg', Buffer.from(im2[0].b64, 'base64'));
  }
  await page.screenshot({path: 'screens/pdf-image-jpg.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 同一页换成质量 95 再导一次：文件要更大，说明质量参数真的生效
  await openImageFromShelf();
  await page.evaluate(() => {
    window.__savedImages = [];
  });
  await page.locator('.modal .chip', {hasText: '指定页面'}).first().click();
  await page.locator('.img-range').fill('1');
  await page.locator('.modal .chip', {hasText: 'JPEG'}).first().click();
  await page.waitForTimeout(150);
  await page.locator('.img-quality input[type="range"]').fill('95');
  await page.locator('.modal .chip', {hasText: '300 DPI'}).first().click();
  await page.waitForTimeout(150);
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForSelector('.tool-note.ok', {timeout: 120000});
  const q95 = await page.evaluate(() => window.__savedImages || []);
  const q95len = q95[0] ? q95[0].len : 0;
  check('转存图片：JPEG 质量参数生效（95 比 60 大）', q95len > q60len && q60len > 0, 'q60=' + q60len + ' q95=' + q95len);
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 中途停止：已导出的部分保留
  await openImageFromShelf();
  await page.evaluate(() => {
    window.__savedImages = [];
  });
  await page.locator('.modal .chip', {hasText: '300 DPI'}).first().click();
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForSelector('.progress-track', {timeout: 15000}).catch(() => {});
  await page.waitForTimeout(600);
  check('转存图片：导出中有进度条 + 可以停止', (await page.locator('.progress-track').count()) === 1);
  await page.locator('.modal-foot .btn-soft', {hasText: '停止'}).click();
  await page.waitForSelector('.tool-note.ok', {timeout: 60000});
  await page.waitForTimeout(300);
  const stopped = await page.evaluate(() => window.__savedImages || []);
  const stopNote = ((await page.locator('.tool-note.ok').textContent()) || '') + '';
  check(
    '转存图片：中途停止（已导出部分保留）',
    stopNote.includes('已停止导出') && stopped.length > 0 && stopped.length < 23,
    'saved=' + stopped.length + ' note=' + stopNote.replace(/\s+/g, ' '),
  );
  await page.screenshot({path: 'screens/pdf-image-stopped.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__outDir = undefined;
  });

  // ---- 修改文档：工具页入口 → 读信息 → 改字段 → 覆盖原文件 ----------------
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('工具')) b.click();
    });
  });
  await page.waitForTimeout(500);
  await page.locator('.tool-card', {hasText: '修改文档'}).first().click();
  await page.waitForTimeout(400);
  check('修改文档弹窗', (await page.locator('.modal .modal-head h2', {hasText: '修改文档'}).count()) > 0);
  const metaNoFile = (await page.locator('.path-box').first().textContent()) || '';
  check(
    '修改文档：未选文件占位 + 不能保存',
    metaNoFile.includes('还没有选择 PDF 文件') && (await page.locator('.modal-foot .btn-primary').isDisabled()),
    metaNoFile,
  );
  const metaField = (k) => page.locator(`.modal .form-row[data-field="${k}"] input`);
  await page.locator('.modal .btn-soft', {hasText: '选择 PDF 文件'}).click();
  await page.waitForTimeout(500);
  const metaSrc = (await page.locator('.path-box').first().textContent()) || '';
  check('修改文档：识别文件/页数/大小', metaSrc.includes('huozhe.pdf') && metaSrc.includes('23') && metaSrc.includes('5.0 MB'), metaSrc);
  const metaPrefill = await page.evaluate(() => {
    const v = (k) => document.querySelector(`.modal .form-row[data-field="${k}"] input`).value;
    return [v('title'), v('author'), v('subject'), v('keywords')];
  });
  check(
    '修改文档：四个字段按原值预填',
    JSON.stringify(metaPrefill) === JSON.stringify(['活着', '余华', '长篇小说', '当代文学, 中国文学']),
    JSON.stringify(metaPrefill),
  );
  check(
    '修改文档：关键词个数提示',
    ((await page.locator('.modal .form-row[data-field="keywords"] .hint').textContent()) || '').includes('共 2 个关键词'),
    await page.locator('.modal .form-row[data-field="keywords"] .hint').textContent(),
  );
  const metaRO = await page.locator('.modal .pdf-info-val').allTextContents();
  check(
    '修改文档：只读信息（页数/版本/创建工具/生成工具/时间）',
    JSON.stringify(metaRO) === JSON.stringify(['23', '1.7', 'Microsoft Word 2019', 'pdfcpu v0.15.0', '2024-01-02 03:04', '2024-03-04 05:06']),
    JSON.stringify(metaRO),
  );
  check(
    '修改文档：没改动时提示「还没有改动」+ 保存按钮禁用',
    ((await page.locator('.modal .meta-summary').textContent()) || '').includes('还没有改动') &&
      (await page.locator('.modal-foot .btn-primary').isDisabled()),
    await page.locator('.modal .meta-summary').textContent(),
  );
  const metaLayout = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    const r = modal.getBoundingClientRect();
    const body = document.querySelector('.modal-body');
    const inputs = [...document.querySelectorAll('.modal .form-row[data-field] input')];
    return {
      right: Math.round(r.right),
      inner: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      bodyOverflow: body.scrollWidth > body.clientWidth + 1,
      inputOverflow: inputs.some((i) => i.getBoundingClientRect().right > r.right),
      rows: inputs.length,
    };
  });
  check(
    '修改文档：弹窗不溢出、四个输入框都在框内',
    metaLayout.right <= metaLayout.inner &&
      !metaLayout.pageOverflow &&
      !metaLayout.bodyOverflow &&
      !metaLayout.inputOverflow &&
      metaLayout.rows === 4,
    JSON.stringify(metaLayout),
  );
  check('修改文档：默认「另存为新文件」', (((await page.locator('.modal .chip-row .chip.active').textContent()) || '').includes('另存为新文件')));
  const metaOutName = (await page.locator('.path-box').nth(1).textContent()) || '';
  check('修改文档：默认另存文件名 = 原名-文档信息.pdf', metaOutName.includes('huozhe-文档信息.pdf'), metaOutName);
  await page.locator('.modal .form-row[data-field="title"] input').fill('活着（修订版）');
  await page.waitForTimeout(200);
  const metaSummary1 = (await page.locator('.modal .meta-summary').textContent()) || '';
  check(
    '修改文档：改标题 → 行内「已修改」+ 汇总已修改 1 项',
    ((await page.locator('.modal .form-row[data-field="title"] .pdf-badge').textContent()) || '').includes('已修改') &&
      metaSummary1.includes('已修改 1 项') &&
      metaSummary1.includes('标题') &&
      !(await page.locator('.modal-foot .btn-primary').isDisabled()),
    metaSummary1,
  );
  await page.screenshot({path: 'screens/pdf-meta-edited.png'});
  await page.locator('.modal .meta-revert').click();
  await page.waitForTimeout(200);
  check(
    '修改文档：还原改动 → 回到原值 + 保存按钮又禁用',
    (await metaField('title').inputValue()) === '活着' &&
      ((await page.locator('.modal .meta-summary').textContent()) || '').includes('还没有改动') &&
      (await page.locator('.modal-foot .btn-primary').isDisabled()),
    await metaField('title').inputValue(),
  );
  // 改标题 + 关键词（重复项要去掉）后覆盖原文件
  await metaField('title').fill('活着（修订版）');
  await metaField('keywords').fill('当代文学, 中国文学, 长篇小说, 当代文学');
  await page.waitForTimeout(200);
  const metaSummary2 = (await page.locator('.modal .meta-summary').textContent()) || '';
  check(
    '修改文档：改两个字段 → 汇总已修改 2 项 + 关键词去重为 3 个',
    metaSummary2.includes('已修改 2 项') &&
      ((await page.locator('.modal .form-row[data-field="keywords"] .hint').textContent()) || '').includes('共 3 个关键词'),
    metaSummary2 + ' / ' + (await page.locator('.modal .form-row[data-field="keywords"] .hint').textContent()),
  );
  await page.locator('.modal .chip-row .chip', {hasText: '覆盖原文件'}).first().click();
  await page.waitForTimeout(200);
  check(
    '修改文档：选「覆盖原文件」→ 出现备份警告 + 另存行消失',
    ((await page.locator('.modal .merge-warn').textContent()) || '').includes('先备份') && (await page.locator('.path-box').count()) === 1,
    await page.locator('.modal .merge-warn').textContent(),
  );
  await page.screenshot({path: 'screens/pdf-meta-inplace.png'});
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForSelector('.tool-note.ok', {timeout: 30000});
  await page.waitForTimeout(300);
  const metaSaved = await page.evaluate(() => window.__lastMeta);
  check(
    '修改文档：覆盖原文件把 out_path 设成源文件、不入库',
    metaSaved.out_path === 'E:\\Books\\huozhe.pdf' &&
      metaSaved.path === 'E:\\Books\\huozhe.pdf' &&
      metaSaved.add_to_shelf === false &&
      metaSaved.password === '' &&
      JSON.stringify(metaSaved.keywords) === JSON.stringify(['当代文学', '中国文学', '长篇小说']),
    JSON.stringify(metaSaved),
  );
  const metaDone1 = (await page.locator('.tool-note.ok').textContent()) || '';
  check(
    '修改文档：覆盖成功统计（2 项 + 大小）',
    metaDone1.includes('已覆盖原文件') && metaDone1.includes('改动 2 项') && metaDone1.includes('标题') && metaDone1.includes('关键词') && metaDone1.includes('5.0 MB'),
    metaDone1.replace(/\s+/g, ' '),
  );
  check('修改文档：保存后按钮变「打开所在目录」', (await page.locator('.modal-foot .btn-primary').textContent()) === '打开所在目录');
  await page.screenshot({path: 'screens/pdf-meta-done.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // ---- 修改文档：另存为新文件 + 加入书架 ----------------
  await page.locator('.tool-card', {hasText: '修改文档'}).first().click();
  await page.waitForTimeout(400);
  await page.locator('.modal .btn-soft', {hasText: '选择 PDF 文件'}).click();
  await page.waitForTimeout(500);
  await metaField('author').fill('余华 著');
  await page.waitForTimeout(200);
  check(
    '修改文档：只改作者 → 只算 1 项改动',
    (((await page.locator('.modal .meta-summary').textContent()) || '').includes('已修改 1 项：作者')),
    await page.locator('.modal .meta-summary').textContent(),
  );
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForSelector('.tool-note.ok', {timeout: 30000});
  await page.waitForTimeout(300);
  const meta2 = await page.evaluate(() => ({o: window.__lastMeta, name: window.__lastOutName, title: window.__lastOutTitle}));
  check(
    '修改文档：另存为走 PickOutPdfFile（默认名 + 对话框标题）',
    meta2.name === 'huozhe-文档信息.pdf' && meta2.title === '保存文档信息',
    JSON.stringify(meta2),
  );
  check(
    '修改文档：另存路径 + 加入书架',
    meta2.o.out_path === 'E:\\Books\\huozhe-文档信息.pdf' &&
      meta2.o.out_path !== meta2.o.path &&
      meta2.o.add_to_shelf === true &&
      meta2.o.title === '活着' &&
      meta2.o.author === '余华 著',
    JSON.stringify(meta2.o),
  );
  const metaDone2 = (await page.locator('.tool-note.ok').textContent()) || '';
  check(
    '修改文档：另存成功提示 + 已加入书架',
    metaDone2.includes('已另存为新文件') && metaDone2.includes('huozhe-文档信息.pdf') && metaDone2.includes('已加入书架'),
    metaDone2.replace(/\s+/g, ' '),
  );
  await page.screenshot({path: 'screens/pdf-meta-newsave.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // ---- 修改文档：加密文件的密码流程 + 只能另存 ----------------
  await page.locator('.tool-card', {hasText: '修改文档'}).first().click();
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__pickTarget = 'E:\\Books\\locked.pdf';
  });
  await page.locator('.modal .btn-soft', {hasText: '选择 PDF 文件'}).click();
  await page.waitForTimeout(500);
  const metaLocked = (await page.locator('.path-box').first().textContent()) || '';
  check('修改文档：加密文件要密码', metaLocked.includes('locked.pdf') && !metaLocked.includes('23 页'), metaLocked);
  check(
    '修改文档：没密码时隐藏表单 + 提示需要密码',
    (await page.locator('.modal .form-row[data-field="title"]').count()) === 0 &&
      ((await page.locator('.modal .merge-warn').textContent()) || '').includes('先输入密码'),
    await page.locator('.modal .merge-warn').textContent(),
  );
  await page.locator('.modal input[type="password"]').fill('wrong');
  await page.locator('.modal .btn-soft', {hasText: '验证'}).click();
  await page.waitForTimeout(400);
  const metaPwErr = await page.locator('.modal .merge-err').nth(1).textContent().catch(() => '');
  check(
    '修改文档：密码错误时提示（仍是加密提示，表单不出现）',
    metaPwErr.includes('需要先输入打开密码') && (await page.locator('.modal .form-row[data-field="title"]').count()) === 0,
    metaPwErr,
  );
  await page.locator('.modal input[type="password"]').fill('secret');
  await page.locator('.modal .btn-soft', {hasText: '验证'}).click();
  await page.waitForTimeout(500);
  check(
    '修改文档：密码正确后读出信息',
    (await metaField('title').inputValue()) === '活着' && ((await page.locator('.path-box').first().textContent()) || '').includes('23 页'),
    await metaField('title').inputValue(),
  );
  check(
    '修改文档：加密文件不让选「覆盖原文件」+ 单独提示',
    (await page.locator('.modal .chip-row .chip', {hasText: '覆盖原文件'}).count()) === 0 &&
      ((await page.locator('.modal .merge-warn').textContent()) || '').includes('只能另存为新文件'),
    await page.locator('.modal .merge-warn').textContent(),
  );
  await page.screenshot({path: 'screens/pdf-meta-locked.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__pickTarget = undefined;
  });

  // 书架右键 PDF → PDF 工具 → 修改文档（带入文件 → 预填表单）
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('书架')) b.click();
    });
  });
  await page.waitForTimeout(400);
  await page.locator('.book-card').nth(1).click({button: 'right'});
  await page.waitForTimeout(400);
  await page.locator('.ctx-sub').first().hover();
  await page.waitForTimeout(300);
  await page.locator('.ctx-submenu button', {hasText: '修改文档'}).first().click();
  await page.waitForTimeout(600);
  check('书架入口进入修改文档', (await page.locator('.modal .modal-head h2', {hasText: '修改文档'}).count()) > 0);
  check(
    '修改文档：书架入口已带入这本书并按原值预填',
    ((await page.locator('.path-box').first().textContent()) || '').includes('huozhe.pdf') && (await metaField('title').inputValue()) === '活着',
    await page.locator('.path-box').first().textContent(),
  );
  check(
    '修改文档：书架入口提示',
    (await page.locator('.modal .hint').allTextContents()).some((h) => h.includes('活着')),
    JSON.stringify(await page.locator('.modal .hint').allTextContents()),
  );
  await page.screenshot({path: 'screens/pdf-meta-shelf.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 工具页 → PDF → 压缩文档（没装 Ghostscript：自动退回 pdfcpu 无损）
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('工具')) b.click();
    });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__gs = undefined; window.__pickTarget = 'E:\\Books\\huozhe.pdf'; });
  await page.locator('.tool-card', {hasText: '压缩文档'}).first().click();
  await page.waitForTimeout(500);
  check('压缩文档弹窗打开', (await page.locator('.modal .modal-head h2', {hasText: '压缩文档'}).count()) > 0);
  check('压缩文档：未选文件时不显示档位', (await page.locator('.modal .form-row[data-field="preset"]').count()) === 0);
  await page.locator('.modal .btn-soft', {hasText: '选择 PDF 文件'}).click();
  await page.waitForTimeout(500);
  const czSrc = (await page.locator('.modal .path-box').first().textContent()) || '';
  check('压缩文档：读出源文件信息', czSrc.includes('huozhe.pdf') && czSrc.includes('23'), czSrc);
  check(
    '压缩文档：没装 Ghostscript 时提示会用 pdfcpu',
    (await page.locator('.modal .form-row[data-field="gs"]').getAttribute('data-gs-found')) === '0' &&
      ((await page.locator('.pdf-compress-gs-note').textContent()) || '').includes('pdfcpu'),
    await page.locator('.pdf-compress-gs-note').textContent(),
  );
  const czChips = await page.locator('.modal .form-row[data-field="preset"] .chip').allTextContents();
  check(
    '压缩档位 = 4 档，默认电子书 150dpi',
    czChips.length === 4 &&
      czChips[0].includes('72') &&
      czChips[1].includes('150') &&
      czChips[2].includes('300') &&
      czChips[3].includes('印前') &&
      (await page.locator('.modal .form-row[data-field="preset"] .chip.active').textContent()) === czChips[1],
    JSON.stringify(czChips),
  );
  check(
    '压缩文档：pdfcpu 模式下图像参数置灰',
    (await page.locator('.modal .form-row[data-field="dpi"] input[type="number"]').isDisabled()) &&
      ((await page.locator('.modal .form-row[data-field="dpi"] .hint').textContent()) || '').includes('pdfcpu'),
    await page.locator('.modal .form-row[data-field="dpi"] .hint').textContent(),
  );
  const czLayout = await page.evaluate(() => {
    const modal = document.querySelector('.modal');
    const r = modal.getBoundingClientRect();
    const body = document.querySelector('.modal-body');
    return {
      right: Math.round(r.right),
      inner: window.innerWidth,
      pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
      bodyOverflow: body.scrollWidth > body.clientWidth + 1,
    };
  });
  check(
    '压缩文档：弹窗不溢出',
    czLayout.right <= czLayout.inner && !czLayout.pageOverflow && !czLayout.bodyOverflow,
    JSON.stringify(czLayout),
  );
  await page.screenshot({path: 'screens/pdf-compress.png'});
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForTimeout(1400);
  const czDone = (await page.locator('[data-testid="compress-done"]').textContent()) || '';
  check(
    '压缩完成：显示节省比例 / 体积 / 引擎',
    czDone.includes('+65%') && czDone.includes('5.0 MB') && czDone.includes('pdfcpu') && czDone.includes('150dpi'),
    czDone,
  );
  const czReq = await page.evaluate(() => window.__lastCompress);
  check(
    '压缩请求参数正确（preset/dpi/engine/入库）',
    czReq.preset === 'ebook' &&
      czReq.dpi === 0 &&
      czReq.grayscale === false &&
      czReq.engine === 'auto' &&
      czReq.add_to_shelf === true &&
      czReq.out_path.endsWith('-压缩.pdf'),
    JSON.stringify(czReq),
  );
  await page.screenshot({path: 'screens/pdf-compress-done.png'});

  // 手动指定 Ghostscript → 档位 + 自定义 dpi + 灰度 + 强制 gs 引擎
  await page.locator('.modal .form-row[data-field="preset"] .chip', {hasText: '打印'}).click();
  await page.waitForTimeout(200);
  await page.locator('.modal .btn-soft', {hasText: '指定 gswin64c.exe'}).click();
  await page.waitForTimeout(500);
  check(
    '指定 Ghostscript 后状态翻转',
    (await page.locator('.modal .form-row[data-field="gs"]').getAttribute('data-gs-found')) === '1' &&
      ((await page.locator('.pdf-compress-gs-ver').textContent()) || '').includes('10.05.1') &&
      ((await page.locator('.pdf-compress-gs-path').textContent()) || '').includes('gswin64c.exe'),
    await page.locator('.pdf-compress-gs').first().textContent(),
  );
  check(
    '检出 Ghostscript 后图像参数可用',
    !(await page.locator('.modal .form-row[data-field="dpi"] input[type="number"]').isDisabled()),
  );
  await page.locator('.modal .form-row[data-field="dpi"] input[type="number"]').fill('200');
  await page.locator('.modal .form-row[data-field="dpi"] input[type="checkbox"]').check();
  await page.locator('.modal .form-row[data-field="engine"] .chip', {hasText: 'Ghostscript'}).click();
  await page.waitForTimeout(200);
  await page.locator('.modal-foot .btn-primary').click();
  await page.waitForTimeout(1400);
  const czDone2 = (await page.locator('[data-testid="compress-done"]').textContent()) || '';
  check('压缩完成：用 Ghostscript 200dpi', czDone2.includes('Ghostscript') && czDone2.includes('200dpi'), czDone2);
  const czReq2 = await page.evaluate(() => window.__lastCompress);
  check(
    '压缩请求：preset=printer / dpi=200 / 灰度 / 强制 gs',
    czReq2.preset === 'printer' && czReq2.dpi === 200 && czReq2.grayscale === true && czReq2.engine === 'ghostscript',
    JSON.stringify(czReq2),
  );
  await page.screenshot({path: 'screens/pdf-compress-gs.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 压缩文档：加密文件要先输密码
  await page.evaluate(() => { window.__pickTarget = 'E:\\Books\\locked.pdf'; });
  await page.locator('.tool-card', {hasText: '压缩文档'}).first().click();
  await page.waitForTimeout(400);
  await page.locator('.modal .btn-soft', {hasText: '选择 PDF 文件'}).click();
  await page.waitForTimeout(500);
  check(
    '压缩文档：加密文件要求密码',
    (await page.locator('.modal .form-row[data-field="preset"]').count()) === 0 &&
      ((await page.locator('.modal .merge-warn').textContent()) || '').includes('打开密码'),
    await page.locator('.modal .merge-warn').textContent(),
  );
  await page.locator('.modal .merge-pw input').fill('secret');
  await page.locator('.modal .merge-pw .btn').click();
  await page.waitForTimeout(500);
  check(
    '压缩文档：密码正确后可以压（只能另存）',
    (await page.locator('.modal .form-row[data-field="preset"]').count()) === 1 &&
      (await page.locator('.modal .chip-row .chip', {hasText: '覆盖原文件'}).count()) === 0 &&
      ((await page.locator('.modal .merge-warn').textContent()) || '').includes('不再需要密码'),
    await page.locator('.modal .merge-warn').textContent(),
  );
  await page.screenshot({path: 'screens/pdf-compress-locked.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__pickTarget = undefined; });
  // 回到书架，后面的右键子菜单测试要在书架页
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('书架')) b.click();
    });
  });
  await page.waitForTimeout(400);

  // 书架右键 EPUB → EPUB 工具 → 转存 PDF（只给 epub 类工具，不应出现 PDF 工具）
  await page.locator('.book-card').nth(0).click({button: 'right'});
  await page.waitForTimeout(400);
  check('EPUB 书籍右键有 EPUB 工具子菜单', (await page.locator('.ctx-sub', {hasText: 'EPUB 工具'}).count()) === 1);
  check('EPUB 书籍右键无 PDF 工具子菜单', (await page.locator('.ctx-sub', {hasText: 'PDF 工具'}).count()) === 0);
  await page.locator('.ctx-sub', {hasText: 'EPUB 工具'}).first().hover();
  await page.waitForTimeout(300);
  await page.locator('.ctx-submenu button', {hasText: '转存 PDF'}).first().click();
  await page.waitForTimeout(700);
  check('书架入口进入转存 PDF', (await page.locator('.modal .modal-head h2', {hasText: '转存 PDF'}).count()) > 0);
  const epubShelfTitle = await page.locator('.modal .form-row input').nth(1).inputValue();
  const epubShelfAuthor = await page.locator('.modal .form-row input').nth(2).inputValue();
  check('书架入口预填书名/作者', epubShelfTitle === '三体' && epubShelfAuthor === '刘慈欣', epubShelfTitle + ' / ' + epubShelfAuthor);
  await page.screenshot({path: 'screens/epub-pdf-shelf.png'});
  await page.locator('.modal-close').click();
  await page.waitForTimeout(300);

  // 回到书架，继续阅读器测试
  await page.evaluate(() => {
    document.querySelectorAll('.nav-item').forEach((b) => {
      if (b.textContent.includes('书架')) b.click();
    });
  });
  await page.waitForTimeout(400);

  // ---- 书架滚动位置：打开书籍 → 关闭后回到原来停留的位置 ----
  await page.evaluate(() => { window.__manyBooks = true; });
  const navTo = async (label) => {
    await page.evaluate((l) => {
      document.querySelectorAll('.nav-item').forEach((b) => {
        if (b.textContent.includes(l)) b.click();
      });
    }, label);
    await page.waitForTimeout(500);
  };
  const shelfTop = () => page.evaluate(() => {
    const el = document.querySelector('.shelf');
    return el ? el.scrollTop : -1;
  });
  await clickChip('EPUB'); // 触发一次重新查询，拿到 40 本书
  await clickChip('EPUB'); // 取消筛选（查询变化会把位置重置到顶部）
  check('滚动测试：书架有 40 本书', (await page.locator('.book-card').count()) === 40, await page.locator('.book-card').count());
  const scrollInfo = await page.evaluate(async () => {
    const el = document.querySelector('.shelf');
    el.scrollTop = 600;
    await new Promise((r) => setTimeout(r, 400));
    return {top: el.scrollTop, max: el.scrollHeight - el.clientHeight};
  });
  check('滚动测试：书架可以滚动', scrollInfo.top > 300, JSON.stringify(scrollInfo));
  await page.screenshot({path: 'screens/shelf-scrolled.png'});

  await page.locator('.book-card').nth(20).click(); // 打开阅读器
  await page.waitForTimeout(1500);
  check('滚动测试：阅读器已打开', (await page.locator('.reader-root').count()) > 0);
  check('滚动测试：阅读时书架已卸载', (await page.locator('.shelf').count()) === 0);
  await page.evaluate(() => { const b = document.querySelector('.reader-toolbar button:last-child'); b?.click(); });
  await page.waitForTimeout(800);
  const afterClose = await shelfTop();
  check(
    '关闭阅读器后回到原来的滚动位置',
    Math.abs(afterClose - scrollInfo.top) <= 2,
    'before=' + scrollInfo.top + ' after=' + afterClose,
  );
  await page.screenshot({path: 'screens/shelf-restored.png'});

  // 切到别的页面再回书架，同样记得位置
  await navTo('统计');
  await navTo('书架');
  check('切页后回到书架也记得位置', Math.abs((await shelfTop()) - scrollInfo.top) <= 2, 'top=' + (await shelfTop()));

  // 搜索/筛选变化后按新结果从头看（位置重置）
  await page.evaluate(() => { document.querySelector('.shelf').scrollTop = 300; });
  await page.waitForTimeout(300);
  await clickChip('PDF');
  check('筛选变化后回到顶部', (await shelfTop()) === 0, 'top=' + (await shelfTop()));
  await clickChip('PDF');

  // 收尾：恢复 2 本书的书架
  await page.evaluate(() => { window.__manyBooks = false; });
  await clickChip('EPUB');
  await clickChip('EPUB');
  await page.waitForTimeout(400);
  check('滚动测试收尾：书架恢复 2 本书', (await page.locator('.book-card').count()) === 2, await page.locator('.book-card').count());

  // PDF 阅读器：加密文件弹密码框 → 错误密码提示 → 正确密码渲染页面
  await page.locator('.book-card').nth(1).click();
  await page.waitForTimeout(1200);
  check('pdf reader open', (await page.locator('.pdf-reader').count()) > 0);
  check('pdf 密码浮层', (await page.locator('.pdf-pw-overlay').count()) > 0);
  await page.locator('.pdf-pw-box input').fill('wrong');
  await page.locator('.pdf-pw-box .btn').click();
  await page.waitForTimeout(900);
  const pwErr = (await page.locator('.pdf-pw-error').textContent().catch(() => '')) || '';
  check('错误密码提示', pwErr.includes('密码不正确'), pwErr);
  await page.screenshot({path: 'screens/reader-pdf-askpassword.png'});
  await page.locator('.pdf-pw-box input').fill('secret');
  await page.locator('.pdf-pw-box .btn').click();
  await page.waitForTimeout(1800);
  const pdfState = await page.evaluate(() => {
    const c = document.querySelector('.pdf-page-wrap canvas');
    return JSON.stringify({
      wraps: document.querySelectorAll('.pdf-page-wrap').length,
      canvasW: c ? c.width : 0,
      overlayStillThere: !!document.querySelector('.pdf-pw-overlay'),
    });
  });
  check('pdf 解密后渲染页面', pdfState.includes('"canvasW":280') && pdfState.includes('"overlayStillThere":false'), pdfState);

  // PDF 也要能开护眼模式：给页面加暖色滤镜
  await page.locator('[data-testid="reader-eyecare"]').click();
  await page.waitForTimeout(350);
  const pdfFilter = await page.evaluate(() => {
    const c = document.querySelector('.pdf-page-wrap canvas');
    return c ? getComputedStyle(c).filter : 'none';
  });
  check('PDF 护眼模式给页面加暖色滤镜', pdfFilter.includes('sepia'), pdfFilter);
  await page.screenshot({path: 'screens/reader-pdf-eyecare.png'});
  await page.locator('[data-testid="reader-eyecare"]').click();
  await page.waitForTimeout(250);
  await page.screenshot({path: 'screens/reader-pdf.png'});

  const errs = [...new Set(errors)];
  console.log('JS ERRORS:', errs.length ? '\n  ' + errs.join('\n  ') : 'none');
  if (errs.length) failures.push(errs.length + ' 个 JS 错误');
  console.log(failures.length ? 'SMOKE FAILED:\n  ' + failures.join('\n  ') : 'SMOKE OK');
  await browser.close();
  server.close();
  process.exit(failures.length ? 1 : 0);
}
main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
