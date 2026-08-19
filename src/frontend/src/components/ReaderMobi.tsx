import React, {forwardRef, useEffect, useImperativeHandle, useRef} from 'react';
import type {Book} from '../types';
import type {ReaderHandle} from './Reader';
import {App} from '../api';
import {useI18n} from '../i18n';

interface Props {
  book: Book;
  data: string;
  fontSize: number;
  theme: string;
  onProgress: (loc: string, page: number, total: number, pct: number) => void;
  onActivity: () => void;
}

interface ParsedMobi {
  title: string;
  html: string;
  totalChars: number;
  blobs: string[]; // blob URLs to revoke on unmount
}

// ---------- PalmDoc decompression ----------
function palmDocDecompress(input: Uint8Array, maxOut = 64 * 1024 * 1024): Uint8Array {
  const out: number[] = [];
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

async function zlibDecompress(input: Uint8Array): Promise<Uint8Array> {
  try {
    const copy = new Uint8Array(input);
    const blob = new Blob([copy.buffer]);
    const stream = blob.stream().pipeThrough(new DecompressionStream('deflate'));
    // Guard against WebView2 implementations that never settle on corrupt data.
    const timer = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('deflate timeout')), 3000),
    );
    const buf = await Promise.race([new Response(stream).arrayBuffer(), timer]);
    return new Uint8Array(buf);
  } catch {
    return input;
  }
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  // trim trailing NUL padding
  let end = bytes.length;
  while (end > 0 && (bytes[end - 1] === 0 || bytes[end - 1] === 0x20)) end--;
  const slice = bytes.slice(0, end);
  const label =
    {
      65001: 'utf-8',
      936: 'gbk', // 简体中文
      949: 'euc-kr', // 韩文
      950: 'big5', // 繁体中文
      932: 'shift_jis', // 日文
    }[encoding] || 'windows-1252';
  try {
    return new TextDecoder(label).decode(slice);
  } catch {
    return new TextDecoder('utf-8').decode(slice);
  }
}

// Mojibake detector: U+FFFD or a majority of Latin-1/IPA-range chars means
// the bytes were decoded with the wrong table (e.g. GBK read as CP1252).
function looksGarbled(s: string): boolean {
  if (!s) return false;
  let n = 0;
  let susp = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0xfffd) return true;
    if (cp >= 0x80 && cp <= 0x2ff) susp++;
    n++;
  }
  return susp > 0 && susp * 2 >= n;
}

function hasCJK(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x4e00 && cp <= 0x9fff) return true;
  }
  return false;
}

// Decode with the declared encoding, falling back to byte probing:
// real-world MOBI often declare 0/CP1252 while actually storing UTF-8 or
// GBK, and the content may contain a few corrupt/raw records. We therefore
// trust a clean declared decode only for explicit CJK/UTF-8 encodings, and
// otherwise pick by UTF-8 byte validity ratio (a real UTF-8 book stays
// >90% valid even with stray garbage bytes).
function utf8Ratio(bytes: Uint8Array): number {
  const n = bytes.length;
  if (n === 0) return 1;
  const lim = Math.min(n, 131072); // sample first 128 KB
  let valid = 0;
  let total = 0;
  let i = 0;
  while (i < lim) {
    const b = bytes[i];
    total++;
    if (b < 0x80) {
      valid++;
      i++;
    } else if (b >= 0xc2 && b <= 0xdf) {
      if (i + 1 < n && bytes[i + 1] >= 0x80 && bytes[i + 1] <= 0xbf) {
        valid++;
        i += 2;
      } else i++;
    } else if (b >= 0xe0 && b <= 0xef) {
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      if (b1 !== undefined && b2 !== undefined && b1 >= 0x80 && b1 <= 0xbf && b2 >= 0x80 && b2 <= 0xbf) {
        valid++;
        i += 3;
      } else i++;
    } else if (b >= 0xf0 && b <= 0xf4) {
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      const b3 = bytes[i + 3];
      if (b1 !== undefined && b2 !== undefined && b3 !== undefined && b1 >= 0x80 && b1 <= 0xbf && b2 >= 0x80 && b2 <= 0xbf && b3 >= 0x80 && b3 <= 0xbf) {
        valid++;
        i += 4;
      } else i++;
    } else i++;
  }
  return total > 0 ? valid / total : 1;
}

function decodeSmart(bytes: Uint8Array, encoding: number): string {
  const declared = encoding === 0 ? null : decodeText(bytes, encoding);
  const declaredOk = declared !== null && !looksGarbled(declared);
  // Trust an explicit clean declared decode for UTF-8 / CJK encodings.
  if (declaredOk && (encoding === 65001 || encoding === 936 || encoding === 949 || encoding === 950 || encoding === 932)) {
    return declared;
  }
  // Unknown or CP1252-declared: probe the raw bytes.
  if (utf8Ratio(bytes) > 0.9) {
    return new TextDecoder('utf-8').decode(bytes);
  }
  const g = new TextDecoder('gbk').decode(bytes);
  if (hasCJK(g) && !looksGarbled(g)) return g;
  for (const enc of ['shift_jis', 'big5']) {
    try {
      const alt = new TextDecoder(enc).decode(bytes);
      if (hasCJK(alt) && !looksGarbled(alt)) return alt;
    } catch {
      // ignore unsupported encodings
    }
  }
  return declared ?? new TextDecoder('windows-1252').decode(bytes);
}

function sniffMime(b: Uint8Array): string {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  return 'image/jpeg';
}

// ---------- mobi file parsing ----------
async function parseMobi(buf: ArrayBuffer): Promise<ParsedMobi> {
  const dv = new DataView(buf);
  const numRecords = dv.getUint16(76, false);
  const recList = 78;
  const recOffsets: number[] = [];
  const recAttrs: number[] = [];
  for (let i = 0; i < numRecords; i++) {
    recOffsets.push(dv.getUint32(recList + i * 8, false));
    recAttrs.push(dv.getUint8(recList + i * 8 + 4));
  }
  const rec0End = numRecords > 1 ? recOffsets[1] : buf.byteLength;
  const rec0 = new Uint8Array(buf, recOffsets[0], rec0End - recOffsets[0]);

  // find MOBI magic in record 0
  let mobiOff = -1;
  for (let i = 0; i < rec0.length - 4; i++) {
    if (rec0[i] === 0x4d && rec0[i + 1] === 0x4f && rec0[i + 2] === 0x42 && rec0[i + 3] === 0x49) {
      mobiOff = i;
      break;
    }
  }
  if (mobiOff < 0) throw new Error('不是有效的 MOBI 文件');
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
    // reject garbage titles (control / replacement chars) → empty so the
    // caller falls back to the real book title from the database
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(title)) title = '';
  }

  // EXTH end = start of text in record 0
  let exthEnd = headerLen;
  if (exthFlags & 0x40 && mobiOff + exthEnd + 4 <= rec0.length) {
    const s = mobiOff + exthEnd;
    if (String.fromCharCode(rec0[s], rec0[s + 1], rec0[s + 2], rec0[s + 3]) === 'EXTH') {
      exthEnd += dv.getUint32(base + headerLen + 4, false);
    }
  }
  let textStart = mobiOff + exthEnd;
  if (textStart < 0 || textStart > rec0.length) textStart = 0;

  // decompress text records. Some real-world books have firstContent/
  // lastContent = 0 (meaning "unknown") but do have an image section; we must
  // stop before the first image record, otherwise hundreds of binary JPEG
  // records get decoded as text (garbage + slow).
  const textParts: Uint8Array[] = [];
  const rec0Text = rec0.subarray(textStart);
  if (rec0Text.length > 0) textParts.push(rec0Text);

  const hasImages = firstImage > 0 && firstImage < numRecords;
  const last =
    lastContent || firstContent || (hasImages ? firstImage - 1 : numRecords - 1);
  const lastClamped = Math.min(Math.max(last, 1), numRecords - 1);
  for (let r = Math.max(1, firstContent); r <= lastClamped; r++) {
    if (r >= numRecords) break;
    const off = recOffsets[r];
    const end = r + 1 < numRecords ? recOffsets[r + 1] : buf.byteLength;
    const rec = new Uint8Array(buf, off, end - off);
    let data: Uint8Array;
    if (recAttrs[r] & 0x02) {
      data = palmDocDecompress(rec);
    } else if (rec.length > 2 && rec[0] === 0x78) {
      data = await zlibDecompress(rec);
    } else {
      data = rec;
    }
    textParts.push(data);
  }

  // decode each record separately: these books mix encodings across records
  // (e.g. ASCII markup + UTF-8 body + stray GBK fragments), so a single
  // whole-buffer decode is wrong more often than not.
  const text = textParts
    .map((p) => decodeSmart(p, encoding))
    .join('')
    .replace(/\x00/g, '')
    .replace(/\x1b/g, '');
  // mobi markup → html
  let html = text.replace(/<mbp:pagebreak\s*\/?>/gi, '<div class="mbp-pagebreak"></div>');
  html = html.replace(/<mbp:section\b[^>]*\/?>/gi, '<div class="mbp-section"></div>');

  // inline images — use blob URLs so the browser decodes them off the main
  // thread (base64 data URLs would block the UI for large embedded images)
  const blobs: string[] = [];
  html = html.replace(/<img[^>]*recindex=["']?(\d+)["']?[^>]*\/?>/gi, (m, idx: string) => {
    const n = firstImage + parseInt(idx);
    if (n >= 0 && n < numRecords) {
      const off = recOffsets[n];
      const end = n + 1 < numRecords ? recOffsets[n + 1] : buf.byteLength;
      const rec = new Uint8Array(buf, off, end - off);
      const imgOff = dv.getUint32(off, false) || 8;
      const imgLen = dv.getUint32(off + 4, false) || rec.length - 8;
      if (imgOff >= 0 && imgLen > 0 && imgOff + imgLen <= rec.length) {
        const img = rec.subarray(imgOff, imgOff + imgLen);
        const url = URL.createObjectURL(new Blob([img], {type: sniffMime(img)}));
        blobs.push(url);
        return `<img src="${url}" style="max-width:100%;" />`;
      }
    }
    return '';
  });

  return {title, html, totalChars: html.length, blobs};
}

// ---------- component ----------
const ReaderMobi = forwardRef<ReaderHandle, Props>(function ReaderMobi(
  {book, data, fontSize, theme, onProgress, onActivity},
  ref,
) {
  const {t} = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const parsedRef = useRef<ParsedMobi | null>(null);
  const progressRef = useRef(book.read_progress || 0);
  const reportRef = useRef(onProgress);
  const activityRef = useRef(onActivity);
  const noteAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    reportRef.current = onProgress;
    activityRef.current = onActivity;
  }, [onProgress, onActivity]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const parsed = await parseMobi(bytes.buffer);
        if (!alive) return;
        parsedRef.current = parsed;
        const container = scrollRef.current;
        const inner = innerRef.current;
        if (!container || !inner) return;

        // Render large books in chunks so the UI stays responsive: setting a
        // 10-15 MB HTML string via innerHTML blocks the main thread for
        // seconds. Each 1 MB chunk is parsed into a fragment and appended,
        // yielding to the event loop between chunks.
        const html = parsed.html;
        const CHUNK = 1024 * 1024;
        let idx = 0;
        const renderNext = () => {
          if (!alive) return;
          const end = Math.min(idx + CHUNK, html.length);
          const frag = document.createRange().createContextualFragment(html.slice(idx, end));
          inner.appendChild(frag);
          idx = end;
          if (idx < html.length) {
            setTimeout(renderNext, 0);
          } else if (book.read_progress > 1) {
            // restore saved progress once the full content is in the DOM
            container.scrollTop = (container.scrollHeight - container.clientHeight) * (book.read_progress / 100);
          }
        };
        renderNext();

        const onScroll = () => {
          const el = scrollRef.current;
          if (!el || !parsedRef.current) return;
          const max = el.scrollHeight - el.clientHeight;
          const pct = max > 0 ? (el.scrollTop / max) * 100 : 0;
          const clamped = Math.max(0, Math.min(100, pct));
          const estPages = Math.max(1, Math.round(el.scrollHeight / el.clientHeight));
          const page = Math.min(estPages, Math.max(1, Math.round((clamped / 100) * estPages)));
          progressRef.current = clamped;
          reportRef.current('mobi:' + clamped.toFixed(2), page, estPages, clamped);
        };
        let ticking = false;
        const onScrollThrottled = () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            onScroll();
            activityRef.current();
          });
        };
        container.addEventListener('scroll', onScrollThrottled, {passive: true});
        onScroll();
      } catch (e) {
        console.error('mobi parse error', e);
      }
    })();
    return () => {
      alive = false;
      if (innerRef.current) innerRef.current.innerHTML = '';
      if (parsedRef.current?.blobs?.length) {
        for (const u of parsedRef.current.blobs) URL.revokeObjectURL(u);
        parsedRef.current.blobs = [];
      }
      if (noteAnchorRef.current) noteAnchorRef.current.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, data]);

  function openNotePopup(quote: string) {
    const existing = noteAnchorRef.current;
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.style.cssText =
      'position:absolute;right:16px;top:64px;z-index:30;background:#fff;border:1px solid #e4e6f0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.2);padding:12px;width:300px;display:flex;flex-direction:column;gap:8px;';
    div.innerHTML = `
      <div style="font-size:12px;color:#6b7280;font-style:italic;max-height:70px;overflow:auto;border-left:3px solid #5b7cfa;padding-left:8px;">“${quote.slice(0, 300).replace(/</g, '&lt;')}”</div>
      <textarea placeholder="${t('reader.notePlaceholder')}" rows="3" style="width:100%;border:1px solid #e4e6f0;border-radius:8px;padding:8px;font-size:13px;font-family:inherit;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="bm-note-cancel" style="padding:5px 10px;border-radius:7px;font-size:12px;background:#f3f4f8;">${t('reader.noteCancel')}</button>
        <button class="bm-note-save" style="padding:5px 10px;border-radius:7px;font-size:12px;background:#5b7cfa;color:#fff;">${t('reader.noteSave')}</button>
      </div>`;
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target.classList.contains('bm-note-cancel')) div.remove();
      if (target.classList.contains('bm-note-save')) {
        const ta = div.querySelector('textarea') as HTMLTextAreaElement;
        const content = ta.value.trim();
        if (content) {
          const loc = 'mobi:' + progressRef.current.toFixed(2);
          App.CreateNote(book.id, content, loc, '', quote.slice(0, 500)).catch(() => {});
        }
        div.remove();
      }
    });
    document.body.appendChild(div);
    noteAnchorRef.current = div;
    (div.querySelector('textarea') as HTMLTextAreaElement).focus();
    activityRef.current();
  }

  const handleSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (text.length > 1) openNotePopup(text);
  };

  useImperativeHandle(ref, () => ({
    goNext: () => {
      const el = scrollRef.current;
      if (!el) return;
      const h = el.clientHeight;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTop = Math.min(max, el.scrollTop + h * 0.9);
      activityRef.current();
    },
    goPrev: () => {
      const el = scrollRef.current;
      if (!el) return;
      const h = el.clientHeight;
      el.scrollTop = Math.max(0, el.scrollTop - h * 0.9);
      activityRef.current();
    },
    getProgress: () => progressRef.current,
    getPageInfo: () => {
      const el = scrollRef.current;
      if (!el) return {page: 0, total: 0, location: ''};
      const estPages = Math.max(1, Math.round(el.scrollHeight / el.clientHeight));
      const page = Math.min(estPages, Math.max(1, Math.round((progressRef.current / 100) * estPages)));
      return {page, total: estPages, location: 'mobi:' + progressRef.current.toFixed(2)};
    },
    destroy: () => {
      if (noteAnchorRef.current) noteAnchorRef.current.remove();
    },
  }));

  const dark = theme === 'dark';
  const sepia = theme === 'sepia';
  const bg = dark ? '#1c1e22' : sepia ? '#f3ead8' : '#f7f6f2';
  const fg = dark ? '#d6d8dd' : sepia ? '#4a3b2a' : '#2b2f3a';

  return (
    <div
      ref={scrollRef}
      className="text-reader"
      style={{background: bg, color: fg}}
      onMouseUp={handleSelection}
      onScroll={() => activityRef.current()}
    >
      <div
        ref={innerRef}
        style={{
          maxWidth: 760,
          margin: '0 auto',
          padding: '36px 40px 80px',
          lineHeight: 1.9,
          fontSize: `${fontSize}px`,
        }}
      />
    </div>
  );
});

export default ReaderMobi;
