// test-mobi-parser.cjs
//
// Verifies the MOBI/AZW3 reading pipeline that ships in the app. The parsing
// itself is delegated to foliate-js (see ReaderMobi.tsx); this script
// exercises foliate-js's core decoding path in Node against real files:
// open a MOBI/KF8 (AZW3) file, decompress every text record, decode it, and
// assert the result is readable CJK text (not garbled).
//
// The full render path (section.load -> blob -> DOMParser) needs a real DOM;
// we only run the "open + loadText + decode" path here, which is exactly the
// code that decides whether a book comes out as garbage. `linkedom` provides
// the minimal DOM foliate-js needs during open().
//
// Test files: any .mobi/.azw3 in $MOBI_TEST_DIR (default C:/tmp/fk).
// Skips (exit 0) when no test files are present so `just test` stays green
// on machines without fixtures.

const fs = require('fs');
const path = require('path');

const {DOMParser, parseHTML} = require('linkedom');
globalThis.DOMParser = DOMParser;
globalThis.document = parseHTML('<html><body></body></html>').document;
globalThis.CSS = {escape: (s) => s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c)};
globalThis.XMLSerializer = globalThis.XMLSerializer ?? class {
  serializeToString(node) {
    return node.outerHTML;
  }
};
globalThis.NodeFilter = {FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3};

const {MOBI} = require('foliate-js/mobi.js');

const unzlib = async (data) => data; // FONT resources not present in fixtures

const testDir = process.env.MOBI_TEST_DIR || 'C:/tmp/fk';

function count(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

async function parseOne(file) {
  const buf = fs.readFileSync(file);
  const mobi = new MOBI({unzlib});
  const book = await mobi.open(new Blob([buf]));
  const title = (book.metadata && book.metadata.title) || '';
  const numText = book.mobi.headers.palmdoc.numTextRecords;
  if (!numText) throw new Error('no text records');
  const parts = [];
  for (let i = 0; i < numText; i++) parts.push(book.mobi.decode(await book.mobi.loadText(i)));
  const text = parts
    .join('')
    .replace(/\x00/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
  return {title, records: numText, cjk: count(text, /[\u4e00-\u9fff]/g), text};
}

async function main() {
  if (!fs.existsSync(testDir)) {
    console.log(`mobi JS parser: SKIP (no fixtures in ${testDir})`);
    return 0;
  }
  const files = fs.readdirSync(testDir).filter((f) => /\.(mobi|azw3)$/i.test(f));
  if (!files.length) {
    console.log(`mobi JS parser: SKIP (no .mobi/.azw3 in ${testDir})`);
    return 0;
  }
  let ok = 0;
  for (const f of files) {
    const file = path.join(testDir, f);
    try {
      const r = await parseOne(file);
      // a real Chinese book must yield a healthy amount of CJK chars;
      // a garbled decode (wrong charset / failed PalmDOC decompress) yields
      // mostly Latin-1 noise and far fewer CJK chars
      const pass = r.cjk > 5000;
      console.log(
        `mobi JS parser: ${f} -> ${r.records}rec title="${String(r.title).slice(0, 30)}" cjk=${r.cjk} ${pass ? 'OK' : 'FAIL'}`,
      );
      if (!pass) return 1;
      ok++;
    } catch (e) {
      console.error(`mobi JS parser: ${f} -> ERROR ${e.message}`);
      return 1;
    }
  }
  console.log(`mobi JS parser: OK (${ok} files)`);
  return 0;
}

main().then((code) => process.exit(code));
