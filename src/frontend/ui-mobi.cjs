// ui-mobi.cjs — end-to-end render check for the foliate-js MOBI reader.
// Serves the built frontend with a mocked backend whose GetBookData returns
// a real .mobi file (base64), then opens the book and asserts the reader
// actually rendered readable CJK text.
const http = require('http');
const fs = require('fs');
const path = require('path');
const {chromium} = require('playwright-core');

const DIST = path.resolve(__dirname, 'dist');
const PORT = 8744;
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg'};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, {'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

const MOBI_FILE = process.env.MOBI_FILE || 'C:/tmp/fk/入职投行，你最需要的Excel建模书_1197550.mobi';
const mobiB64 = fs.readFileSync(MOBI_FILE).toString('base64');

const BOOK = {id: 1, path: MOBI_FILE, file_name: 't.mobi', format: 'mobi', title: '入职投行', author: '', publisher: '', language: 'zh', description: '', size: fs.statSync(MOBI_FILE).size, hash: 'x', cover_path: '', has_cover: false, douban_url: '', douban_rating: 0, douban_rating_count: 0, douban_authors: '', misrecord: false, current_location: '', current_page: 0, total_pages: 0, read_progress: 0, last_read_at: '', total_read_seconds: 0, note_count: 0, tags: [], created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00'};

function makeMock(BOOK) {
  return ({BOOK: B}) => {
    window.go = {main: {App: {
      GetBooks: async () => [B],
      GetBook: async (id) => B,
      GetCoverData: async (id) => '',
      GetBookData: async (id) => window.__MOBI_B64 || '',
      GetBookDataRange: async (id, off, len) => '',
      GetVersion: async () => 'v0.1.0',
      GetSystemDarkMode: async () => false,
      SetUiTheme: async () => {},
      GetStats: async () => ({total_books: 1, total_size: 1, total_read_seconds: 0, total_notes: 0, total_tags: 0, total_misrecords: 0, reading_books: 0, finished_books: 0, unread_books: 1, format_counts: {mobi: 1}}),
      GetSettings: async () => ({idle_seconds: '60', formats: 'epub,pdf,mobi,azw3,kepub', douban_auto: '0', theme: 'light'}),
      SetSettings: async () => {}, ListTags: async () => [], ListScanDirs: async () => [], AddScanDir: async () => {}, RemoveScanDir: async () => {}, PickScanDir: async () => '', ScanStart: async () => {}, ScanStatus: async () => false,
      ListNotes: async () => [], CreateNote: async () => 1, UpdateNote: async () => {}, DeleteNote: async () => {},
      DeleteBook: async () => {}, UpdateBookMeta: async () => {}, MarkMisrecord: async () => {}, UnmarkMisrecord: async () => {}, SetBookTags: async () => {}, CreateTag: async () => 1, UpdateTag: async () => {}, DeleteTag: async () => {},
      GetMisrecords: async () => [], RemoveMisrecord: async () => {}, ClearMisrecords: async () => {}, SaveProgress: async () => {}, ReportReading: async () => 0, ListReadingSessions: async () => [],
      DoubanSearch: async () => [], FetchDouban: async (id) => B, EnrichBookByTitle: async () => {}, EnrichAllMissing: async () => 0, ClearDoubanInfo: async () => {}, OpenBookFolder: async () => {}, OpenWithKKFileView: async () => {}, DataDir: async () => 'E:\\AppData',
    }}};
    window.runtime = {EventsOn: () => () => {}, EventsOff: () => {}, EventsOnMultiple: () => () => {}, EventsOnce: () => () => {}, EventsEmit: () => {}, LogPrint: () => {}};
  };
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--no-sandbox']});
  const page = await browser.newPage({viewport: {width: 1280, height: 820}});
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + String(e).slice(0, 300)));
  await page.addInitScript(makeMock(BOOK), {BOOK});
  await page.goto('http://localhost:' + PORT + '/', {waitUntil: 'networkidle'});
  // inject the (large) file payload after page load — inline multi-MB string
  // literals exceed V8's function-source limit
  await page.evaluate((b64) => { window.__MOBI_B64 = b64; }, mobiB64);
  await page.waitForTimeout(500);

  // open the book from the shelf
  await page.evaluate(() => document.querySelector('.book-card')?.click());
  await page.waitForTimeout(800);
  console.log('reader opened:', await page.locator('.reader-root').count() > 0);
  if ((await page.locator('.reader-root').count()) === 0) {
    console.log('page state:', (await page.evaluate(() => document.body.innerText)).replace(/\n/g, ' | ').slice(0, 400));
    await page.screenshot({path: 'screens/mobi-noopen.png'});
  }

  // foliate-js parses + renders sections async; give it time
  await page.waitForTimeout(6000);

  const state = await page.evaluate(() => {
    const inner = document.querySelector('.text-reader > div');
    if (!inner) return {ok: false, why: 'no .text-reader inner'};
    const txt = inner.textContent || '';
    const cjk = (txt.match(/[\u4e00-\u9fff]/g) || []).length;
    const repl = (txt.match(/\uFFFD/g) || []).length;
    const imgs = inner.querySelectorAll('img').length;
    const sample = txt.replace(/\s+/g, ' ').slice(0, 120);
    return {ok: cjk > 3000, cjk, repl, imgs, sample, htmlLen: inner.innerHTML.length};
  });
  console.log('render state:', JSON.stringify(state));
  await page.screenshot({path: 'screens/mobi-foliate.png', fullPage: false});

  const errs = [...new Set(errors)];
  console.log('JS ERRORS:', errs.length ? '\n  ' + errs.join('\n  ') : 'none');
  await browser.close();
  server.close();
  const pass = state.ok && errs.length === 0;
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
