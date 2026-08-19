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
  collapsed: boolean;
  onToggleCollapsed: (collapsed: boolean) => void;
}

const NAV: {key: Page; icon: string; labelKey: string; hint?: (s: Stats | null) => string | null}[] = [
  {key: 'bookshelf', icon: '📚', labelKey: 'nav.bookshelf'},
  {
    key: 'reading',
    icon: '📖',
    labelKey: 'nav.reading',
    hint: (s) => (s && s.reading_books > 0 ? String(s.reading_books) : null),
  },
  {key: 'stats', icon: '📊', labelKey: 'nav.stats'},
  {key: 'settings', icon: '⚙️', labelKey: 'nav.settings'},
];

export default function Sidebar({page, onNav, stats, collapsed, onToggleCollapsed}: Props) {
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
          const hint = item.hint?.(stats);
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
