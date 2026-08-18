import React, {useEffect, useState} from 'react';
import type {Book} from '../types';
import {App, getCoverDataUrl, humanDuration, fmtDateTime} from '../api';

interface Props {
  onOpen: (b: Book) => void;
}

export default function ReadingPage({onOpen}: Props) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [covers, setCovers] = useState<Record<number, string | null>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = await App.GetBooks({
          keyword: '',
          formats: [],
          tag_ids: [],
          sort: 'last_read',
          desc: true,
          misrecord: false,
          limit: 0,
          offset: 0,
        });
        if (!alive) return;
        const inProgress = (all ?? []).filter((b) => b.read_progress > 0);
        setBooks(inProgress);
        const map: Record<number, string | null> = {};
        for (const b of inProgress.slice(0, 100)) {
          if (!b.has_cover) continue;
          const url = await getCoverDataUrl(b.id);
          if (!alive) return;
          if (url) map[b.id] = url;
        }
        if (alive) setCovers(map);
      } catch {
        if (alive) setBooks([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (books === null) {
    return (
      <div className="main">
        <div className="toolbar">
          <span className="title">阅读</span>
        </div>
        <div className="empty">
          <div className="big-icon">⏳</div>
          <h2>正在加载...</h2>
        </div>
      </div>
    );
  }

  const reading = books.filter((b) => b.read_progress < 99.5);
  const finished = books.filter((b) => b.read_progress >= 99.5);

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">阅读</span>
        <span className="info">
          在读 {reading.length} 本 · 已读完 {finished.length} 本
        </span>
      </div>

      {books.length === 0 ? (
        <div className="empty">
          <div className="big-icon">📖</div>
          <h2>还没有阅读记录</h2>
          <p>打开书架中的任意一本书，阅读进度会自动记录到这里。</p>
        </div>
      ) : (
        <div className="page-scroll">
          {reading.length > 0 && (
            <Section title="在读" books={reading} covers={covers} onOpen={onOpen} />
          )}
          {finished.length > 0 && (
            <Section title="已读完" books={finished} covers={covers} onOpen={onOpen} />
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  books,
  covers,
  onOpen,
}: {
  title: string;
  books: Book[];
  covers: Record<number, string | null>;
  onOpen: (b: Book) => void;
}) {
  return (
    <div className="page-section">
      <h2 className="page-section-title">{title}</h2>
      <div className="reading-grid">
        {books.map((b) => {
          const pct = Math.min(Math.round(b.read_progress * 10) / 10, 100);
          return (
            <div className="reading-card" key={b.id} onClick={() => onOpen(b)}>
              <div className="reading-cover">
                {covers[b.id] ? (
                  <img src={covers[b.id]!} alt={b.title} loading="lazy" />
                ) : (
                  <div className="placeholder">
                    <span className="fmt-badge">{b.format.toUpperCase()}</span>
                    <span className="title-text">{b.title}</span>
                  </div>
                )}
                <div className="progress-wrap">
                  <div className="bar" style={{width: `${pct}%`}} />
                </div>
              </div>
              <div className="reading-meta">
                <div className="bt">{b.title}</div>
                <div className="ba">{b.author || b.file_name}</div>
                <div className="reading-progress">
                  <span className="rp-num">{pct}%</span>
                  {b.last_read_at && <span className="rp-time">上次阅读 {fmtDateTime(b.last_read_at)}</span>}
                </div>
                <div className="reading-foot">
                  <span className="rp-seconds">⏱ {humanDuration(b.total_read_seconds)}</span>
                  <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(b); }}>
                    {pct >= 99.5 ? '再看一遍' : '继续阅读'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
