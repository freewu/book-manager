import React, {useEffect, useState} from 'react';
import type {Stats} from '../types';
import {App} from '../api';
import {useI18n} from '../i18n';
import type {Page} from '../App';
import logo from '../assets/logo.png';

interface Props {
  page: Page;
  onNav: (page: Page) => void;
  stats: Stats | null;
  /** 标签数量（「标签」入口的角标） */
  tagCount: number;
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
}

interface NavCtx {
  stats: Stats | null;
  tagCount: number;
}

const NAV: {key: Page; icon: string; labelKey: string; hint?: (c: NavCtx) => string | null}[] = [
  {key: 'bookshelf', icon: '📚', labelKey: 'nav.bookshelf'},
  {
    key: 'reading',
    icon: '📖',
    labelKey: 'nav.reading',
    hint: (c) => (c.stats && c.stats.reading_books > 0 ? String(c.stats.reading_books) : null),
  },
  {
    key: 'tags',
    icon: '🏷️',
    labelKey: 'nav.tags',
    hint: (c) => (c.tagCount > 0 ? String(c.tagCount) : null),
  },
  {key: 'stats', icon: '📊', labelKey: 'nav.stats'},
  {key: 'tools', icon: '🧰', labelKey: 'nav.tools'},
  {key: 'settings', icon: '⚙️', labelKey: 'nav.settings'},
];

export default function Sidebar({page, onNav, stats, tagCount, collapsed, onToggleCollapsed}: Props) {
  const {t} = useI18n();
  const [version, setVersion] = useState('');
  useEffect(() => {
    App.GetVersion()
      .then(setVersion)
      .catch(() => setVersion(''));
  }, []);

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="logo">
        <img className="icon" src={logo} alt="book-manager" />
        <div className="logo-text">
          book-manager
          <small>{t('sidebar.subtitle')}</small>
        </div>
      </div>

      <nav className="nav-list">
        {NAV.map((item) => {
          const hint = item.hint?.({stats, tagCount});
          return (
            <button
              key={item.key}
              className={`nav-item ${page === item.key ? 'active' : ''}`}
              onClick={() => onNav(item.key)}
              title={collapsed ? t(item.labelKey) : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{t(item.labelKey)}</span>
              {hint && <span className="nav-badge">{hint}</span>}
            </button>
          );
        })}
      </nav>

      <div className="side-footer">
        <button
          className="collapse-btn"
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          onClick={() => onToggleCollapsed(!collapsed)}
        >
          {collapsed ? '»' : '«'}
        </button>
        {!collapsed && version && <b className="side-version">{version}</b>}
      </div>
    </aside>
  );
}
