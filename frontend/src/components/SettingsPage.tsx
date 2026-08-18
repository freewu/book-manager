import React, {useEffect, useState} from 'react';
import type {Settings} from '../types';
import {App} from '../api';

interface Props {
  settings: Settings;
  onSaved: (s: Settings) => void;
}

const UI_THEMES: {key: string; icon: string; label: string; hint: string}[] = [
  {key: 'light', icon: '☀️', label: '浅色', hint: '始终使用浅色界面'},
  {key: 'dark', icon: '🌙', label: '深色', hint: '始终使用深色界面'},
  {key: 'system', icon: '🖥️', label: '跟随系统', hint: '随 Windows 外观自动切换'},
];

export default function SettingsPage({settings, onSaved}: Props) {
  const [idle, setIdle] = useState(settings.idle_seconds || '60');
  const [formats, setFormats] = useState(settings.formats || 'epub,pdf,mobi,azw3,kepub');
  const [doubanAuto, setDoubanAuto] = useState(settings.douban_auto === '1');
  const [readerTheme, setReaderTheme] = useState(settings.theme || 'light');
  const [uiTheme, setUiTheme] = useState(settings.ui_theme || 'system');
  const [dataDir, setDataDir] = useState('');
  const [version, setVersion] = useState('');

  useEffect(() => {
    App.DataDir().then(setDataDir).catch(() => setDataDir(''));
    App.GetVersion().then(setVersion).catch(() => setVersion(''));
  }, []);

  // Live preview of the app-wide theme while the settings page is open.
  useEffect(() => {
    const apply = async () => {
      let dark = uiTheme === 'dark';
      if (uiTheme === 'system') {
        try {
          dark = await App.GetSystemDarkMode();
        } catch {
          dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
      }
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      App.SetUiTheme(uiTheme);
    };
    apply();
    if (uiTheme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const onMq = () => apply();
      mq.addEventListener('change', onMq);
      const iv = window.setInterval(apply, 5000);
      return () => { mq.removeEventListener('change', onMq); window.clearInterval(iv); };
    }
  }, [uiTheme]);

  const save = async () => {
    const s: Settings = {
      idle_seconds: String(Math.max(10, parseInt(idle) || 60)),
      formats: formats
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .join(','),
      douban_auto: doubanAuto ? '1' : '0',
      theme: readerTheme,
      ui_theme: uiTheme,
    };
    await App.SetSettings(s);
    onSaved(s);
  };

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">设置</span>
      </div>
      <div className="page-scroll">
        <div className="settings-card">
          <h2 className="page-section-title">外观</h2>

          <div className="form-row">
            <label>系统样式</label>
            <div className="theme-cards">
              {UI_THEMES.map((t) => (
                <button
                  key={t.key}
                  className={`theme-card ${uiTheme === t.key ? 'active' : ''}`}
                  onClick={() => setUiTheme(t.key)}
                >
                  <span className="theme-card-icon">{t.icon}</span>
                  <span className="theme-card-label">{t.label}</span>
                  <span className="theme-card-hint">{t.hint}</span>
                </button>
              ))}
            </div>
            <div className="hint">设置整个应用（窗口、书架、统计等）的明暗外观，默认跟随系统。</div>
          </div>

          <div className="form-row">
            <label>阅读器主题</label>
            <select value={readerTheme} onChange={(e) => setReaderTheme(e.target.value)} style={{width: '100%'}}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="sepia">羊皮纸</option>
            </select>
            <div className="hint">阅读器正文区域的显示主题（与系统样式相互独立）。</div>
          </div>

          <h2 className="page-section-title" style={{marginTop: 26}}>
            阅读与扫描
          </h2>

          <div className="form-row">
            <label>阅读计时闲置上限（秒）</label>
            <input type="number" min={10} value={idle} onChange={(e) => setIdle(e.target.value)} style={{maxWidth: 160}} />
            <div className="hint">
              阅读时长时间不翻页只累计该秒数，之后暂停计时，直到再次翻页。默认 60 秒。
            </div>
          </div>

          <div className="form-row">
            <label>扫描格式（逗号分隔）</label>
            <input value={formats} onChange={(e) => setFormats(e.target.value)} placeholder="epub,pdf,mobi,azw3,kepub" />
          </div>

          <div className="form-row">
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
              <input type="checkbox" checked={doubanAuto} onChange={(e) => setDoubanAuto(e.target.checked)} style={{width: 'auto'}} />
              扫描完成后自动获取豆瓣信息
            </label>
          </div>

          {dataDir && (
            <div className="form-row">
              <label>数据目录（book.db 位置）</label>
              <div className="data-dir">{dataDir}</div>
            </div>
          )}

          <div className="form-row" style={{marginTop: 30}}>
            <button className="btn btn-primary" onClick={save}>
              💾 保存设置
            </button>
            <span style={{fontSize: 12, color: 'var(--text-3)', marginLeft: 12}}>
              book-manager{version ? ` v${version}` : ''} · 本地电子书管理
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
