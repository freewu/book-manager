// ui-features.cjs — verifies the 3 new features end-to-end against the built
// frontend with a mocked backend:
//  1. EPUB reader turns pages with the mouse wheel
//  2. Book detail edits save on blur (no save button)
//  3. Opening a book fires an async douban auto-enrich task
const http = require('http');
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');

const DIST = path.resolve(__dirname, 'dist');
const PORT = 8748;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, {'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

// pull the tiny sample epub base64 out of ui-smoke.cjs
const smoke = fs.readFileSync(path.join(__dirname, 'ui-smoke.cjs'), 'utf8');
const epubB64 = smoke.match(/GetBookData: async \(id\) => id === 1 \? '([^']+)'/)[1];

const ENRICHED = {id: 1, path: 'E:/Books/a.epub', file_name: 'a.epub', format: 'epub', title: '豆瓣新书名', author: '豆瓣作者', publisher: '豆瓣出版社', language: 'zh', description: '', size: 4096, hash: 'h', cover_path: '', has_cover: false, douban_url: 'https://book.douban.com/subject/1/', douban_rating: 8.8, douban_rating_count: 123, douban_authors: '豆瓣作者', misrecord: false, douban_fail_count: 0, current_location: '', current_page: 0, total_pages: 0, read_progress: 0, last_read_at: '', total_read_seconds: 0, note_count: 0, tags: [], created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00'};
const BOOK = {...ENRICHED, title: '旧书名', author: '', publisher: '', douban_url: '', douban_rating: 0, douban_rating_count: 0};

function makeMock(BOOK, ENRICHED) {
  return ({BOOK: B, ENRICHED: E}) => {
    window.__calls = {meta: null, auto: 0};
    window.go = {main: {App: {
      GetBooks: async () => [B],
      GetBook: async (id) => B,
      GetCoverData: async (id) => '',
      GetBookData: async (id) => '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',
      GetBookDataRange: async (id, off, len) => '',
      GetVersion: async () => 'v0.1.0',
      GetSystemDarkMode: async () => false,
      SetUiTheme: async () => {},
      GetStats: async () => ({total_books: 1, total_size: 1, total_read_seconds: 0, total_notes: 0, total_tags: 0, total_misrecords: 0, reading_books: 0, finished_books: 0, unread_books: 1, format_counts: {epub: 1}}),
      GetSettings: async () => ({idle_seconds: '60', formats: 'epub,pdf,mobi,azw3,kepub', douban_auto: '0', theme: 'light'}),
      SetSettings: async () => {}, ListTags: async () => [], ListScanDirs: async () => [], AddScanDir: async () => {}, RemoveScanDir: async () => {}, PickScanDir: async () => '', ScanStart: async () => {}, ScanStatus: async () => false,
      ListNotes: async () => [], CreateNote: async () => 1, UpdateNote: async () => {}, DeleteNote: async () => {},
      DeleteBook: async () => {}, UpdateBookMeta: async (id, title, author, publisher, desc) => { window.__calls.meta = {id, title, author, publisher}; B.title = title; B.author = author; B.publisher = publisher; }, MarkMisrecord: async () => {}, UnmarkMisrecord: async () => {}, SetBookTags: async () => {}, CreateTag: async () => 1, UpdateTag: async () => {}, DeleteTag: async () => {},
      GetMisrecords: async () => [], RemoveMisrecord: async () => {}, ClearMisrecords: async () => {}, SaveProgress: async () => {}, ReportReading: async () => 0, ListReadingSessions: async () => [],
      DoubanSearch: async () => [], FetchDouban: async () => E, AutoEnrichBook: async (id) => { window.__calls.auto++; return E; }, EnrichBookByTitle: async () => {}, EnrichAllMissing: async () => 0, ClearDoubanInfo: async () => {}, OpenBookFolder: async () => {}, OpenWithKKFileView: async () => {}, DataDir: async () => 'E:\\AppData',
    }}};
    window.runtime = {EventsOn: () => () => {}, EventsOff: () => {}, EventsOnMultiple: () => () => {}, EventsOnce: () => () => {}, EventsEmit: () => {}, LogPrint: () => {}};
  };
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 250)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 250)));
  await page.addInitScript(makeMock(BOOK, ENRICHED), {BOOK, ENRICHED});
  await page.goto('http://localhost:' + PORT + '/', {waitUntil: 'networkidle'});
  await page.waitForTimeout(1200);

  // ---- feature 1: wheel page turning in the EPUB reader ----
  await page.evaluate(() => document.querySelector('.book-card')?.click());
  await page.waitForTimeout(3500);
  const readerUp = await page.locator('.reader-root').count() > 0;
  const p0 = await page.evaluate(() => window.__calls.auto); // auto-enrich fired on open (feature 3)
  const epubText = () => page.evaluate(() => {
    const f = document.querySelector('#epub-view iframe');
    if (!f) return '';
    try { return (f.contentDocument || f.contentWindow.document).body.innerText || ''; } catch { return ''; }
  });
  const t0 = await epubText();
  // wheel down → next page
  await page.mouse.move(640, 400);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(900);
  const t1 = await epubText();
  // wheel up → previous page
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(900);
  const t2 = await epubText();
  console.log('F1 reader:', readerUp, '| text len:', t0.length, '->', t1.length, '->', t2.length);
  console.log('F1 head:', JSON.stringify((t1 || t0).slice(0, 60)));
  await page.screenshot({path: 'screens/features-epub-wheel.png'});
  const wheelOk = readerUp && t0 !== t1 && t2 === t0; // wheel down flips, wheel up flips back
  await page.evaluate(() => { const b = document.querySelector('.reader-toolbar button:last-child'); b?.click(); });
  await page.waitForTimeout(800);

  // ---- feature 3: async douban auto-enrich fired when opening ----
  console.log('F3 autoEnrich calls:', await page.evaluate(() => window.__calls.auto));
  const autoOk = (await page.evaluate(() => window.__calls.auto)) >= 1;

  // ---- feature 2: blur-save in book detail (no save button) ----
  // detail is opened from the right-click context menu
  await page.locator('.book-card').first().click({button: 'right'});
  await page.waitForTimeout(400);
  const ctxBtn = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('.ctx-menu button')];
    console.log('CTX MENU:', bs.map((x) => x.textContent.trim()).join(' | '));
    const b = bs.find((x) => x.textContent.includes('本书信息') || x.textContent.includes('Book info'));
    b?.click();
    return !!b;
  });
  await page.waitForTimeout(600);
  const detailOpen = await page.evaluate(() => !!document.querySelector('.form-row, [class*=detail]'));
  console.log('F2 detail open:', detailOpen, '| ctx button:', ctxBtn);
  const editBtn = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('button')];
    const b = bs.find((x) => /编辑|Edit/i.test(x.textContent));
    b?.click();
    return !!b;
  });
  await page.waitForTimeout(300);
  // fill title and blur (click elsewhere)
  const titleInput = page.locator('.form-row input').first();
  await titleInput.fill('手动改的书名');
  await titleInput.blur();
  await page.waitForTimeout(700);
  const meta = await page.evaluate(() => window.__calls.meta);
  console.log('F2 meta saved on blur:', JSON.stringify(meta));
  const blurOk = !!meta && meta.title === '手动改的书名' && meta.author === '';

  const errs = [...new Set(errors)];
  console.log('JS ERRORS:', errs.length ? '\n  ' + errs.join('\n  ') : 'none');
  await browser.close();
  server.close();
  const pass = wheelOk && blurOk && autoOk && errs.length === 0;
  console.log('RESULT:', pass ? 'PASS' : 'FAIL');
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
