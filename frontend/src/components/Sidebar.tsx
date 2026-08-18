import React, {useEffect, useState} from 'react';
import type {Stats} from '../types';
import {App} from '../api';
import type {Page} from '../App';
import logo from '../assets/logo.png';

interface Props {
  page: Page;
  onNav: (page: Page) => void;
  stats: Stats | null;
}

const NAV: {key: Page; icon: string; label: string; hint?: (s: Stats | null) => string | null}[] = [
  {key: 'bookshelf', icon: '📚', label: '书架'},
  {
    key: 'reading',
    icon: '📖',
    label: '阅读',
    hint: (s) => (s && s.reading_books > 0 ? String(s.reading_books) : null),
  },
  {key: 'stats', icon: '📊', label: '统计'},
  {key: 'settings', icon: '⚙️', label: '设置'},
];

export default function Sidebar({page, onNav, stats}: Props) {
  const [version, setVersion] = useState('');
  useEffect(() => {
    App.GetVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);

  return (
    <aside className="sidebar">
      <div className="logo">
        <img className="icon" src={logo} alt="book-manager" />
        <div>
          book-manager
          <small>本地电子书管理</small>
        </div>
      </div>

      <nav className="nav-list">
        {NAV.map((item) => {
          const hint = item.hint?.(stats);
          return (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? 'active' : ''}`}
              onClick={() => onNav(item.key)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {hint && <span className="nav-badge">{hint}</span>}
            </button>
          );
        })}
      </nav>

      <div className="side-footer">
        <img className="icon" src={logo} alt="" />
        <span>book-manager</span>
        {version && <b>{version}</b>}
      </div>
    </aside>
  );
}
