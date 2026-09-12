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
  {id: 1, path: 'E:\\Books\\santi.epub', file_name: 'santi.epub', format: 'epub', title: '三体', author: '刘慈欣', publisher: '重庆出版社', language: 'zh', description: '地球往事三部曲之一。', size: 1048576, hash: 'abc', cover_path: '', has_cover: false, douban_url: 'https://book.douban.com/subject/2567698/', douban_rating: 8.9, douban_rating_count: 517493, douban_authors: '刘慈欣', misrecord: false, current_location: '', current_page: 0, total_pages: 0, read_progress: 0, last_read_at: '', total_read_seconds: 0, note_count: 0, tags: [{id: 1, name: '科幻', color: '#5b7cfa', book_count: 1, created_at: ''}], created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00'},
  {id: 2, path: 'E:\\Books\\huozhe.pdf', file_name: 'huozhe.pdf', format: 'pdf', title: '活着', author: '余华', publisher: '作家出版社', language: 'zh', description: '讲述福贵的一生。', size: 5242880, hash: 'def', cover_path: '', has_cover: false, douban_url: '', douban_rating: 0, douban_rating_count: 0, douban_authors: '', misrecord: false, current_location: '12', current_page: 12, total_pages: 120, read_progress: 10, last_read_at: '2026-02-01 20:00:00', total_read_seconds: 3600, note_count: 2, tags: [], created_at: '2026-01-02 10:00:00', updated_at: '2026-02-01 20:00:00'},
];

const MOCK = `
window.go = { main: { App: {
  GetBooks: async () => ${JSON.stringify(BOOKS)},
  GetBook: async (id) => ${JSON.stringify(BOOKS)}.find(b => b.id === id) || ${JSON.stringify(BOOKS)}[0],
  GetCoverData: async (id) => id === 1 ? 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AV//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AV//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z' : '', GetBookData: async (id) => id === 1 ? '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' : ${JSON.stringify(PDF_ENC_B64)}, GetStats: async () => ({total_books: 2, total_size: 6291456, total_read_seconds: 3600, total_notes: 2, total_tags: 1, total_misrecords: 0, reading_books: 1, finished_books: 0, unread_books: 1, format_counts: {epub: 1, pdf: 1}}),
  GetSettings: async () => ({idle_seconds: '60', formats: 'epub,pdf,mobi,azw3,kepub', douban_auto: '0', theme: 'light'}),
  SetSettings: async () => {}, ListTags: async () => ${JSON.stringify([{id: 1, name: '科幻', color: '#5b7cfa', book_count: 1, created_at: ''}])},
  ListScanDirs: async () => ['E:\\\\Books'], AddScanDir: async () => {}, RemoveScanDir: async () => {}, PickScanDir: async () => '', ScanStart: async () => {}, ScanStatus: async () => false,
  ListNotes: async () => [], CreateNote: async () => 1, UpdateNote: async () => {}, DeleteNote: async () => {},
  DeleteBook: async () => {}, UpdateBookMeta: async () => {}, MarkMisrecord: async () => {}, UnmarkMisrecord: async () => {}, SetBookTags: async () => {}, CreateTag: async () => 1, UpdateTag: async () => {}, DeleteTag: async () => {},
  GetMisrecords: async () => [], RemoveMisrecord: async () => {}, ClearMisrecords: async () => {}, SaveProgress: async () => {}, ReportReading: async () => 3600, ListReadingSessions: async () => [],
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
  check('filter tag chips = 1', (await page.locator('.tag-chips .chip').count()) === 1, await page.locator('.tag-chips .chip').count());
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

  // open tag manager (书架工具栏「标签」按钮)
  await page.evaluate(() => { document.querySelectorAll('.toolbar button').forEach(b => { if (b.textContent.includes('标签')) b.click(); }); });
  await page.waitForTimeout(300);
  check('tag manager open', (await page.locator('text=新建标签').count()) > 0);
  await page.evaluate(() => document.querySelector('.modal-close')?.click());

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
  check('tool cards = 9', (await page.locator('.tool-card').count()) === 9, await page.locator('.tool-card').count());
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
  check('ctx 子菜单 = [设置密码, 清除密码, 转存 EPUB]', subItems.length === 3 && subItems[0].includes('设置密码') && subItems[1].includes('清除密码') && subItems[2].includes('转存 EPUB'), JSON.stringify(subItems));
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
