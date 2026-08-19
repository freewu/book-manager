import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {Book, Settings} from '../types';
import {App} from '../api';
import {useI18n} from '../i18n';
import ReaderEpub from './ReaderEpub';
import ReaderPdf from './ReaderPdf';
import ReaderMobi from './ReaderMobi';

interface Props {
  book: Book;
  settings: Settings;
  onClose: () => void;
}

export interface ReaderHandle {
  goNext: () => void;
  goPrev: () => void;
  getProgress: () => number; // 0-100
  getPageInfo: () => {page: number; total: number; location: string};
  destroy: () => void;
}

// Reading-time policy:
//   - accumulate active seconds while the user is reading
//   - if no page-turn / interaction happens for `idleLimit` seconds, stop counting
//   - any interaction (page turn / click / key / scroll) resets the idle timer
export default function Reader({book, settings, onClose}: Props) {
  const {t} = useI18n();
  const idleLimit = Math.max(10, parseInt(settings.idle_seconds || '60') || 60);
  const theme = settings.theme || 'light';

  const [data, setData] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState(18);
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState(book.read_progress || 0);
  const [pageInfo, setPageInfo] = useState({page: 0, total: 0});
  const [sessionSeconds, setSessionSeconds] = useState(0);

  const handleRef = useRef<ReaderHandle | null>(null);
  const lastActivity = useRef(Date.now());
  const activeSeconds = useRef(0);
  const tickTimer = useRef<number | null>(null);
  const reportTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setError('');
    App.GetBookData(book.id)
      .then((b64) => {
        if (alive) setData(b64);
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [book.id]);

  const markActivity = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  // 1-second ticker: count active seconds (respecting idle limit)
  useEffect(() => {
    if (!data) return;
    lastActivity.current = Date.now();
    tickTimer.current = window.setInterval(() => {
      const now = Date.now();
      const idle = now - lastActivity.current;
      if (idle <= idleLimit * 1000) {
        activeSeconds.current += 1;
      }
    }, 1000);
    reportTimer.current = window.setInterval(() => {
      const secs = activeSeconds.current;
      if (secs > 0) {
        activeSeconds.current = 0;
        const page = handleRef.current?.getPageInfo().page ?? 0;
        App.ReportReading(book.id, secs, page)
          .then((total) => {
            setSessionSeconds((s) => s + secs);
          })
          .catch(() => {});
      }
    }, 10000);
    return () => {
      if (tickTimer.current) window.clearInterval(tickTimer.current);
      if (reportTimer.current) window.clearInterval(reportTimer.current);
    };
  }, [data, book.id, idleLimit]);

  // flush remaining active seconds on close
  useEffect(() => {
    return () => {
      if (activeSeconds.current > 0) {
        App.ReportReading(book.id, activeSeconds.current, 0).catch(() => {});
      }
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
      }
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [book.id]);

  const saveProgress = useCallback(
    (loc: string, page: number, total: number, pct: number) => {
      setProgress(pct);
      setPageInfo({page, total});
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        App.SaveProgress(book.id, loc, page, total, pct).catch(() => {});
      }, 1200);
    },
    [book.id],
  );

  const goNext = useCallback(() => {
    markActivity();
    handleRef.current?.goNext();
  }, [markActivity]);

  const goPrev = useCallback(() => {
    markActivity();
    handleRef.current?.goPrev();
  }, [markActivity]);

  // keyboard navigation (page arrows)
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        onClose();
      } else {
        markActivity();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data, goNext, goPrev, markActivity, onClose]);

  if (error) {
    return (
      <div className="reader-root">
        <div className="reader-toolbar">
          <button onClick={onClose}>{t('reader.back')}</button>
          <span className="t-title">{book.title}</span>
        </div>
        <div className="empty">
          <div className="big-icon">⚠️</div>
          <h2>{t('reader.cannotOpen')}</h2>
          <p style={{wordBreak: 'break-all'}}>{error}</p>
          <button className="btn btn-primary" onClick={onClose}>
            {t('reader.back')}
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="reader-root">
        <div className="reader-toolbar">
          <button onClick={onClose}>{t('reader.back')}</button>
          <span className="t-title">{book.title}</span>
        </div>
        <div className="empty">
          <div className="big-icon">⏳</div>
          <h2>{t('reader.loading')}</h2>
        </div>
      </div>
    );
  }

  const format = book.format === 'kepub' ? 'epub' : book.format;

  return (
    <div
      className={`reader-root ${theme === 'dark' ? 'dark' : ''}`}
      onPointerDown={markActivity}
      onKeyDown={markActivity}
      tabIndex={-1}
    >
      <div className="reader-toolbar">
        <button onClick={goPrev}>{t('reader.prev')}</button>
        <button onClick={goNext}>{t('reader.next')}</button>
        <span className="t-title">{book.title}</span>
        <span className="t-progress">
          {pageInfo.total > 0 ? `${pageInfo.page}/${pageInfo.total}` : ''} · {progress.toFixed(1)}%
        </span>
        <span className="t-progress">{t('reader.session', {m: Math.round(sessionSeconds / 60)})}</span>
        <span className="spacer" />
        <button onClick={() => setShowSettings((v) => !v)}>Aa</button>
        <button onClick={onClose}>{t('reader.close')}</button>
      </div>

      <div className="reader-body" onClick={markActivity}>
        {format === 'epub' && (
          <ReaderEpub
            book={book}
            data={data}
            fontSize={fontSize}
            theme={theme}
            ref={handleRef as any}
            onProgress={saveProgress}
            onActivity={markActivity}
          />
        )}
        {format === 'pdf' && (
          <ReaderPdf
            book={book}
            data={data}
            ref={handleRef as any}
            onProgress={saveProgress}
            onActivity={markActivity}
          />
        )}
        {(format === 'mobi' || format === 'azw3') && (
          <ReaderMobi
            book={book}
            data={data}
            fontSize={fontSize}
            theme={theme}
            ref={handleRef as any}
            onProgress={saveProgress}
            onActivity={markActivity}
          />
        )}
      </div>

      {showSettings && (
        <div className="reader-settings-panel">
          <label>
            {t('reader.fontSize', {n: fontSize})}
            <input
              type="range"
              min={12}
              max={30}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
            />
          </label>
          <label>{t('reader.idleLimit', {n: idleLimit})}</label>
        </div>
      )}
    </div>
  );
}
