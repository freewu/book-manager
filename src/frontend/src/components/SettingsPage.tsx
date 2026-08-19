import React, {useEffect, useState} from 'react';
import type {Settings} from '../types';
import {App} from '../api';
import {useI18n, LANGS} from '../i18n';

interface Props {
  settings: Settings;
  onSaved: (s: Settings) => void;
}

const UI_THEMES: {key: string; icon: string; labelKey: string; hintKey: string}[] = [
  {key: 'light', icon: '☀️', labelKey: 'theme.light', hintKey: 'theme.lightHint'},
  {key: 'dark', icon: '🌙', labelKey: 'theme.dark', hintKey: 'theme.darkHint'},
  {key: 'system', icon: '🖥️', labelKey: 'theme.system', hintKey: 'theme.systemHint'},
];

export default function SettingsPage({settings, onSaved}: Props) {
  const {t} = useI18n();
  const [idle, setIdle] = useState(settings.idle_seconds || '60');
  const [formats, setFormats] = useState(settings.formats || 'epub,pdf,mobi,azw3,kepub');
  const [doubanAuto, setDoubanAuto] = useState(settings.douban_auto === '1');
  const [readerTheme, setReaderTheme] = useState(settings.theme || 'light');
  const [uiTheme, setUiTheme] = useState(settings.ui_theme || 'system');
  const [language, setLanguage] = useState(settings.language || 'zh-CN');
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

  // Auto-save: every change is persisted to book.config.json immediately.
  const persist = async (patch: Settings) => {
    const merged: Settings = {...settings, ...patch};
    try {
      await App.SetSettings(patch);
    } catch {
      /* keep UI responsive; next change will retry */
    }
    onSaved(merged);
  };

  const saveIdle = (v: string) => {
    setIdle(v);
    persist({idle_seconds: String(Math.max(10, parseInt(v) || 60))});
  };
  const saveFormats = (v: string) => {
    setFormats(v);
    persist({
      formats: v
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .join(','),
    });
  };
  const saveDoubanAuto = (v: boolean) => {
    setDoubanAuto(v);
    persist({douban_auto: v ? '1' : '0'});
  };
  const saveReaderTheme = (v: string) => {
    setReaderTheme(v);
    persist({theme: v});
  };
  const saveUiTheme = (v: string) => {
    setUiTheme(v);
    persist({ui_theme: v});
  };
  const saveLanguage = (v: string) => {
    setLanguage(v);
    persist({language: v});
  };

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">{t('settings.title')}</span>
      </div>
      <div className="page-scroll">
        <div className="settings-card">
          <h2 className="page-section-title">{t('settings.appearance')}</h2>

          <div className="form-row">
            <label>{t('settings.language')}</label>
            <select value={language} onChange={(e) => saveLanguage(e.target.value)} style={{width: '100%'}}>
              {LANGS.map((l) => (
                <option key={l.key} value={l.key}>
                  {t(l.labelKey)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label>{t('settings.uiTheme')}</label>
            <div className="theme-cards">
              {UI_THEMES.map((th) => (
                <button
                  key={th.key}
                  className={`theme-card ${uiTheme === th.key ? 'active' : ''}`}
                  onClick={() => saveUiTheme(th.key)}
                >
                  <span className="theme-card-icon">{th.icon}</span>
                  <span className="theme-card-label">{t(th.labelKey)}</span>
                  <span className="theme-card-hint">{t(th.hintKey)}</span>
                </button>
              ))}
            </div>
            <div className="hint">{t('settings.uiThemeHint')}</div>
          </div>

          <div className="form-row">
            <label>{t('settings.readerTheme')}</label>
            <select value={readerTheme} onChange={(e) => saveReaderTheme(e.target.value)} style={{width: '100%'}}>
              <option value="light">{t('theme.light')}</option>
              <option value="dark">{t('theme.dark')}</option>
              <option value="sepia">{t('theme.sepia')}</option>
            </select>
            <div className="hint">{t('settings.readerThemeHint')}</div>
          </div>

          <h2 className="page-section-title" style={{marginTop: 26}}>
            {t('settings.readingScan')}
          </h2>

          <div className="form-row">
            <label>{t('settings.idleLimit')}</label>
            <input type="number" min={10} value={idle} onChange={(e) => saveIdle(e.target.value)} style={{maxWidth: 160}} />
            <div className="hint">{t('settings.idleHint')}</div>
          </div>

          <div className="form-row">
            <label>{t('settings.scanFormats')}</label>
            <input value={formats} onChange={(e) => saveFormats(e.target.value)} placeholder="epub,pdf,mobi,azw3,kepub" />
          </div>

          <div className="form-row">
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
              <input type="checkbox" checked={doubanAuto} onChange={(e) => saveDoubanAuto(e.target.checked)} style={{width: 'auto'}} />
              {t('settings.doubanAuto')}
            </label>
          </div>

          {dataDir && (
            <div className="form-row">
              <label>{t('settings.dataDir')}</label>
              <div className="data-dir">{dataDir}</div>
            </div>
          )}

          <div className="form-row" style={{marginTop: 30}}>
            <span style={{fontSize: 12, color: 'var(--text-3)'}}>
              book-manager{version ? ` v${version}` : ''} · {t('settings.about')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
