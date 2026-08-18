import React, {useCallback, useState, useEffect} from 'react';
import type {Settings, Stats, Tag} from '../types';
import {App} from '../api';
import {humanSize, humanDuration} from '../api';
import logo from '../assets/logo.png';

interface Props {
  stats: Stats | null;
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
  onScan: () => void;
  onTags: () => void;
  onMisrecords: () => void;
  onSettings: () => void;
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

export default function Sidebar(p: Props) {
  const [version, setVersion] = useState('');
  useEffect(() => {
    App.GetVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);
  const toggleFormat = (f: string) => {
    if (p.formats.includes(f)) {
      p.onFormats(p.formats.filter((x) => x !== f));
    } else {
      p.onFormats([...p.formats, f]);
    }
  };

  const toggleTag = (id: number) => {
    if (p.tagFilter.includes(id)) {
      p.onTagFilter(p.tagFilter.filter((x) => x !== id));
    } else {
      p.onTagFilter([...p.tagFilter, id]);
    }
  };

  return (
    <aside className="sidebar">
      <div className="logo">
        <img className="icon" src={logo} alt="书架" />
        <div>
          书架
          <small>本地电子书管理</small>
        </div>
      </div>

      <div className="search-box">
        <input
          placeholder="搜索书名 / 作者 / 出版社..."
          value={p.keyword}
          onChange={(e) => p.onKeyword(e.target.value)}
        />
      </div>

      <div className="side-section">
        <h3>格式</h3>
        <div className="chip-row">
          {FORMATS.map((f) => (
            <button
              key={f.key}
              className={`chip ${p.formats.includes(f.key) ? 'active' : ''}`}
              onClick={() => toggleFormat(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="side-section">
        <h3>排序</h3>
        <select
          className="sort-select"
          value={p.sort}
          onChange={(e) => p.onSort(e.target.value, p.desc)}
        >
          {SORTS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <div style={{marginTop: 6}}>
          <button className={`chip ${p.desc ? 'active' : ''}`} onClick={() => p.onSort(p.sort, true)}>
            ↓ 降序
          </button>
          <button className={`chip ${!p.desc ? 'active' : ''}`} onClick={() => p.onSort(p.sort, false)}>
            ↑ 升序
          </button>
        </div>
      </div>

      <div className="side-section">
        <h3>标签</h3>
        {p.tags.length === 0 ? (
          <div style={{fontSize: 12, color: 'var(--text-3)'}}>暂无标签，在书本详情中添加</div>
        ) : (
          <div className="tag-list">
            {p.tags.map((t) => (
              <div
                key={t.id}
                className={`tag-item ${p.tagFilter.includes(t.id) ? 'active' : ''}`}
                onClick={() => toggleTag(t.id)}
              >
                <span className="tag-dot" style={{background: t.color}} />
                <span>{t.name}</span>
                <span className="cnt">{t.book_count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="side-section">
        <h3>统计</h3>
        {p.stats && (
          <div className="stats-strip">
            <div className="stat-box">
              <div className="num">{p.stats.total_books}</div>
              <div className="label">藏书</div>
            </div>
            <div className="stat-box">
              <div className="num">{humanSize(p.stats.total_size)}</div>
              <div className="label">总大小</div>
            </div>
            <div className="stat-box">
              <div className="num">{humanDuration(p.stats.total_read_seconds)}</div>
              <div className="label">累计阅读</div>
            </div>
            <div className="stat-box">
              <div className="num">{p.stats.total_notes}</div>
              <div className="label">笔记</div>
            </div>
            <div className="stat-box">
              <div className="num">{p.stats.reading_books}</div>
              <div className="label">在读</div>
            </div>
            <div className="stat-box">
              <div className="num">{p.stats.finished_books}</div>
              <div className="label">读完</div>
            </div>
          </div>
        )}
      </div>

      <div className="side-actions">
        <button className="action-btn primary" onClick={p.onScan}>
          <span className="icon">🔍</span> 扫描电子书目录
        </button>
        <button className="action-btn" onClick={p.onTags}>
          <span className="icon">🏷️</span> 标签管理
        </button>
        <button className="action-btn" onClick={p.onMisrecords}>
          <span className="icon">🚫</span> 误录管理
          {p.stats && p.stats.total_misrecords > 0 && (
            <span style={{marginLeft: 'auto', background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 999, padding: '1px 8px', fontSize: 11}}>
              {p.stats.total_misrecords}
            </span>
          )}
        </button>
        <button className="action-btn" onClick={p.onSettings}>
          <span className="icon">⚙️</span> 设置
        </button>
      </div>
      <div className="side-footer">
        <img className="icon" src={logo} alt="" />
        <span>书架 · 本地电子书管理</span>
        {version && <b>{version}</b>}
      </div>
    </aside>
  );
}
