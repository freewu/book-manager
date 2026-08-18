import React, {useState} from 'react';
import type {Settings} from '../types';
import {App} from '../api';

interface Props {
  settings: Settings;
  onClose: () => void;
  onSaved: (s: Settings) => void;
}

export default function SettingsDialog({settings, onClose, onSaved}: Props) {
  const [idle, setIdle] = useState(settings.idle_seconds || '60');
  const [formats, setFormats] = useState(settings.formats || 'epub,pdf,mobi,azw3,kepub');
  const [doubanAuto, setDoubanAuto] = useState(settings.douban_auto === '1');
  const [theme, setTheme] = useState(settings.theme || 'light');
  const [dataDir, setDataDir] = useState('');
  const [version, setVersion] = useState('');

  React.useEffect(() => {
    App.DataDir().then(setDataDir).catch(() => setDataDir(''));
    App.GetVersion().then(setVersion).catch(() => setVersion(''));
  }, []);

  const save = async () => {
    const s: Settings = {
      idle_seconds: String(Math.max(10, parseInt(idle) || 60)),
      formats: formats
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
        .join(','),
      douban_auto: doubanAuto ? '1' : '0',
      theme,
    };
    await App.SetSettings(s);
    onSaved(s);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{width: 480}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>⚙️ 设置</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>阅读计时闲置上限（秒）</label>
            <input
              type="number"
              min={10}
              value={idle}
              onChange={(e) => setIdle(e.target.value)}
            />
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

          <div className="form-row">
            <label>阅读器主题</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} style={{width: '100%'}}>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
              <option value="sepia">羊皮纸</option>
            </select>
          </div>

          {dataDir && (
            <div className="form-row">
              <label>数据目录（book.db 位置）</label>
              <div
                style={{
                  background: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 12,
                  wordBreak: 'break-all',
                }}
              >
                {dataDir}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <span style={{fontSize: 12, color: 'var(--text-3)', marginRight: 'auto'}}>
            书架 · 本地电子书管理{version ? ` ${version}` : ''}
          </span>
          <button className="btn btn-soft" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={save}>
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
