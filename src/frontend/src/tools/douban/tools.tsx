// 豆瓣补全 —— 工具弹窗（后台任务，关闭窗口不会中断）。
import React, {useEffect, useRef, useState} from 'react';
import type {DoubanProgress} from '../../types';
import {useI18n} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {enrichRunning, startEnrichAll, watchDoubanDone, watchDoubanProgress} from './lib';

export default function DoubanToolDialog({onClose, onChanged}: ToolDialogProps) {
  const {t} = useI18n();
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState<DoubanProgress | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  const start = async () => {
    setErr('');
    setErrors([]);
    setStarted(true);
    try {
      const n = await startEnrichAll();
      if (n > 0) setRunning(true);
    } catch (e) {
      const msg = String(e);
      if (msg.includes('already running')) {
        setRunning(true);
      } else {
        setErr(msg);
      }
    }
  };

  useEffect(() => {
    const offProgress = watchDoubanProgress((p) => {
      setProgress(p);
      if (p.finished) {
        setRunning(false);
        setDone(true);
        changedRef.current();
      } else if (p.status && p.status !== 'ok') {
        setErrors((prev) => [...prev.slice(-200), `${p.title} — ${p.message}`]);
      }
    });
    const offDone = watchDoubanDone(() => {
      setRunning(false);
      setDone(true);
      changedRef.current();
    });
    (async () => {
      try {
        if (await enrichRunning()) {
          // 已有一个补全任务在跑：直接挂上去看进度。
          setStarted(true);
          setRunning(true);
          return;
        }
        setRunning(true);
        await start();
      } catch (e) {
        setErr(String(e));
        setRunning(false);
      }
    })();
    return () => {
      offProgress();
      offDone();
    };
    // 只在挂载时启动一次：onChanged 通过 ref 读取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{width: 520}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('settings.doubanSync')}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p style={{margin: '0 0 12px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6}}>
            {t('tools.doubanIntro')}
          </p>

          {err && <div className="tool-note err">{err}</div>}

          {!done && (
            <div className="form-row">
              <label>
                {progress
                  ? t('settings.doubanSyncing', {
                      cur: progress.current || 0,
                      total: progress.total || 0,
                      title: progress.title || '',
                    })
                  : t('tools.doubanStarting')}
              </label>
              <div className="progress-track">
                <div className="fill" style={{width: `${pct}%`}} />
              </div>
            </div>
          )}

          {done && (
            <div className="tool-note ok">
              ✅{' '}
              {progress
                ? t('settings.doubanDone', {ok: progress.ok, errors: progress.errors, skipped: progress.skipped})
                : t('settings.doubanDone', {ok: 0, errors: 0, skipped: 0})}
            </div>
          )}

          {errors.length > 0 && (
            <div className="form-row">
              <label>{t('tools.doubanErrList')}</label>
              <div style={{maxHeight: 120, overflowY: 'auto', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.8}}>
                {errors.slice(-10).map((e, i) => (
                  <div key={i}>{e}</div>
                ))}
              </div>
            </div>
          )}

          {running && <div className="hint">{t('tools.doubanHint')}</div>}
        </div>
        <div className="modal-foot">
          {done ? (
            <button className="btn btn-ok" onClick={onClose}>
              {t('tools.doubanFinish')}
            </button>
          ) : running ? (
            <button className="btn btn-soft" onClick={onClose}>
              {t('tools.doubanBackground')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start}>
              {started ? t('tools.doubanRetry') : t('scan.start')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
