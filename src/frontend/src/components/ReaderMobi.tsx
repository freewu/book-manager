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
}

// ---------- PalmDoc decompression ----------
function palmDocDecompress(input: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i++];
    if (c === 0x00) {
      if (i < input.length) out.push(input[i++]);
    } else if (c >= 0x01 && c <= 0x08) {
      for (let j = 0; j < c && i < input.length; j++) out.push(input[i++]);
    } else if (c >= 0x09 && c <= 0x7f) {
      out.push(c);
    } else if (c >= 0x80 && c <= 0xbf) {
      const c2 = input[i++];
      const length = (c2 >> 5) + 3;
      const distance = ((c & 0x1f) << 8) | c2;
      const spaces = (c >> 5) & 7;
      for (let j = 0; j < length; j++) {
        out.push(out[out.length - distance]);
      }
      for (let j = 0; j < spaces; j++) out.push(0x20);
    } else {
      const c2 = input[i++];
      const c3 = input[i++];
      const length = (c3 >> 5) + 11;
      const distance = ((c & 0x1f) << 16) | (c2 << 8) | c3;
      const spaces = (c >> 5) & 7;
      for (let j = 0; j < length; j++) {
        out.push(out[out.length - distance]);
      }
      for (let j = 0; j < spaces; j++) out.push(0x20);
    }
  }
  return new Uint8Array(out);
}

async function zlibDecompress(input: Uint8Array): Promise<Uint8Array> {
  try {
    const copy = new Uint8Array(input);
    const blob = new Blob([copy.buffer]);
    const stream = blob.stream().pipeThrough(new DecompressionStream('deflate'));
    const buf = await new Response(stream).arrayBuffer();
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
  try {
    if (encoding === 65001) {
      return new TextDecoder('utf-8').decode(slice);
    }
    return new TextDecoder('windows-1252').decode(slice);
  } catch {
    return new TextDecoder('utf-8').decode(slice);
  }
}

function sniffMime(b: Uint8Array): string {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  return 'image/jpeg';
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(s);
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
    title = decodeText(rec0.subarray(fullNameOff, fullNameOff + fullNameLen), encoding);
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

  // decompress text records
  const textParts: Uint8Array[] = [];
  const rec0Text = rec0.subarray(textStart);
  if (rec0Text.length > 0) textParts.push(rec0Text);

  const last = Math.min(lastContent || firstContent || numRecords - 1, numRecords - 1);
  for (let r = Math.max(1, firstContent); r <= last; r++) {
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

  // concatenate
  let total = 0;
  for (const p of textParts) total += p.length;
  const all = new Uint8Array(total);
  let pos = 0;
  for (const p of textParts) {
    all.set(p, pos);
    pos += p.length;
  }

  let text = decodeText(all, encoding);

  // mobi markup → html
  text = text.replace(/\x00/g, '');
  text = text.replace(/\x1b/g, '');
  text = text.replace(/<mbp:pagebreak\s*\/?>/gi, '<div class="mbp-pagebreak"></div>');
  text = text.replace(/<mbp:section\b[^>]*\/?>/gi, '<div class="mbp-section"></div>');

  // inline images
  text = text.replace(/<img[^>]*recindex=["']?(\d+)["']?[^>]*\/?>/gi, (m, idx: string) => {
    const n = firstImage + parseInt(idx);
    if (n >= 0 && n < numRecords) {
      const off = recOffsets[n];
      const end = n + 1 < numRecords ? recOffsets[n + 1] : buf.byteLength;
      const rec = new Uint8Array(buf, off, end - off);
      const imgOff = dv.getUint32(off, false) || 8;
      const imgLen = dv.getUint32(off + 4, false) || rec.length - 8;
      if (imgOff >= 0 && imgLen > 0 && imgOff + imgLen <= rec.length) {
        const img = rec.subarray(imgOff, imgOff + imgLen);
        return `<img src="data:${sniffMime(img)};base64,${toBase64(img)}" style="max-width:100%;" />`;
      }
    }
    return '';
  });

  return {title, html: text, totalChars: text.length};
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
        inner.innerHTML = parsed.html;

        // initial scroll to saved progress
        if (book.read_progress > 1) {
          container.scrollTop = (container.scrollHeight - container.clientHeight) * (book.read_progress / 100);
        }

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
