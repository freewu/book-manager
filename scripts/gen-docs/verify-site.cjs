// docs 官网的浏览器校验：三语言页面能渲染、链接/图片都存在、select 切换语言生效。
// 需要 Edge + playwright-core（和 ui-smoke 一样），截图落在 screens/site-*.png。
// 用法：just site-test（或 node.exe scripts/gen-docs/verify-site.cjs）
const path = require('path');
const REPO = path.join(__dirname, '..', '..');
const {chromium} = require(path.join(REPO, 'src', 'frontend', 'node_modules', 'playwright-core'));

const DOCS = path.join(REPO, 'docs');
const SHOTS = path.join(REPO, 'screens');
const file = (n) => 'file:///' + path.join(DOCS, n).replace(/\\/g, '/');

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (extra === undefined ? '' : ' = ' + extra));
}

(async () => {
  const browser = await chromium.launch({channel: 'msedge', headless: true, args: ['--no-sandbox', '--allow-file-access-from-files']});
  const page = await browser.newPage({viewport: {width: 1280, height: 900}});
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });

  const cases = [
    ['index.html', 'en', 'English', 'Features'],
    ['zh-CN.html', 'zh-CN', '简体中文', '功能'],
    ['zh-TW.html', 'zh-TW', '繁體中文', '功能'],
  ];
  for (const [f, lang, selLabel, navFirst] of cases) {
    await page.goto(file(f));
    await page.waitForTimeout(600);
    const info = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      selected: document.getElementById('lang').value,
      opts: [...document.getElementById('lang').options].map((o) => [o.value, o.textContent, o.selected]),
      cards: document.querySelectorAll('.card').length,
      features: document.querySelectorAll('#features .card').length,
      tools: document.querySelectorAll('#tools .card').length,
      shots: document.querySelectorAll('.shot').length,
      hero: (document.querySelector('.shot-hero img') || {}).naturalWidth,
      broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      anchors: [...document.querySelectorAll('.nav a')].map((a) => (document.querySelector(a.getAttribute('href')) ? 'ok' : a.getAttribute('href'))),
      navText: document.querySelector('.nav a') && document.querySelector('.nav a').textContent,
      selectVisible: document.getElementById('lang').offsetParent !== null,
      ftr: [...document.querySelectorAll('.ftr-in a')].map((a) => a.textContent),
    }));
    check(f + ' html lang', info.lang === lang, info.lang);
    check(f + ' select 指向自己', info.selected === f, info.selected);
    check(f + ' 第一个导航项', info.navText === navFirst, info.navText);
    check(f + ' 功能卡片 14 个', info.features === 14, info.features);
    check(f + ' 工具卡片 14 个', info.tools === 14, info.tools);
    check(f + ' 截图 6 张', info.shots === 6, info.shots);
    check(f + ' hero 图已加载', info.hero === 2880, info.hero);
    check(f + ' 没有加载失败的图片', info.broken.length === 0, JSON.stringify(info.broken));
    check(f + ' 导航锚点都有对应区块', info.anchors.every((x) => x === 'ok'), JSON.stringify(info.anchors));
    check(f + ' 页脚 4 个链接（GitHub + README + Issues + License）', info.ftr.length === 4, JSON.stringify(info.ftr));
    check(f + ' 语言下拉可见', info.selectVisible);
    // 语言下拉里当前语言是选中的那一个
    const cur = info.opts.filter((o) => o[2]);
    check(f + ' 下拉里恰好选中一项', cur.length === 1 && cur[0][0] === f, JSON.stringify(cur));
  }

  // 语言切换：从英文页选「简体中文」应跳到 zh-CN.html
  await page.goto(file('index.html'));
  await page.waitForTimeout(300);
  await Promise.all([page.waitForNavigation(), page.selectOption('#lang', 'zh-CN.html')]);
  await page.waitForTimeout(400);
  check('切到简体中文', page.url().endsWith('zh-CN.html'), page.url().split('/').pop());
  check('切换后 html lang = zh-CN', (await page.evaluate(() => document.documentElement.lang)) === 'zh-CN');
  await Promise.all([page.waitForNavigation(), page.selectOption('#lang', 'zh-TW.html')]);
  await page.waitForTimeout(400);
  check('再切到繁體', page.url().endsWith('zh-TW.html'), page.url().split('/').pop());
  await Promise.all([page.waitForNavigation(), page.selectOption('#lang', 'index.html')]);
  await page.waitForTimeout(400);
  check('切回英文', page.url().endsWith('index.html'), page.url().split('/').pop());

  await page.setViewportSize({width: 1280, height: 900});
  await page.screenshot({path: path.join(SHOTS, 'site-en.png')});
  await page.goto(file('zh-CN.html'));
  await page.waitForTimeout(900);
  await page.screenshot({path: path.join(SHOTS, 'site-zh.png')});

  check('没有 JS 报错', errs.length === 0, JSON.stringify(errs).slice(0, 300));
  await browser.close();
  console.log(failed === 0 ? 'SITE OK' : 'SITE FAILED: ' + failed);
  process.exit(failed === 0 ? 0 : 1);
})();
