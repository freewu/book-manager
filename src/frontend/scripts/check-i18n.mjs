// 静态校验：
// 1) i18n 字典中每个 key 都含 zh-CN / zh-TW / en 三种语言，且无重复 key
// 2) 前端源码里出现的 t('xxx') / nameKey: 'xxx' 等字面量 key 都存在于字典
// 3) 每个工具目录都具备 define.ts / lib.ts，以及 tools.tsx（弹窗工具）
//    或 page.tsx（整页工具，define.ts 里声明 page 字段）
// 用法: node.exe scripts/check-i18n.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'src');

const i18n = fs.readFileSync(path.join(srcDir, 'i18n.tsx'), 'utf8');
const dictStart = i18n.indexOf('const DICT: Dict = {');
const dictEnd = i18n.indexOf('\n};', dictStart);
if (dictStart < 0 || dictEnd < 0) {
  console.error('未找到 i18n 字典');
  process.exit(1);
}
const dictBody = i18n.slice(dictStart, dictEnd);
// 条目可能跨多行且值里含 {n} 占位符，所以按“下一个条目的起点”切分，而不是靠括号匹配
const entryRe = /^\s*'([A-Za-z0-9_.\-@]+)':\s*\{/gm;
const entries = [];
let m;
while ((m = entryRe.exec(dictBody))) entries.push({key: m[1], start: m.index});
const keys = new Set();
const dup = [];
const missingLang = [];
entries.forEach((entry, i) => {
  const text = dictBody.slice(entry.start, i + 1 < entries.length ? entries[i + 1].start : dictBody.length);
  if (keys.has(entry.key)) dup.push(entry.key);
  keys.add(entry.key);
  for (const lang of ['zh-CN', 'zh-TW', 'en']) {
    if (!text.includes(`'${lang}':`)) missingLang.push(`${entry.key} -> ${lang}`);
  }
});
if (keys.size < 100) {
  console.error(`i18n 解析异常：只找到 ${keys.size} 个 key`);
  process.exit(1);
}

// collect source files
const files = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (e.name === 'node_modules' || e.name === 'wailsjs' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(e.name) && p !== path.join(srcDir, 'i18n.tsx')) files.push(p);
  }
};
walk(srcDir);

const keyRef = /(?:\bt\(|\btranslate\([^,)]+,\s*|(?:name|desc|label|title|action|hint|err)Key:\s*)'([A-Za-z0-9_.\-@]+)'/g;
const unknown = [];
const used = new Set();
for (const f of files) {
  const text = fs.readFileSync(f, 'utf8');
  let mm;
  while ((mm = keyRef.exec(text))) {
    const k = mm[1];
    used.add(k);
    if (!keys.has(k)) unknown.push(`${path.relative(root, f)}: ${k}`);
  }
  // 动态 key: t(`prefix.${x}`) —— 校验字典里存在该前缀的 key，并把这些 key 记为已使用
  const dyn = /\bt\(`([A-Za-z0-9_.\-@]*?)\$\{/g;
  let dd;
  while ((dd = dyn.exec(text))) {
    const prefix = dd[1];
    const hits = [...keys].filter((k) => k.startsWith(prefix));
    if (hits.length === 0) unknown.push(`${path.relative(root, f)}: 动态 key 前缀 "${prefix}*" 无匹配`);
    hits.forEach((k) => used.add(k));
  }
}

// tool plugin layout
const toolsDir = path.join(srcDir, 'tools');
const toolIssues = [];
for (const e of fs.readdirSync(toolsDir, {withFileTypes: true})) {
  if (!e.isDirectory()) continue;
  for (const need of ['define.ts', 'lib.ts']) {
    if (!fs.existsSync(path.join(toolsDir, e.name, need))) toolIssues.push(`${e.name}/ 缺少 ${need}`);
  }
  const definePath = path.join(toolsDir, e.name, 'define.ts');
  const defineSrc = fs.existsSync(definePath) ? fs.readFileSync(definePath, 'utf8') : '';
  const isPageTool = /\bpage:\s*'/.test(defineSrc);
  const view = isPageTool ? 'page.tsx' : 'tools.tsx';
  if (!fs.existsSync(path.join(toolsDir, e.name, view))) toolIssues.push(`${e.name}/ 缺少 ${view}`);
}

const unused = [...keys].filter((k) => !used.has(k));

console.log(`i18n keys: ${keys.size}, 源码引用: ${used.size}`);
if (dup.length) console.log('重复 key:', dup.join(', '));
if (missingLang.length) console.log('缺少语言:', missingLang.join(', '));
if (unknown.length) console.log('引用了未定义的 key:\n  ' + unknown.join('\n  '));
if (toolIssues.length) console.log('工具目录问题:\n  ' + toolIssues.join('\n  '));
console.log(`未被引用的 key: ${unused.length}${unused.length ? ' -> ' + unused.slice(0, 20).join(', ') : ''}`);
const bad = dup.length + missingLang.length + unknown.length + toolIssues.length;
console.log(bad === 0 ? 'OK' : `FAILED (${bad})`);
process.exit(bad === 0 ? 0 : 1);
