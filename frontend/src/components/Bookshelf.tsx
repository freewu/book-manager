import React, {useEffect, useState} from 'react';
import type {Book} from '../types';
import {App, getCoverDataUrl} from '../api';

interface Props {
  books: Book[];
  loading: boolean;
  count: number;
  onOpen: (b: Book) => void;
  onDetail: (b: Book) => void;
  onRefresh: () => void;
}

export default function Bookshelf({books, loading, count, onOpen, onDetail, onRefresh}: Props) {
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

  if (loading && books.length === 0) {
    return (
      <div className="main">
        <div className="empty">
          <div className="big-icon">⏳</div>
          <h2>正在加载...</h2>
        </div>
      </div>
    );
  }

  if (books.length === 0) {
    return (
      <div className="main">
        <div className="toolbar">
          <span className="title">书架</span>
          <span className="spacer" />
          <span className="info">{count} 本藏书</span>
        </div>
        <div className="empty">
          <div className="big-icon">📚</div>
          <h2>书架空空如也</h2>
          <p>
            扫描你电脑中的电子书目录（支持 EPUB、PDF、MOBI、AZW3、KEPUB 等格式），
            书籍信息会自动保存到本地数据库，并可从豆瓣获取封面与评分。
          </p>
          <button className="btn btn-primary" onClick={() => window.dispatchEvent(new CustomEvent('open-scan'))}>
            🔍 开始扫描
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">书架</span>
        <span className="info">
          共 {books.length} 本{count > books.length ? ` / ${count} 本藏书` : ''}
        </span>
        <span className="spacer" />
        <button className="btn btn-soft btn-sm" onClick={onRefresh}>
          ↻ 刷新
        </button>
      </div>
      <div className="shelf">
        <div className="book-grid">
          {books.map((b) => (
            <BookCard key={b.id} book={b} cover={covers[b.id] ?? null} onOpen={() => onOpen(b)} onDetail={() => onDetail(b)} />
          ))}
        </div>
      </div>
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
