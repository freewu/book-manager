import React, {forwardRef, useEffect, useImperativeHandle, useRef} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {Book} from '../types';
import type {ReaderHandle} from './Reader';
import {base64ToArrayBuffer} from '../api';

// vite bundles the worker as an asset
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface Props {
  book: Book;
  data: string;
  onProgress: (loc: string, page: number, total: number, pct: number) => void;
  onActivity: () => void;
}

const SCALE = 1.4;

const ReaderPdf = forwardRef<ReaderHandle, Props>(function ReaderPdf(
  {book, data, onProgress, onActivity},
  ref,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pagesRef = useRef<number>(0);
  const currentPageRef = useRef(book.current_page || 1);
  const reportRef = useRef(onProgress);
  const activityRef = useRef(onActivity);

  useEffect(() => {
    reportRef.current = onProgress;
    activityRef.current = onActivity;
  }, [onProgress, onActivity]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const buf = base64ToArrayBuffer(data);
        const doc = await pdfjsLib.getDocument({data: buf}).promise;
        if (!alive) {
          doc.destroy();
          return;
        }
        docRef.current = doc;
        pagesRef.current = doc.numPages;
        const container = scrollRef.current;
        if (!container) return;

        const renderPage = async (n: number) => {
          const page = await doc.getPage(n);
          const vp = page.getViewport({scale: SCALE});
          const wrap = document.createElement('div');
          wrap.className = 'pdf-page-wrap';
          wrap.dataset.page = String(n);
          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          wrap.appendChild(canvas);
          container.appendChild(wrap);
          const ctx = canvas.getContext('2d')!;
          await page.render({canvasContext: ctx, viewport: vp}).promise;
        };

        const loadPages = async () => {
          for (let n = 1; n <= doc.numPages; n++) {
            if (!alive) return;
            await renderPage(n);
          }
        };

        // lazy: render visible pages near the requested page, then background the rest
        const start = book.current_page && book.current_page > 1 ? book.current_page : 1;
        const preload = Math.max(1, start - 3);
        for (let n = preload; n <= Math.min(doc.numPages, start + 8); n++) {
          if (!alive) return;
          await renderPage(n);
        }
        if (alive) loadPages();

        // scroll to start page
        requestAnimationFrame(() => {
          const target = container.querySelector(`[data-page="${start}"]`) as HTMLElement | null;
          if (target) target.scrollIntoView({block: 'start'});
        });

        // scroll detection
        let ticking = false;
        const onScroll = () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            if (!container) return;
            const win = container.clientHeight;
            const mid = container.scrollTop + win / 2;
            const wraps = container.querySelectorAll('.pdf-page-wrap');
            let cur = 1;
            let best = Infinity;
            wraps.forEach((w) => {
              const el = w as HTMLElement;
              const d = Math.abs(el.offsetTop - mid);
              if (d < best) {
                best = d;
                cur = parseInt(el.dataset.page || '1');
              }
            });
            if (cur !== currentPageRef.current) {
              currentPageRef.current = cur;
              const pct = (cur / doc.numPages) * 100;
              reportRef.current(String(cur), cur, doc.numPages, Math.max(0, Math.min(100, pct)));
              activityRef.current();
            }
          });
        };
        container.addEventListener('scroll', onScroll, {passive: true});
        activityRef.current();
      } catch (e) {
        console.error('pdf load error', e);
      }
    })();
    return () => {
      alive = false;
      docRef.current?.destroy();
      docRef.current = null;
      if (scrollRef.current) scrollRef.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, data]);

  useImperativeHandle(ref, () => ({
    goNext: () => {
      const c = scrollRef.current;
      if (!c) return;
      const wraps = c.querySelectorAll('.pdf-page-wrap');
      const target = currentPageRef.current + 1;
      const el = wraps[target - 1] as HTMLElement | undefined;
      if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
      else c.scrollTop = c.scrollHeight;
      activityRef.current();
    },
    goPrev: () => {
      const c = scrollRef.current;
      if (!c) return;
      const wraps = c.querySelectorAll('.pdf-page-wrap');
      const target = currentPageRef.current - 1;
      const el = wraps[target - 1] as HTMLElement | undefined;
      if (el) el.scrollIntoView({behavior: 'smooth', block: 'start'});
      else c.scrollTop = 0;
      activityRef.current();
    },
    getProgress: () => {
      const n = pagesRef.current;
      if (!n) return 0;
      return (currentPageRef.current / n) * 100;
    },
    getPageInfo: () => ({
      page: currentPageRef.current,
      total: pagesRef.current,
      location: String(currentPageRef.current),
    }),
    destroy: () => {
      docRef.current?.destroy();
      docRef.current = null;
    },
  }));

  return <div ref={scrollRef} className="pdf-container" />;
});

export default ReaderPdf;
