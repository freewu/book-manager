import React, {useEffect, useState} from 'react';
import type {Book, Tag} from '../types';
import {getCoverDataUrl} from '../api';

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
  ['created', '入库时间'],
  ['title', '书名'],
  ['author', '作者'],
  ['rating', '豆瓣评分'],
  ['last_read', '最近阅读'],
  ['size', '文件大小'],
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
        <span className="title">书架</span>
        <span className="info">
          共 {books.length} 本{count > books.length ? ` / ${count} 本藏书` : ''}
        </span>
        <span className="spacer" />
        <div className="search-box toolbar-search">
          <input
            placeholder="搜索书名 / 作者 / 出版社..."
            value={keyword}
            onChange={(e) => onKeyword(e.target.value)}
          />
        </div>
        <select className="toolbar-select" value={sort} onChange={(e) => onSort(e.target.value, desc)}>
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button
          className={`btn btn-soft btn-sm ${desc ? 'active' : ''}`}
          title={desc ? '降序' : '升序'}
          onClick={() => onSort(sort, !desc)}
        >
          {desc ? '↓ 降序' : '↑ 升序'}
        </button>
        <button className="btn btn-soft btn-sm" onClick={onTags}>
          🏷️ 标签管理
        </button>
        <button className="btn btn-soft btn-sm" onClick={onRefresh}>
          ↻ 刷新
        </button>
        <button className="btn btn-primary btn-sm" onClick={onScan}>
          🔍 扫描
        </button>
      </div>

      {(formats.length > 0 || tagFilter.length > 0 || tags.length > 0) && (
        <div className="filter-bar">
          <span className="filter-label">格式</span>
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
            标签
          </span>
          {tags.length === 0 ? (
            <span className="filter-empty">暂无标签，在书本详情中添加</span>
          ) : (
            <div className="chip-row tag-chips">
              {tags.map((t) => (
                <button
                  key={t.id}
                  className={`chip ${tagFilter.includes(t.id) ? 'active' : ''}`}
                  onClick={() => toggleTag(t.id)}
                >
                  <span className="tag-dot" style={{background: t.color}} />
                  {t.name}
                  <span className="chip-cnt">{t.book_count}</span>
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
              ✕ 清除筛选
            </button>
          )}
        </div>
      )}

      {loading && books.length === 0 ? (
        <div className="empty">
          <div className="big-icon">⏳</div>
          <h2>正在加载...</h2>
        </div>
      ) : books.length === 0 ? (
        <div className="empty">
          <div className="big-icon">📚</div>
          <h2>{activeFilterCount > 0 || keyword ? '没有符合条件的书籍' : '书架空空如也'}</h2>
          {activeFilterCount === 0 && !keyword && (
            <>
              <p>
                扫描你电脑中的电子书目录（支持 EPUB、PDF、MOBI、AZW3、KEPUB 等格式），
                书籍信息会自动保存到本地数据库，并可从豆瓣获取封面与评分。
              </p>
              <button className="btn btn-primary" onClick={onScan}>
                🔍 开始扫描
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
        {progress >= 99.5 && <div className="readmark">✅ 已读完</div>}
        <div className="book-hover-actions" onClick={(e) => e.stopPropagation()}>
          <button title="详情 / 豆瓣 / 笔记" onClick={onDetail}>
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
