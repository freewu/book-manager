// Validates the JS mobi parsing logic (mirrors ReaderMobi.tsx) against a
// synthetic PalmDB/MOBI file built with the same structure as the Go test.
const assert = require('assert');

// node has no URL.createObjectURL — mock it (ReaderMobi.tsx uses it for images)
if (typeof URL.createObjectURL !== 'function') {
  let n = 0;
  URL.createObjectURL = () => 'blob:mock-' + n++;
  URL.revokeObjectURL = () => {};
}

// ---- build a synthetic mobi ----
// palmdocLiteralCompress encodes data using only literal tokens (valid PalmDoc).
// Note: tokens 0x01-0x08 copy N following bytes verbatim (no repetition).
function palmdocLiteralCompress(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    // batch up to 8 literal bytes into one 0x01-0x08 token when they are all
    // in the safe range (0x01-0x7f, excluding 0x00); otherwise emit individually
    let j = i;
    while (j < data.length && j - i < 8 && data[j] > 0 && data[j] < 0x80) j++;
    if (j - i >= 2) {
      out.push(j - i);
      for (let k = i; k < j; k++) out.push(data[k]);
      i = j;
      continue;
    }
    const b = data[i];
    if (b === 0 || b > 0x7f) out.push(0x00, b);
    else out.push(b);
    i++;
  }
  return out;
}

function buildMobi({encoding = 65001, title = 'MobiTest', titleBytes = null} = {}) {
  const te = new TextEncoder();
  const text = te.encode('<h1>Mobi Chapter</h1><p>Hello from the mobi reader test.</p><img recindex="0"/>');
  const compressed = palmdocLiteralCompress(text);

  const titleEnc = titleBytes || te.encode(title);
  const author = 'TestAuthor';
  const publisher = 'PubCo';
  const headerLen = 232;

  const exthRecords = [
    [100, te.encode(author)],
    [101, te.encode(publisher)],
    [129, titleEnc],
    [201, new Uint8Array([0, 0, 0, 0])],
  ];
  let exthLen = 12;
  for (const [, d] of exthRecords) exthLen += 8 + d.length;
  const exth = new Uint8Array(exthLen);
  exth.set(te.encode('EXTH'), 0);
  const dvw = new DataView(exth.buffer);
  dvw.setUint32(4, exthLen, false);
  dvw.setUint32(8, exthRecords.length, false);
  let pos = 12;
  for (const [typ, d] of exthRecords) {
    dvw.setUint32(pos, typ, false);
    dvw.setUint32(pos + 4, 8 + d.length, false);
    exth.set(d, pos + 8);
    pos += 8 + d.length;
  }

  const mh = new Uint8Array(headerLen);
  mh.set(te.encode('MOBI'), 0);
  const dv = new DataView(mh.buffer);
  dv.setUint32(4, headerLen, false);
  dv.setUint32(8, 2, false);
  dv.setUint16(12, encoding, false);
  dv.setUint32(84, headerLen + exthLen, false);
  dv.setUint32(88, titleEnc.length, false);
  dv.setUint32(92, 2, false);
  dv.setUint32(112, 0x40, false);
  dv.setUint32(168, 1, false);
  dv.setUint32(172, 1, false);

  const rec0 = new Uint8Array(headerLen + exthLen + titleEnc.length);
  rec0.set(mh, 0);
  rec0.set(exth, headerLen);
  rec0.set(titleEnc, headerLen + exthLen);

  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, ...new Array(200).fill(0), 0xff, 0xd9]);
  const rec2 = new Uint8Array(8 + jpg.length);
  const dv2 = new DataView(rec2.buffer);
  dv2.setUint32(0, 8, false);
  dv2.setUint32(4, jpg.length, false);
  rec2.set(jpg, 8);

  const numRecords = 3;
  const rec1Off = 78 + 8 * numRecords;
  const rec2Off = rec1Off + rec0.length;
  const rec3Off = rec2Off + compressed.length;

  const pdb = new Uint8Array(78);
  pdb.set(te.encode('BOOKMOBI'), 0);
  pdb.set(te.encode('BOOK'), 60);
  pdb.set(te.encode('MOBI'), 64);
  const dvm = new DataView(pdb.buffer);
  dvm.setUint16(76, numRecords, false);

  const recList = new Uint8Array(8 * numRecords);
  const dvl = new DataView(recList.buffer);
  dvl.setUint32(0, rec1Off, false);
  recList[4] = 0;
  dvl.setUint32(8, rec2Off, false);
  recList[12] = 0x02;
  dvl.setUint32(16, rec3Off, false);
  recList[20] = 0;

  const out = new Uint8Array(rec3Off + rec2.length);
  out.set(pdb, 0);
  out.set(recList, 78);
  out.set(rec0, rec1Off);
  out.set(compressed, rec2Off);
  out.set(rec2, rec3Off);
  return out;
}

// ---- parser (mirrors ReaderMobi.tsx) ----
function palmDocDecompress(input, maxOut = 64 * 1024 * 1024) {
  const out = [];
  let i = 0;
  while (i < input.length && out.length < maxOut) {
    const c = input[i++];
    if (c === 0x00) {
      if (i < input.length) out.push(input[i++]);
    } else if (c >= 0x01 && c <= 0x08) {
      for (let j = 0; j < c && i < input.length && out.length < maxOut; j++) out.push(input[i++]);
    } else if (c >= 0x09 && c <= 0x7f) {
      out.push(c);
    } else if (c >= 0x80 && c <= 0xbf) {
      const c2 = input[i++];
      const length = (c2 >> 5) + 3;
      const distance = ((c & 0x1f) << 8) | c2;
      const spaces = (c >> 5) & 7;
      for (let j = 0; j < length && out.length < maxOut; j++) out.push(out[out.length - distance]);
      for (let j = 0; j < spaces && out.length < maxOut; j++) out.push(0x20);
    } else {
      const c2 = input[i++];
      const c3 = input[i++];
      const length = (c3 >> 5) + 11;
      const distance = ((c & 0x1f) << 16) | (c2 << 8) | c3;
      const spaces = (c >> 5) & 7;
      for (let j = 0; j < length && out.length < maxOut; j++) out.push(out[out.length - distance]);
      for (let j = 0; j < spaces && out.length < maxOut; j++) out.push(0x20);
    }
  }
  return new Uint8Array(out);
}

function sniffMime(b) {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  return 'image/jpeg';
}

function decodeText(bytes, encoding) {
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0 || bytes[end - 1] === 0x20)) end--;
  const slice = bytes.slice(0, end);
  const label =
    {
      65001: 'utf-8',
      936: 'gbk',
      949: 'euc-kr',
      950: 'big5',
      932: 'shift_jis',
    }[encoding] || 'windows-1252';
  try {
    return new TextDecoder(label).decode(slice);
  } catch {
    return new TextDecoder('utf-8').decode(slice);
  }
}

function looksGarbled(s) {
  if (!s) return false;
  let n = 0;
  let susp = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) || 0;
    if (cp === 0xfffd) return true;
    if (cp >= 0x80 && cp <= 0x2ff) susp++;
    n++;
  }
  return susp > 0 && susp * 2 >= n;
}

function hasCJK(s) {
  for (const ch of s) {
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 0x4e00 && cp <= 0x9fff) return true;
  }
  return false;
}

function decodeSmart(bytes, encoding) {
  const s = decodeText(bytes, encoding);
  if (!looksGarbled(s)) return s;
  for (const enc of ['gbk', 'shift_jis', 'big5']) {
    try {
      const alt = new TextDecoder(enc).decode(bytes);
      if (!looksGarbled(alt) && hasCJK(alt)) return alt;
    } catch {}
  }
  return s;
}

function parseMobi(buf) {
  const dv = new DataView(buf);
  const numRecords = dv.getUint16(76, false);
  const recList = 78;
  const recOffsets = [];
  const recAttrs = [];
  for (let i = 0; i < numRecords; i++) {
    recOffsets.push(dv.getUint32(recList + i * 8, false));
    recAttrs.push(dv.getUint8(recList + i * 8 + 4));
  }
  const rec0End = numRecords > 1 ? recOffsets[1] : buf.byteLength;
  const rec0 = new Uint8Array(buf, recOffsets[0], rec0End - recOffsets[0]);
  let mobiOff = -1;
  for (let i = 0; i < rec0.length - 4; i++) {
    if (rec0[i] === 0x4d && rec0[i + 1] === 0x4f && rec0[i + 2] === 0x42 && rec0[i + 3] === 0x49) {
      mobiOff = i;
      break;
    }
  }
  if (mobiOff < 0) throw new Error('not mobi');
  const base = recOffsets[0] + mobiOff;
  const headerLen = dv.getUint32(base + 4, false);
  const encoding = dv.getUint16(base + 12, false);
  const fullNameOff = dv.getUint32(base + 84, false);
  const fullNameLen = dv.getUint32(base + 88, false);
  const firstImage = dv.getUint32(base + 92, false);
  const exthFlags = dv.getUint32(base + 112, false);
  const firstContent = dv.getUint32(base + 168, false);
  const lastContent = dv.getUint32(base + 172, false);

  let title = '';
  if (fullNameLen > 0 && fullNameOff + fullNameLen <= rec0.length) {
    title = decodeSmart(rec0.subarray(fullNameOff, fullNameOff + fullNameLen), encoding);
  }

  let exthEnd = headerLen;
  if (exthFlags & 0x40 && mobiOff + exthEnd + 4 <= rec0.length) {
    const s = mobiOff + exthEnd;
    if (String.fromCharCode(rec0[s], rec0[s + 1], rec0[s + 2], rec0[s + 3]) === 'EXTH') {
      exthEnd += dv.getUint32(base + headerLen + 4, false);
    }
  }
  let textStart = mobiOff + exthEnd;
  if (textStart < 0 || textStart > rec0.length) textStart = 0;

  const textParts = [];
  const rec0Text = rec0.subarray(textStart);
  if (rec0Text.length > 0) textParts.push(rec0Text);

  const last = Math.min(lastContent || firstContent || numRecords - 1, numRecords - 1);
  for (let r = Math.max(1, firstContent); r <= last; r++) {
    if (r >= numRecords) break;
    const off = recOffsets[r];
    const end = r + 1 < numRecords ? recOffsets[r + 1] : buf.byteLength;
    const rec = new Uint8Array(buf, off, end - off);
    let data;
    if (recAttrs[r] & 0x02) data = palmDocDecompress(rec);
    else data = rec;
    textParts.push(data);
  }

  let total = 0;
  for (const p of textParts) total += p.length;
  const all = new Uint8Array(total);
  let pos = 0;
  for (const p of textParts) {
    all.set(p, pos);
    pos += p.length;
  }
  let text = decodeSmart(all, encoding);
  text = text.replace(/\x00/g, '');
  text = text.replace(/<mbp:pagebreak\s*\/?>/gi, '<div class="mbp-pagebreak"></div>');
  text = text.replace(/<img[^>]*recindex=["']?(\d+)["']?[^>]*\/?>/gi, (m, idx) => {
    const n = firstImage + parseInt(idx);
    if (n >= 0 && n < numRecords) {
      const off = recOffsets[n];
      const end = n + 1 < numRecords ? recOffsets[n + 1] : buf.byteLength;
      const rec = new Uint8Array(buf, off, end - off);
      const imgOff = dv.getUint32(off, false) || 8;
      const imgLen = dv.getUint32(off + 4, false) || rec.length - 8;
      if (imgOff >= 0 && imgLen > 0 && imgOff + imgLen <= rec.length) {
        const img = rec.subarray(imgOff, imgOff + imgLen);
        return `<img src="${URL.createObjectURL(new Blob([img], {type: sniffMime(img)}))}" style="max-width:100%;" />`;
      }
    }
    return '';
  });
  return {title, html: text};
}

// ---- run: utf-8 happy path ----
const file = buildMobi();
const parsed = parseMobi(file.buffer);
assert.strictEqual(parsed.title, 'MobiTest', 'title mismatch');
assert.ok(parsed.html.includes('Mobi Chapter'), 'text missing');
assert.ok(parsed.html.includes('Hello from the mobi reader test.'), 'compressed text missing');
assert.ok(parsed.html.includes('src="blob:'), 'inline image should use a blob URL');
console.log('mobi JS parser: OK (utf-8)');
console.log('  title =', parsed.title);
console.log('  html  =', parsed.html.slice(0, 120));

// ---- run: GBK title claimed as CP1252 (mojibake → smart fallback) ----
const gbkTitle = new Uint8Array([0xc2, 0xd2, 0xc2, 0xeb, 0xca, 0xe9, 0xc3, 0xfb, 0xb2, 0xe2, 0xca, 0xd4]); // 乱码书名测试
const fileGbk = buildMobi({encoding: 1252, titleBytes: gbkTitle});
const parsedGbk = parseMobi(fileGbk.buffer);
assert.strictEqual(parsedGbk.title, '乱码书名测试', 'GBK title should be recovered via fallback');
console.log('mobi JS parser: OK (gbk fallback)');
console.log('  gbk title =', parsedGbk.title);
