import React, {useEffect, useState} from 'react';
import type {Book, Tag} from '../types';
import {getCoverDataUrl} from '../api';
import {useI18n} from '../i18n';

interface Props {
  books: Book[];
  loading: boolean;
  count: number;
  keyword: string;
  formats: string[];
  tagFilter: number[];
  sort: string;
  desc: boolean;
  tags: Tag[];
  onKeyword: (v: string) => void;
  onFormats: (v: string[]) => void;
  onTagFilter: (v: number[]) => void;
  onSort: (v: string, desc: boolean) => void;
  onOpen: (b: Book) => void;
  onDetail: (b: Book) => void;
  onRefresh: () => void;
  onScan: () => void;
  onTags: () => void;
}

const FORMATS = [
  {key: 'epub', label: 'EPUB'},
  {key: 'pdf', label: 'PDF'},
  {key: 'mobi', label: 'MOBI'},
  {key: 'azw3', label: 'AZW3'},
  {key: 'kepub', label: 'KEPUB'},
];

const SORTS: [string, string][] = [
  ['created', 'sort.created'],
  ['title', 'sort.title'],
  ['author', 'sort.author'],
  ['rating', 'sort.rating'],
  ['last_read', 'sort.last_read'],
  ['size', 'sort.size'],
];

export default function Bookshelf({
  books,
  loading,
  count,
  keyword,
  formats,
  tagFilter,
  sort,
  desc,
  tags,
  onKeyword,
  onFormats,
  onTagFilter,
  onSort,
  onOpen,
  onDetail,
  onRefresh,
  onScan,
  onTags,
}: Props) {
  const {t} = useI18n();
  const [covers, setCovers] = useState<Record<number, string | null>>({});

  useEffect(() => {
    const map: Record<number, string | null> = {};
    let alive = true;
    (async () => {
      for (const b of books.slice(0, 200)) {
        if (!b.has_cover) continue;
        const url = await getCoverDataUrl(b.id);
        if (!alive) return;
        if (url) map[b.id] = url;
      }
      if (alive) setCovers(map);
    })();
    return () => {
      alive = false;
    };
  }, [books]);

  const toggleFormat = (f: string) => {
    if (formats.includes(f)) {
      onFormats(formats.filter((x) => x !== f));
    } else {
      onFormats([...formats, f]);
    }
  };
  const toggleTag = (id: number) => {
    if (tagFilter.includes(id)) {
      onTagFilter(tagFilter.filter((x) => x !== id));
    } else {
      onTagFilter([...tagFilter, id]);
    }
  };

  const activeFilterCount = formats.length + tagFilter.length;

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">{t('bookshelf.title')}</span>
        <span className="info">
          {t('bookshelf.count', {n: books.length})}
          {count > books.length ? t('bookshelf.total', {n: count}) : ''}
        </span>
        <span className="spacer" />
        <div className="search-box toolbar-search">
          <input
            placeholder={t('bookshelf.searchPlaceholder')}
            value={keyword}
            onChange={(e) => onKeyword(e.target.value)}
          />
        </div>
        <select className="toolbar-select" value={sort} onChange={(e) => onSort(e.target.value, desc)}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {t(l)}
            </option>
          ))}
        </select>
        <button
          className={`btn btn-soft btn-sm ${desc ? 'active' : ''}`}
          title={desc ? t('sort.desc') : t('sort.asc')}
          onClick={() => onSort(sort, !desc)}
        >
          {desc ? t('sort.descShort') : t('sort.ascShort')}
        </button>
        <button className="btn btn-soft btn-sm" onClick={onTags}>
          {t('tag.manage')}
        </button>
        <button className="btn btn-soft btn-sm" onClick={onRefresh}>
          {t('btn.refresh')}
        </button>
        <button className="btn btn-primary btn-sm" onClick={onScan}>
          {t('btn.scan')}
        </button>
      </div>

      {(formats.length > 0 || tagFilter.length > 0 || tags.length > 0) && (
        <div className="filter-bar">
          <span className="filter-label">{t('filter.format')}</span>
          <div className="chip-row">
            {FORMATS.map((f) => (
              <button
                key={f.key}
                className={`chip ${formats.includes(f.key) ? 'active' : ''}`}
                onClick={() => toggleFormat(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <span className="filter-label" style={{marginLeft: 16}}>
            {t('filter.tag')}
          </span>
          {tags.length === 0 ? (
            <span className="filter-empty">{t('filter.noTags')}</span>
          ) : (
            <div className="chip-row tag-chips">
              {tags.map((tg) => (
                <button
                  key={tg.id}
                  className={`chip ${tagFilter.includes(tg.id) ? 'active' : ''}`}
                  onClick={() => toggleTag(tg.id)}
                >
                  <span className="tag-dot" style={{background: tg.color}} />
                  {tg.name}
                  <span className="chip-cnt">{tg.book_count}</span>
                </button>
              ))}
            </div>
          )}
          {activeFilterCount > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                onFormats([]);
                onTagFilter([]);
              }}
            >
              {t('filter.clear')}
            </button>
          )}
        </div>
      )}

      {loading && books.length === 0 ? (
        <div className="empty">
          <div className="big-icon">⏳</div>
          <h2>{t('loading')}</h2>
        </div>
      ) : books.length === 0 ? (
        <div className="empty">
          <div className="big-icon">📚</div>
          <h2>{activeFilterCount > 0 || keyword ? t('empty.noMatch') : t('empty.shelf')}</h2>
          {activeFilterCount === 0 && !keyword && (
            <>
              <p>{t('empty.intro')}</p>
              <button className="btn btn-primary" onClick={onScan}>
                {t('empty.startScan')}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="shelf">
          <div className="book-grid">
            {books.map((b) => (
              <BookCard key={b.id} book={b} cover={covers[b.id] ?? null} onOpen={() => onOpen(b)} onDetail={() => onDetail(b)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BookCard({book, cover, onOpen, onDetail}: {book: Book; cover: string | null; onOpen: () => void; onDetail: () => void}) {
  const {t} = useI18n();
  const fmt = book.format.toUpperCase();
  const progress = Math.round(book.read_progress * 10) / 10;

  return (
    <div className="book-card" onClick={onOpen}>
      <div className="book-cover">
        {cover ? (
          <img src={cover} alt={book.title} loading="lazy" />
        ) : (
          <div className="placeholder">
            <span className="fmt-badge">{fmt}</span>
            <span className="title-text">{book.title}</span>
            {book.author && <span style={{fontSize: 11, color: 'var(--text-3)'}}>{book.author}</span>}
          </div>
        )}
        {book.douban_rating > 0 && (
          <div className="rating-badge">⭐ {book.douban_rating.toFixed(1)}</div>
        )}
        {progress > 0 && (
          <div className="progress-wrap">
            <div className="bar" style={{width: `${Math.min(progress, 100)}%`}} />
          </div>
        )}
        {progress >= 99.5 && <div className="readmark">{t('book.done')}</div>}
        <div className="book-hover-actions" onClick={(e) => e.stopPropagation()}>
          <button title={t('book.detailTip')} onClick={onDetail}>
            ℹ️
          </button>
        </div>
      </div>
      <div className="book-meta">
        <div className="bt">{book.title}</div>
        <div className="ba">{book.author || book.file_name}</div>
      </div>
    </div>
  );
}
