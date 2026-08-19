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

const BOOKS = [
  {id: 1, path: 'E:\\Books\\santi.epub', file_name: 'santi.epub', format: 'epub', title: '三体', author: '刘慈欣', publisher: '重庆出版社', language: 'zh', description: '地球往事三部曲之一。', size: 1048576, hash: 'abc', cover_path: '', has_cover: false, douban_url: 'https://book.douban.com/subject/2567698/', douban_rating: 8.9, douban_rating_count: 517493, douban_authors: '刘慈欣', misrecord: false, current_location: '', current_page: 0, total_pages: 0, read_progress: 0, last_read_at: '', total_read_seconds: 0, note_count: 0, tags: [{id: 1, name: '科幻', color: '#5b7cfa', book_count: 1, created_at: ''}], created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00'},
  {id: 2, path: 'E:\\Books\\huozhe.pdf', file_name: 'huozhe.pdf', format: 'pdf', title: '活着', author: '余华', publisher: '作家出版社', language: 'zh', description: '讲述福贵的一生。', size: 5242880, hash: 'def', cover_path: '', has_cover: false, douban_url: '', douban_rating: 0, douban_rating_count: 0, douban_authors: '', misrecord: false, current_location: '12', current_page: 12, total_pages: 120, read_progress: 10, last_read_at: '2026-02-01 20:00:00', total_read_seconds: 3600, note_count: 2, tags: [], created_at: '2026-01-02 10:00:00', updated_at: '2026-02-01 20:00:00'},
];

const MOCK = `
window.go = { main: { App: {
  GetBooks: async () => ${JSON.stringify(BOOKS)},
  GetBook: async (id) => ${JSON.stringify(BOOKS)}.find(b => b.id === id) || ${JSON.stringify(BOOKS)}[0],
  GetCoverData: async (id) => id === 1 ? 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AV//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AV//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Aqf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z' : '', GetBookData: async (id) => id === 1 ? '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' : '', GetStats: async () => ({total_books: 2, total_size: 6291456, total_read_seconds: 3600, total_notes: 2, total_tags: 1, total_misrecords: 0, reading_books: 1, finished_books: 0, unread_books: 1, format_counts: {epub: 1, pdf: 1}}),
  GetSettings: async () => ({idle_seconds: '60', formats: 'epub,pdf,mobi,azw3,kepub', douban_auto: '0', theme: 'light'}),
  SetSettings: async () => {}, ListTags: async () => ${JSON.stringify([{id: 1, name: '科幻', color: '#5b7cfa', book_count: 1, created_at: ''}])},
  ListScanDirs: async () => ['E:\\\\Books'], AddScanDir: async () => {}, RemoveScanDir: async () => {}, PickScanDir: async () => '', ScanStart: async () => {}, ScanStatus: async () => false,
  ListNotes: async () => [], CreateNote: async () => 1, UpdateNote: async () => {}, DeleteNote: async () => {},
  DeleteBook: async () => {}, UpdateBookMeta: async () => {}, MarkMisrecord: async () => {}, UnmarkMisrecord: async () => {}, SetBookTags: async () => {}, CreateTag: async () => 1, UpdateTag: async () => {}, DeleteTag: async () => {},
  GetMisrecords: async () => [], RemoveMisrecord: async () => {}, ClearMisrecords: async () => {}, SaveProgress: async () => {}, ReportReading: async () => 3600, ListReadingSessions: async () => [],
  DoubanSearch: async () => [], FetchDouban: async (id) => ${JSON.stringify(BOOKS)}[0], EnrichBookByTitle: async () => {}, EnrichAllMissing: async () => 0, ClearDoubanInfo: async () => {}, OpenBookFolder: async () => {}, DataDir: async () => 'E:\\\\AppData',
} } };
window.runtime = { EventsOn: () => {}, EventsOff: () => {}, EventsOnMultiple: () => {}, EventsOnce: () => {}, EventsEmit: () => {}, LogPrint: () => {} };
`;

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 250)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 250)));
  await page.addInitScript(MOCK);
  await page.goto('http://localhost:' + PORT + '/', {waitUntil: 'networkidle'});
  await page.waitForTimeout(1200);

  console.log('cards:', await page.locator('.book-card').count());
  console.log('sidebar tags:', await page.locator('.tag-item').count());
  const logoOk = await page.evaluate(() => { const img = document.querySelector('.logo img.icon'); return img ? (img.src.length > 0 && img.naturalWidth > 0) : false; });
  console.log('sidebar logo img loaded:', logoOk);

  console.log('stats boxes:', await page.locator('.stat-box').count());

  // open scan dialog
  await page.evaluate(() => { document.querySelectorAll('.action-btn').forEach(b => { if (b.textContent.includes('扫描')) b.click(); }); });
  await page.waitForTimeout(400);
  console.log('scan dialog open:', await page.locator('text=扫描格式').count() > 0);
  await page.screenshot({path: 'screens/scan.png'});
  await page.evaluate(() => document.querySelector('.modal-close')?.click());

  // open tag manager
  await page.evaluate(() => { document.querySelectorAll('.action-btn').forEach(b => { if (b.textContent.includes('标签管理')) b.click(); }); });
  await page.waitForTimeout(300);
  console.log('tag manager open:', await page.locator('text=新建标签').count() > 0);
  await page.evaluate(() => document.querySelector('.modal-close')?.click());

  // open settings
  await page.evaluate(() => { document.querySelectorAll('.action-btn').forEach(b => { if (b.textContent.includes('设置')) b.click(); }); });
  await page.waitForTimeout(300);
  console.log('settings open:', await page.locator('text=阅读计时闲置上限').count() > 0);
  await page.evaluate(() => document.querySelector('.modal-close')?.click());

  // open book detail via force click on hover action
  await page.locator('.book-card').first().hover();
  await page.evaluate(() => document.querySelector('.book-hover-actions button')?.click());
  await page.waitForTimeout(600);
  console.log('detail modal:', await page.locator('text=书籍详情').count() > 0);
  await page.screenshot({path: 'screens/detail.png'});
  await page.evaluate(() => document.querySelector('.modal-close')?.click());

  // open reader (GetBookData returns '' -> error state)
  await page.evaluate(() => document.querySelector('.book-card')?.click());
  await page.waitForTimeout(800);
  console.log('reader opened:', await page.locator('.reader-root').count() > 0);
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
  console.log('epub rendered:', epubState);

  await page.screenshot({path: 'screens/reader.png'});
  await page.evaluate(() => { const b = document.querySelector('.reader-toolbar button:last-child'); b?.click(); });

  const errs = [...new Set(errors)];
  console.log('JS ERRORS:', errs.length ? '\n  ' + errs.join('\n  ') : 'none');
  await browser.close();
  server.close();
  process.exit(errs.length ? 1 : 0);
}
main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
