import React, {useEffect, useState} from 'react';
import type {Book, ReadingSession, Stats} from '../types';
import {App, humanSize, humanDuration, fmtDateTime} from '../api';
import {useI18n} from '../i18n';

interface Props {
  stats: Stats | null;
  onOpen: (b: Book) => void;
  onMisrecords: () => void;
}

export default function StatsPage({stats, onOpen, onMisrecords}: Props) {
  const {t} = useI18n();
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
          <span className="title">{t('stats.title')}</span>
        </div>
        <div className="empty">
          <div className="big-icon">⏳</div>
          <h2>{t('loading')}</h2>
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
        <span className="title">{t('stats.title')}</span>
        <span className="spacer" />
        <button className="btn btn-soft btn-sm" onClick={onMisrecords}>
          {t('stats.misrecords')}
          {stats.total_misrecords > 0 && <span className="nav-badge mis-badge">{stats.total_misrecords}</span>}
        </button>
      </div>

      <div className="page-scroll">
        <div className="stats-grid">
          <StatCard icon="📚" label={t('stats.totalBooks')} value={String(stats.total_books)} />
          <StatCard icon="💾" label={t('stats.totalSize')} value={humanSize(stats.total_size)} />
          <StatCard icon="⏱️" label={t('stats.totalTime')} value={humanDuration(stats.total_read_seconds)} />
          <StatCard icon="📝" label={t('stats.notes')} value={String(stats.total_notes)} />
          <StatCard icon="📖" label={t('stats.reading')} value={String(stats.reading_books)} accent />
          <StatCard icon="✅" label={t('stats.finished')} value={String(stats.finished_books)} ok />
          <StatCard icon="🆕" label={t('stats.unread')} value={String(stats.unread_books)} />
          <StatCard icon="🚫" label={t('stats.misrecord')} value={String(stats.total_misrecords)} danger />
        </div>

        <div className="page-section">
          <h2 className="page-section-title">{t('stats.formats')}</h2>
          {fmtCounts.length === 0 ? (
            <p className="page-muted">{t('stats.noData')}</p>
          ) : (
            <div className="fmt-bars">
              {fmtCounts.map((f) => (
                <div className="fmt-row" key={f.fmt}>
                  <span className="fmt-name">{f.fmt}</span>
                  <div className="fmt-track">
                    <div className="fmt-fill" style={{width: `${(f.n / maxFmt) * 100}%`}} />
                  </div>
                  <span className="fmt-num">{t('stats.count', {n: f.n})}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {recentBooks.length > 0 && (
          <div className="page-section">
            <h2 className="page-section-title">{t('stats.recent')}</h2>
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
            <h2 className="page-section-title">{t('stats.sessions')}</h2>
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
