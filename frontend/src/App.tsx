import React, {useCallback, useEffect, useRef, useState} from 'react';
import './style.css';
import type {Book, Settings, Stats, Tag} from './types';
import {App as Backend} from './api';
import Sidebar from './components/Sidebar';
import Bookshelf from './components/Bookshelf';
import ReadingPage from './components/ReadingPage';
import StatsPage from './components/StatsPage';
import SettingsPage from './components/SettingsPage';
import ScanDialog from './components/ScanDialog';
import BookDetail from './components/BookDetail';
import TagManager from './components/TagManager';
import MisrecordManager from './components/MisrecordManager';
import Reader from './components/Reader';
import {useToast} from './components/Toast';

export type Page = 'bookshelf' | 'reading' | 'stats' | 'settings';

interface AppState {
  page: Page;
  books: Book[];
  loading: boolean;
  keyword: string;
  formats: string[];
  tagFilter: number[];
  sort: string;
  desc: boolean;
  tags: Tag[];
  settings: Settings;
  stats: Stats | null;
  showScan: boolean;
  showTags: boolean;
  showMisrecords: boolean;
  detailBook: Book | null;
  reading: Book | null;
}

export default function App() {
  const toast = useToast();
  const [st, setSt] = useState<AppState>({
    page: 'bookshelf',
    books: [],
    loading: true,
    keyword: '',
    formats: [],
    tagFilter: [],
    sort: 'created',
    desc: true,
    tags: [],
    settings: {},
    stats: null,
    showScan: false,
    showTags: false,
    showMisrecords: false,
    detailBook: null,
    reading: null,
  });
  const queryRef = useRef<{keyword: string; formats: string[]; tagFilter: number[]; sort: string; desc: boolean}>({
    keyword: '',
    formats: [],
    tagFilter: [],
    sort: 'created',
    desc: true,
  });

  const loadBooks = useCallback(async () => {
    const q = queryRef.current;
    try {
      const books = await Backend.GetBooks({
        keyword: q.keyword,
        formats: q.formats,
        tag_ids: q.tagFilter,
        sort: q.sort,
        desc: q.desc,
        misrecord: false,
        limit: 0,
        offset: 0,
      });
      setSt((s) => ({...s, books: books ?? [], loading: false}));
    } catch (e) {
      setSt((s) => ({...s, loading: false}));
      toast.err(String(e));
    }
  }, [toast]);

  const loadTags = useCallback(async () => {
    try {
      const tags = await Backend.ListTags();
      setSt((s) => ({...s, tags: tags ?? []}));
    } catch {
      /* ignore */
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const stats = await Backend.GetStats();
      setSt((s) => ({...s, stats}));
    } catch {
      /* ignore */
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await Backend.GetSettings();
      setSt((s) => ({...s, settings}));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadBooks();
    loadTags();
    loadStats();
    loadSettings();
    const onOpenScan = () => setSt((s) => ({...s, showScan: true}));
    window.addEventListener('open-scan', onOpenScan);
    return () => window.removeEventListener('open-scan', onOpenScan);
  }, [loadBooks, loadTags, loadStats, loadSettings]);

  // Apply the app-wide UI theme (light / dark / follow-system).
  useEffect(() => {
    const mode = st.settings.ui_theme || 'system';
    const apply = async () => {
      let dark = mode === 'dark';
      if (mode === 'system') {
        // WebView2's prefers-color-scheme does not track the OS reliably when
        // the GPU is disabled; ask the backend for the real system value.
        try {
          dark = await Backend.GetSystemDarkMode();
        } catch {
          dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
      }
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      Backend.SetUiTheme(mode);
    };
    apply();
    if (mode === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onMq = () => apply();
      mq.addEventListener('change', onMq);
      const iv = window.setInterval(apply, 5000); // poll OS theme changes
      return () => { mq.removeEventListener('change', onMq); window.clearInterval(iv); };
    }
  }, [st.settings.ui_theme]);

  const applyQuery = useCallback((patch: Partial<{keyword: string; formats: string[]; tagFilter: number[]; sort: string; desc: boolean}>) => {
    queryRef.current = {...queryRef.current, ...patch};
    setSt((s) => ({
      ...s,
      keyword: queryRef.current.keyword,
      formats: queryRef.current.formats,
      tagFilter: queryRef.current.tagFilter,
      sort: queryRef.current.sort,
      desc: queryRef.current.desc,
      loading: true,
    }));
    loadBooks();
  }, [loadBooks]);

  const refreshAll = useCallback(() => {
    loadBooks();
    loadTags();
    loadStats();
  }, [loadBooks, loadTags, loadStats]);

  const openBook = useCallback((b: Book) => {
    setSt((s) => ({...s, reading: b, detailBook: null}));
  }, []);

  const closeReader = useCallback(() => {
    setSt((s) => ({...s, reading: null}));
    loadBooks();
    loadStats();
  }, [loadBooks, loadStats]);

  return (
    <div className="app">
      {!st.reading && (
        <>
          <Sidebar
            page={st.page}
            onNav={(page) => setSt((s) => ({...s, page}))}
            stats={st.stats}
          />
          <div className="main">
            {st.page === 'bookshelf' && (
              <Bookshelf
                books={st.books}
                loading={st.loading}
                count={st.stats?.total_books ?? 0}
                keyword={st.keyword}
                formats={st.formats}
                tagFilter={st.tagFilter}
                sort={st.sort}
                desc={st.desc}
                tags={st.tags}
                onKeyword={(v) => applyQuery({keyword: v})}
                onFormats={(v) => applyQuery({formats: v})}
                onTagFilter={(v) => applyQuery({tagFilter: v})}
                onSort={(v, desc) => applyQuery({sort: v, desc})}
                onOpen={openBook}
                onDetail={(b) => setSt((s) => ({...s, detailBook: b}))}
                onRefresh={refreshAll}
                onScan={() => setSt((s) => ({...s, showScan: true}))}
                onTags={() => setSt((s) => ({...s, showTags: true}))}
              />
            )}
            {st.page === 'reading' && <ReadingPage onOpen={openBook} />}
            {st.page === 'stats' && (
              <StatsPage
                stats={st.stats}
                onOpen={openBook}
                onMisrecords={() => setSt((s) => ({...s, showMisrecords: true}))}
              />
            )}
            {st.page === 'settings' && (
              <SettingsPage
                settings={st.settings}
                onSaved={(s) => {
                  setSt((prev) => ({...prev, settings: s}));
                  toast.ok('设置已保存');
                }}
              />
            )}
          </div>
        </>
      )}

      {st.reading && <Reader book={st.reading} settings={st.settings} onClose={closeReader} />}

      {st.showScan && (
        <ScanDialog
          settings={st.settings}
          onClose={() => setSt((s) => ({...s, showScan: false}))}
          onDone={(added) => {
            setSt((s) => ({...s, showScan: false}));
            if (added > 0) {
              toast.ok(`扫描完成，新增 ${added} 本书`);
            }
            refreshAll();
          }}
        />
      )}

      {st.showTags && (
        <TagManager
          tags={st.tags}
          onClose={() => setSt((s) => ({...s, showTags: false}))}
          onChanged={() => {
            loadTags();
            refreshAll();
          }}
        />
      )}

      {st.showMisrecords && (
        <MisrecordManager
          onClose={() => setSt((s) => ({...s, showMisrecords: false}))}
          onChanged={() => {
            loadStats();
            refreshAll();
          }}
        />
      )}

      {st.detailBook && (
        <BookDetail
          book={st.detailBook}
          tags={st.tags}
          onClose={() => setSt((s) => ({...s, detailBook: null}))}
          onChanged={(updated) => {
            setSt((s) => ({...s, detailBook: updated}));
            refreshAll();
          }}
          onOpen={() => {
            const b = st.detailBook;
            setSt((s) => ({...s, reading: b, detailBook: null}));
          }}
          onMisrecord={() => {
            setSt((s) => ({...s, detailBook: null}));
            refreshAll();
          }}
        />
      )}

      <ToastWrap toast={toast} />
    </div>
  );
}

function ToastWrap({toast}: {toast: ReturnType<typeof useToast>}) {
  return (
    <div className="toast-wrap">
      {toast.items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}
