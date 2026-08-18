import React, {forwardRef, useEffect, useImperativeHandle, useRef} from 'react';
import ePub, {Book as EpubBook, Rendition} from 'epubjs';
import type {Book} from '../types';
import type {ReaderHandle} from './Reader';
import {base64ToArrayBuffer, App} from '../api';

interface Props {
  book: Book;
  data: string;
  fontSize: number;
  theme: string;
  onProgress: (loc: string, page: number, total: number, pct: number) => void;
  onActivity: () => void;
}

const ReaderEpub = forwardRef<ReaderHandle, Props>(function ReaderEpub(
  {book, data, fontSize, theme, onProgress, onActivity},
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const onProgressRef = useRef(onProgress);
  const onActivityRef = useRef(onActivity);
  const noteAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onProgressRef.current = onProgress;
    onActivityRef.current = onActivity;
  }, [onProgress, onActivity]);

  useEffect(() => {
    let alive = true;
    const buf = base64ToArrayBuffer(data);
    const epub = ePub(buf);
    bookRef.current = epub;
    const rendition = epub.renderTo(containerRef.current as HTMLElement, {
      width: '100%',
      height: '100%',
      spread: 'none',
      flow: 'paginated',
      allowScriptedContent: false,
    });
    renditionRef.current = rendition;

    rendition.on('relocated', (location: any) => {
      if (!location || !location.start) return;
      const cfi = location.start.cfi;
      const total = location.total;
      const current = location.start.displayed.page;
      const pct = (location.start.percentage ?? 0) * 100;
      onProgressRef.current(cfi, current, total, Math.max(0, Math.min(100, pct)));
    });

    // selection → note
    rendition.on('selected', (cfiRange: string, contents: any) => {
      const sel = contents.window.getSelection();
      const quote = sel ? sel.toString().trim() : '';
      if (!quote) return;
      openNotePopup(cfiRange, quote);
    });

    // theme
    rendition.themes.override('color', theme === 'dark' ? '#d6d8dd' : theme === 'sepia' ? '#4a3b2a' : '#2b2f3a');
    rendition.themes.override('background', theme === 'dark' ? '#1c1e22' : theme === 'sepia' ? '#f3ead8' : '#f7f6f2');
    rendition.themes.fontSize(fontSize + 'px');

    const start = async () => {
      try {
        if (book.current_location) {
          await rendition.display(book.current_location);
        } else {
          await rendition.display();
        }
      } catch {
        await rendition.display();
      }
      if (!alive) return;
      // focus so arrow keys work
      const iframe = containerRef.current?.querySelector('iframe');
      if (iframe) iframe.setAttribute('tabindex', '0');
    };
    start();

    return () => {
      alive = false;
      if (noteAnchorRef.current) noteAnchorRef.current.remove();
      try {
        rendition.destroy();
      } catch {
        /* noop */
      }
      try {
        epub.destroy();
      } catch {
        /* noop */
      }
      bookRef.current = null;
      renditionRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, data]);

  useEffect(() => {
    renditionRef.current?.themes.fontSize(fontSize + 'px');
  }, [fontSize]);

  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    const overrides: Record<string, string> =
      theme === 'dark'
        ? {color: '#d6d8dd', background: '#1c1e22'}
        : theme === 'sepia'
          ? {color: '#4a3b2a', background: '#f3ead8'}
          : {color: '#2b2f3a', background: '#f7f6f2'};
    r.themes.override('color', overrides.color);
    r.themes.override('background', overrides.background);
  }, [theme]);

  function openNotePopup(cfi: string, quote: string) {
    const existing = noteAnchorRef.current;
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.style.cssText =
      'position:absolute;right:16px;top:64px;z-index:30;background:#fff;border:1px solid #e4e6f0;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.2);padding:12px;width:300px;display:flex;flex-direction:column;gap:8px;';
    div.innerHTML = `
      <div style="font-size:12px;color:#6b7280;font-style:italic;max-height:70px;overflow:auto;border-left:3px solid #5b7cfa;padding-left:8px;">“${escapeHtml(quote.slice(0, 300))}”</div>
      <textarea placeholder="写下你的想法..." rows="3" style="width:100%;border:1px solid #e4e6f0;border-radius:8px;padding:8px;font-size:13px;font-family:inherit;"></textarea>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="bm-note-cancel" style="padding:5px 10px;border-radius:7px;font-size:12px;background:#f3f4f8;">取消</button>
        <button class="bm-note-save" style="padding:5px 10px;border-radius:7px;font-size:12px;background:#5b7cfa;color:#fff;">保存笔记</button>
      </div>`;
    div.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      if (target.classList.contains('bm-note-cancel')) div.remove();
      if (target.classList.contains('bm-note-save')) {
        const ta = div.querySelector('textarea') as HTMLTextAreaElement;
        const content = ta.value.trim();
        if (content) {
          App.CreateNote(book.id, content, cfi, '', quote.slice(0, 500)).catch(() => {});
        }
        div.remove();
      }
    });
    document.body.appendChild(div);
    noteAnchorRef.current = div;
    const ta = div.querySelector('textarea') as HTMLTextAreaElement;
    if (ta) ta.focus();
    onActivityRef.current();
  }

  useImperativeHandle(ref, () => ({
    goNext: () => {
      renditionRef.current?.next();
      onActivityRef.current();
    },
    goPrev: () => {
      renditionRef.current?.prev();
      onActivityRef.current();
    },
    getProgress: () => {
      const loc = renditionRef.current?.currentLocation();
      return loc?.start?.percentage ? loc.start.percentage * 100 : 0;
    },
    getPageInfo: () => {
      const loc = renditionRef.current?.currentLocation();
      if (!loc?.start) return {page: 0, total: 0, location: ''};
      return {
        page: loc.start.displayed.page || 0,
        total: loc.total || 0,
        location: loc.start.cfi || '',
      };
    },
    destroy: () => {
      /* handled by effect cleanup */
    },
  }));

  return (
    <div style={{position: 'relative', width: '100%', height: '100%'}}>
      <div ref={containerRef} id="epub-view" />
      <div className="reader-nav-overlay left" onClick={() => renditionRef.current?.prev()} />
      <div className="reader-nav-overlay right" onClick={() => renditionRef.current?.next()} />
    </div>
  );
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default ReaderEpub;
