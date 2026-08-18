import React, {useEffect, useState} from 'react';
import type {Book, ReadingSession, Stats} from '../types';
import {App, humanSize, humanDuration, fmtDateTime} from '../api';

interface Props {
  stats: Stats | null;
  onOpen: (b: Book) => void;
  onMisrecords: () => void;
}

export default function StatsPage({stats, onOpen, onMisrecords}: Props) {
  const [sessions, setSessions] = useState<ReadingSession[]>([]);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [s, rb] = await Promise.all([
          App.ListReadingSessions(12),
          App.GetBooks({
            keyword: '',
            formats: [],
            tag_ids: [],
            sort: 'last_read',
            desc: true,
            misrecord: false,
            limit: 12,
            offset: 0,
          }),
        ]);
        if (!alive) return;
        setSessions(s ?? []);
        setRecentBooks((rb ?? []).filter((b) => b.read_progress > 0));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) {
    return (
      <div className="main">
        <div className="toolbar">
          <span className="title">统计</span>
        </div>
        <div className="empty">
          <div className="big-icon">⏳</div>
          <h2>正在加载...</h2>
        </div>
      </div>
    );
  }

  const fmtCounts = Object.entries(stats.format_counts ?? {})
    .map(([fmt, n]) => ({fmt: fmt.toUpperCase(), n}))
    .sort((a, b) => b.n - a.n);
  const maxFmt = Math.max(1, ...fmtCounts.map((f) => f.n));

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">统计</span>
        <span className="spacer" />
        <button className="btn btn-soft btn-sm" onClick={onMisrecords}>
          🚫 误录管理
          {stats.total_misrecords > 0 && <span className="nav-badge mis-badge">{stats.total_misrecords}</span>}
        </button>
      </div>

      <div className="page-scroll">
        <div className="stats-grid">
          <StatCard icon="📚" label="藏书" value={String(stats.total_books)} />
          <StatCard icon="💾" label="总大小" value={humanSize(stats.total_size)} />
          <StatCard icon="⏱️" label="累计阅读" value={humanDuration(stats.total_read_seconds)} />
          <StatCard icon="📝" label="笔记" value={String(stats.total_notes)} />
          <StatCard icon="📖" label="在读" value={String(stats.reading_books)} accent />
          <StatCard icon="✅" label="已读完" value={String(stats.finished_books)} ok />
          <StatCard icon="🆕" label="未读" value={String(stats.unread_books)} />
          <StatCard icon="🚫" label="误录" value={String(stats.total_misrecords)} danger />
        </div>

        <div className="page-section">
          <h2 className="page-section-title">格式分布</h2>
          {fmtCounts.length === 0 ? (
            <p className="page-muted">暂无数据</p>
          ) : (
            <div className="fmt-bars">
              {fmtCounts.map((f) => (
                <div className="fmt-row" key={f.fmt}>
                  <span className="fmt-name">{f.fmt}</span>
                  <div className="fmt-track">
                    <div className="fmt-fill" style={{width: `${(f.n / maxFmt) * 100}%`}} />
                  </div>
                  <span className="fmt-num">{f.n} 本</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {recentBooks.length > 0 && (
          <div className="page-section">
            <h2 className="page-section-title">最近阅读</h2>
            <div className="recent-list">
              {recentBooks.map((b) => {
                const pct = Math.min(Math.round(b.read_progress * 10) / 10, 100);
                return (
                  <div className="recent-item" key={b.id} onClick={() => onOpen(b)}>
                    <span className="recent-fmt">{b.format.toUpperCase()}</span>
                    <span className="recent-title">{b.title}</span>
                    <span className="recent-progress">
                      <div className="progress-wrap" style={{width: 90}}>
                        <div className="bar" style={{width: `${pct}%`}} />
                      </div>
                      <span className="rp-num">{pct}%</span>
                    </span>
                    {b.last_read_at && <span className="recent-time">{fmtDateTime(b.last_read_at)}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="page-section">
            <h2 className="page-section-title">阅读记录</h2>
            <div className="session-list">
              {sessions.map((s) => (
                <div className="session-item" key={s.id}>
                  <span className="session-icon">📖</span>
                  <span className="session-title">{s.book_title}</span>
                  <span className="session-dur">⏱ {humanDuration(s.seconds)}</span>
                  <span className="session-time">{fmtDateTime(s.start_time)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({icon, label, value, accent, ok, danger}: {icon: string; label: string; value: string; accent?: boolean; ok?: boolean; danger?: boolean}) {
  const cls = ['stat-card', accent ? 'accent' : '', ok ? 'ok' : '', danger ? 'danger' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="stat-card-icon">{icon}</div>
      <div className="stat-card-num">{value}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}
