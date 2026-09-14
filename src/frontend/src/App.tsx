import React, {useCallback, useEffect, useRef, useState} from 'react';
import './style.css';
import type {Book, Settings, Stats, Tag} from './types';
import {App as Backend} from './api';
import {EventsOn} from '../wailsjs/runtime/runtime';
import {I18nProvider, normalizeLang, translate} from './i18n';
import Sidebar from './components/Sidebar';
import Bookshelf, {type TagFilterMode} from './components/Bookshelf';
import ReadingPage from './components/ReadingPage';
import StatsPage from './components/StatsPage';
import ToolsPage from './components/ToolsPage';
import SettingsPage from './components/SettingsPage';
import BookDetail from './components/BookDetail';
import Reader from './components/Reader';
import {useToast} from './components/Toast';
import ToolHost, {type ActiveTool} from './tools/ToolHost';
import {getTool, getToolPage, toolRoute} from './tools';

export type Page = 'bookshelf' | 'reading' | 'tags' | 'misrecords' | 'stats' | 'tools' | 'settings';

interface AppState {
  page: Page;
  books: Book[];
  loading: boolean;
  keyword: string;
  formats: string[];
  tagFilter: number[];
  /** 书架多标签筛选的匹配方式（默认值来自设置里的「标签匹配方式」） */
  tagMode: TagFilterMode;
  sort: string;
  desc: boolean;
  tags: Tag[];
  settings: Settings;
  stats: Stats | null;
  /** 当前打开的工具（来自 src/tools/ 注册表） */
  tool: ActiveTool | null;
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
    tagMode: 'or',
    sort: 'created',
    desc: true,
    tags: [],
    settings: {},
    stats: null,
    tool: null,
    detailBook: null,
    reading: null,
  });
  const queryRef = useRef<{
    keyword: string;
    formats: string[];
    tagFilter: number[];
    tagMode: TagFilterMode;
    sort: string;
    desc: boolean;
  }>({
    keyword: '',
    formats: [],
    tagFilter: [],
    tagMode: 'or',
    sort: 'created',
    desc: true,
  });
  // 记住上一次生效过的设置值：设置里的「标签匹配方式」一变（含首次加载）就
  // 覆盖书架当前的选择；书架自己切的时候设置没变，所以手选不会被冲掉。
  const appliedTagModeSetting = useRef<string | null>(null);
  // 工具弹窗状态的最新值（给事件监听器读取，避免重新订阅）
  const toolRef = useRef<ActiveTool | null>(null);
  toolRef.current = st.tool;

  const loadBooks = useCallback(async () => {
    const q = queryRef.current;
    try {
      const books = await Backend.GetBooks({
        keyword: q.keyword,
        formats: q.formats,
        tag_ids: q.tagFilter,
        tag_mode: q.tagMode,
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
    const onOpenScan = () => setSt((s) => ({...s, tool: {id: 'scan'}}));
    window.addEventListener('open-scan', onOpenScan);
    // The tray menu can switch language; reload settings to re-render.
    const offLang = EventsOn('settings:changed', () => loadSettings());
    return () => {
      window.removeEventListener('open-scan', onOpenScan);
      offLang();
    };
  }, [loadBooks, loadTags, loadStats, loadSettings]);

  // 书架默认的「或 / 且」来自设置，默认为「或」。
  useEffect(() => {
    const raw = st.settings.tag_mode;
    if (raw === undefined) return; // 设置还没加载完
    if (appliedTagModeSetting.current === raw) return;
    appliedTagModeSetting.current = raw;
    const m: TagFilterMode = raw === 'and' ? 'and' : 'or';
    if (queryRef.current.tagMode === m) return;
    queryRef.current = {...queryRef.current, tagMode: m};
    setSt((s) => ({...s, tagMode: m}));
    loadBooks();
  }, [st.settings.tag_mode, loadBooks]);

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

  const applyQuery = useCallback((patch: Partial<{keyword: string; formats: string[]; tagFilter: number[]; tagMode: TagFilterMode; sort: string; desc: boolean}>) => {
    queryRef.current = {...queryRef.current, ...patch};
    setSt((s) => ({
      ...s,
      keyword: queryRef.current.keyword,
      formats: queryRef.current.formats,
      tagFilter: queryRef.current.tagFilter,
      tagMode: queryRef.current.tagMode,
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

  const lang = normalizeLang(st.settings.language);
  // 当前页面若是「整页工具」（如 tags），渲染它自己的组件。
  const PageTool = getToolPage(st.page)?.Page;

  // 豆瓣补全在后台继续跑：即使弹窗已关闭，完成后也要刷新书架并提示。
  useEffect(() => {
    const off = EventsOn('douban:done', () => {
      loadBooks();
      loadStats();
      if (!toolRef.current) toast.ok(translate(lang, 'tools.doubanDoneToast'));
    });
    return () => off();
  }, [loadBooks, loadStats, toast, lang]);

  // Async douban enrichment fired when a book is opened. On success the
  // editable metadata (title / author / publisher) is corrected to the douban
  // values; after 3 consecutive failures auto-retry stops until the user
  // manually edits the title (which resets the counter server-side).
  const triggerAutoEnrich = useCallback(
    (b: Book) => {
      (async () => {
        try {
          const updated = await Backend.AutoEnrichBook(b.id);
          if (!updated) return;
          if (updated.douban_url || updated.douban_rating > 0) {
            setSt((s) => ({
              ...s,
              books: s.books.map((x) => (x.id === updated.id ? updated : x)),
            }));
            toast.ok(translate(lang, 'detail.toastAutoEnriched', {t: updated.title}));
          } else if (updated.douban_fail_count >= 3) {
            toast.err(translate(lang, 'detail.toastAutoStopped'));
          }
        } catch {
          /* silent: enrich failures are counted server-side */
        }
      })();
    },
    [toast, lang],
  );

  // 工具入口统一走这里：整页工具（如「标签管理」）切页，其余弹窗。
  const openTool = useCallback((id: string, b?: Book | null) => {
    const route = toolRoute(getTool(id));
    if (route) {
      setSt((s) => ({...s, page: route as Page, tool: null}));
      return;
    }
    setSt((s) => ({...s, tool: {id, book: b ?? null}}));
  }, []);

  // 标签页点数量 → 书架，并按该标签筛选。
  const openTagShelf = useCallback(
    (tagIDs: number[]) => {
      setSt((s) => ({...s, page: 'bookshelf'}));
      applyQuery({tagFilter: tagIDs});
    },
    [applyQuery],
  );

  const openBook = useCallback((b: Book) => {
    setSt((s) => ({...s, reading: b, detailBook: null}));
    triggerAutoEnrich(b);
  }, [triggerAutoEnrich]);

  const closeReader = useCallback(() => {
    setSt((s) => ({...s, reading: null}));
    loadBooks();
    loadStats();
  }, [loadBooks, loadStats]);

  return (
    <I18nProvider lang={lang}>
      <div className="app">
        {!st.reading && (
          <>
            <Sidebar
              page={st.page}
              onNav={(page) => setSt((s) => ({...s, page}))}
              stats={st.stats}
              tagCount={st.tags.length}
              collapsed={st.settings.sidebar_collapsed === '1'}
              onToggleCollapsed={(c) => {
                setSt((s) => ({...s, settings: {...s.settings, sidebar_collapsed: c ? '1' : '0'}}));
                Backend.SetSettings({sidebar_collapsed: c ? '1' : '0'}).catch(() => {});
              }}
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
                  tagMode={st.tagMode}
                  sort={st.sort}
                  desc={st.desc}
                  tags={st.tags}
                  onKeyword={(v) => applyQuery({keyword: v})}
                  onFormats={(v) => applyQuery({formats: v})}
                  onTagFilter={(v) => applyQuery({tagFilter: v})}
                  onTagMode={(v) => applyQuery({tagMode: v})}
                  onSort={(v, desc) => applyQuery({sort: v, desc})}
                  onOpen={openBook}
                  onDetail={(b) => setSt((s) => ({...s, detailBook: b}))}
                  onRefresh={refreshAll}
                  onScan={() => setSt((s) => ({...s, tool: {id: 'scan'}}))}
                  onOpenTool={(id, b) => openTool(id, b)}
                />
              )}
              {st.page === 'reading' && <ReadingPage onOpen={openBook} />}
              {PageTool && (
                <PageTool tags={st.tags} onOpenShelf={openTagShelf} onChanged={refreshAll} />
              )}
              {st.page === 'stats' && (
                <StatsPage
                  stats={st.stats}
                  onOpen={openBook}
                  onMisrecords={() => openTool('misrecords')}
                />
              )}
              {st.page === 'tools' && (
                <ToolsPage
                  badges={{misrecords: st.stats?.total_misrecords ?? 0}}
                  onOpenTool={(id) => openTool(id)}
                />
              )}
              {st.page === 'settings' && (
                <SettingsPage
                  settings={st.settings}
                  onSaved={(s) => setSt((prev) => ({...prev, settings: s}))}
                />
              )}
            </div>
          </>
        )}

        {st.reading && <Reader book={st.reading} settings={st.settings} onClose={closeReader} />}

        <ToolHost
          tool={st.tool}
          settings={st.settings}
          tags={st.tags}
          onClose={() => setSt((s) => ({...s, tool: null}))}
          onChanged={refreshAll}
        />

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
              if (!b) return;
              setSt((s) => ({...s, reading: b, detailBook: null}));
              triggerAutoEnrich(b);
            }}
            onMisrecord={() => {
              setSt((s) => ({...s, detailBook: null}));
              refreshAll();
            }}
          />
        )}
      </div>
    </I18nProvider>
  );
}
