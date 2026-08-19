import React, {forwardRef, useEffect, useImperativeHandle, useRef} from 'react';
import type {Book} from '../types';
import type {ReaderHandle} from './Reader';
import {App} from '../api';
import {useI18n} from '../i18n';
import {MOBI} from 'foliate-js/mobi.js';

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
  destroy?: () => void;
}

// `unzlib` is only used to decompress embedded FONT resources (rare). Provide
// a native fallback via DecompressionStream; on failure keep the raw bytes so
// the book still renders.
const unzlib = async (data: Uint8Array): Promise<Uint8Array> => {
  try {
    const copy = new Uint8Array(data);
    const stream = new Blob([copy as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return data;
  }
};

// ---------- mobi parsing via foliate-js ----------
// foliate-js implements a complete Mobipocket / KF8 (AZW3) parser:
// standard PalmDOC LZ77 decompression, Huff/CDIC, combo MOBI/KF8 files,
// trailing-entries handling and charset detection (UTF-8 / CP1252 / GBK ...).
// Each `section` corresponds to one `<mbp:pagebreak>` slice; we load every
// section's fully-resolved HTML document (embedded images already replaced
// with blob URLs) and concatenate their bodies into one scrollable stream.
async function parseMobi(buf: ArrayBuffer): Promise<ParsedMobi> {
  const mobi = new MOBI({unzlib} as never);
  const book = await mobi.open(new Blob([buf]));
  const title = (book as {metadata?: {title?: string}}).metadata?.title ?? '';
  const parts: string[] = [];
  for (const s of (book as {sections: Array<{load: () => Promise<string>}>}).sections) {
    const url = await s.load();
    const resp = await fetch(url);
    const html = await resp.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // keep the injected default stylesheet (blockquote margins etc.) and the
    // section body; drop scripts and the outer html wrapper
    const head = doc.head;
    const styles = head ? Array.from(head.querySelectorAll('style,link[rel="stylesheet"]')).map((n) => n.outerHTML).join('') : '';
    const body = doc.body;
    if (body) parts.push(styles + body.innerHTML);
  }
  const html = parts
    .join('<div class="mbp-pagebreak"></div>')
    .replace(/\ufffd/g, ' ')
    .replace(/\x00/g, '');
  return {
    title,
    html,
    destroy: () => {
      try {
        (book as {destroy?: () => void}).destroy?.();
      } catch {
        // ignore
      }
    },
  };
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
        // multi-MB HTML string via innerHTML blocks the main thread for
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
      try {
        parsedRef.current?.destroy?.();
      } catch {
        // ignore
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
