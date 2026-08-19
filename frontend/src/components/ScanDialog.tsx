import React, {useEffect, useState} from 'react';
import type {ScanProgress, Settings} from '../types';
import {App, onScanProgress} from '../api';
import {useI18n} from '../i18n';

interface Props {
  settings: Settings;
  onClose: () => void;
  onDone: (added: number) => void;
}

const ALL_FORMATS = [
  {key: 'epub', label: 'EPUB'},
  {key: 'pdf', label: 'PDF'},
  {key: 'mobi', label: 'MOBI'},
  {key: 'azw3', label: 'AZW3'},
  {key: 'kepub', label: 'KEPUB'},
];

export default function ScanDialog({settings, onClose, onDone}: Props) {
  const {t} = useI18n();
  const [dirs, setDirs] = useState<string[]>([]);
  const [manual, setManual] = useState('');
  const [formats, setFormats] = useState<string[]>(() => {
    const s = settings.formats || 'epub,pdf,mobi,azw3,kepub';
    return s.split(',').filter(Boolean);
  });
  const [doubanAuto, setDoubanAuto] = useState(settings.douban_auto === '1');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [log, setLog] = useState<ScanProgress[]>([]);

  useEffect(() => {
    App.ListScanDirs().then(setDirs).catch(() => setDirs([]));
  }, []);

  useEffect(() => {
    const off = onScanProgress((p) => {
      setProgress(p);
      if (p.finished) {
        setRunning(false);
      } else if (p.status && p.status !== 'ok') {
        setLog((prev) => [...prev.slice(-200), p]);
      }
    });
    return off;
  }, []);

  const pickDir = async () => {
    const d = await App.PickScanDir();
    if (d) {
      setDirs((prev) => (prev.includes(d) ? prev : [...prev, d]));
      setManual('');
    }
  };

  const addManual = () => {
    const d = manual.trim();
    if (d && !dirs.includes(d)) setDirs((prev) => [...prev, d]);
    setManual('');
  };

  const start = async () => {
    if (dirs.length === 0) return;
    setLog([]);
    setProgress(null);
    setRunning(true);
    await App.SetSettings({formats: formats.join(','), douban_auto: doubanAuto ? '1' : '0'});
    await App.ScanStart(dirs);
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="modal-mask" onClick={running ? undefined : onClose}>
      <div className="modal" style={{width: 560}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('scan.title')}</h2>
          <button className="modal-close" onClick={onClose} disabled={running}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>{t('scan.dirs')}</label>
            <div style={{display: 'flex', gap: 8, marginBottom: 8}}>
              <input
                placeholder={t('scan.manualPlaceholder')}
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManual()}
              />
              <button className="btn btn-soft" onClick={addManual}>
                ＋
              </button>
              <button className="btn btn-primary" onClick={pickDir}>
                {t('scan.pick')}
              </button>
            </div>
            {dirs.length === 0 ? (
              <div style={{fontSize: 12, color: 'var(--text-3)'}}>{t('scan.noDirs')}</div>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: 4}}>
                {dirs.map((d) => (
                  <div
                    key={d}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: 'var(--panel-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: 12,
                    }}
                  >
                    <span>📁</span>
                    <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{d}</span>
                    <button
                      style={{color: 'var(--danger)', fontSize: 12}}
                      onClick={() => setDirs((prev) => prev.filter((x) => x !== d))}
                      disabled={running}
                    >
                      {t('scan.remove')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-row">
            <label>{t('scan.formats')}</label>
            <div className="chip-row">
              {ALL_FORMATS.map((f) => (
                <button
                  key={f.key}
                  className={`chip ${formats.includes(f.key) ? 'active' : ''}`}
                  onClick={() =>
                    setFormats((prev) => (prev.includes(f.key) ? prev.filter((x) => x !== f.key) : [...prev, f.key]))
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="form-row">
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
              <input
                type="checkbox"
                checked={doubanAuto}
                onChange={(e) => setDoubanAuto(e.target.checked)}
                style={{width: 'auto'}}
              />
              {t('scan.doubanAuto')}
            </label>
          </div>

          {running && (
            <div className="form-row">
              <label>
                {progress ? t('scan.processing', {cur: progress.current, total: progress.total, file: progress.file || ''}) : t('scan.preparing')}
              </label>
              <div className="progress-track">
                <div className="fill" style={{width: `${pct}%`}} />
              </div>
              {progress && (
                <div style={{display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-2)', marginTop: 6}}>
                  <span>{t('scan.added', {n: progress.added})}</span>
                  <span>{t('scan.skipped', {n: progress.skipped})}</span>
                  <span>{t('scan.errors', {n: progress.errors})}</span>
                </div>
              )}
            </div>
          )}

          {progress?.finished && (
            <div className="form-row">
              <div style={{background: 'var(--ok-soft)', color: 'var(--ok)', padding: '8px 12px', borderRadius: 8, fontSize: 13}}>
                ✅ {t('scan.done', {
                  msg: progress.message || t('scan.doneDefault'),
                  a: progress.added,
                  s: progress.skipped,
                  e: progress.errors,
                })}
              </div>
            </div>
          )}

          {log.length > 0 && (
            <div className="form-row">
              <label>{t('scan.logTitle')}</label>
              <div style={{maxHeight: 140, overflowY: 'auto', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.8}}>
                {log.slice(-12).map((p, i) => (
                  <div key={i}>
                    {p.status === 'skip' ? '⏭️' : '⚠️'} {p.file} — {p.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-soft" onClick={onClose} disabled={running}>
            {t('scan.close')}
          </button>
          <button className="btn btn-primary" onClick={start} disabled={running || dirs.length === 0}>
            {running ? t('scan.running') : t('scan.start')}
          </button>
          {!running && progress?.finished && (
            <button
              className="btn btn-ok"
              onClick={() => onDone(progress?.added ?? 0)}
            >
              {t('scan.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
