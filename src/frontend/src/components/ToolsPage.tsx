import React, {useEffect, useState} from 'react';
import type {DoubanProgress} from '../types';
import {App, onDoubanDone, onDoubanProgress} from '../api';
import {useI18n} from '../i18n';

interface Props {
  misrecords: number;
  onScan: () => void;
  onTags: () => void;
  onMisrecords: () => void;
}

export default function ToolsPage({misrecords, onScan, onTags, onMisrecords}: Props) {
  const {t} = useI18n();
  const [dataDir, setDataDir] = useState('');
  const [progress, setProgress] = useState<DoubanProgress | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    App.DataDir()
      .then(setDataDir)
      .catch(() => setDataDir(''));
  }, []);

  useEffect(() => {
    const offP = onDoubanProgress((p) => setProgress(p));
    const offD = onDoubanDone(() => setSyncing(false));
    return () => {
      offP();
      offD();
    };
  }, []);

  const syncDouban = async () => {
    setSyncing(true);
    setProgress(null);
    try {
      await App.StartEnrichAll();
    } catch {
      setSyncing(false);
    }
  };

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">{t('tools.title')}</span>
      </div>

      <div className="page-scroll">
        <div className="tools-grid">
          <ToolCard
            icon="🔍"
            title={t('tools.scan')}
            desc={t('tools.scanDesc')}
            action={t('tools.open')}
            onClick={onScan}
          />
          <ToolCard
            icon="🏷️"
            title={t('tools.tags')}
            desc={t('tools.tagsDesc')}
            action={t('tools.open')}
            onClick={onTags}
          />
          <ToolCard
            icon="🚫"
            title={t('tools.misrecords')}
            desc={t('tools.misrecordsDesc')}
            action={t('tools.open')}
            badge={misrecords > 0 ? misrecords : undefined}
            onClick={onMisrecords}
          />
          <ToolCard
            icon="🌐"
            title={t('tools.douban')}
            desc={t('tools.doubanDesc')}
            action={syncing ? t('tools.doubanSyncing') : t('tools.doubanSync')}
            disabled={syncing}
            onClick={syncDouban}
          />
          <div className="tool-card">
            <span className="tool-icon">📂</span>
            <span className="tool-title">{t('tools.dataDir')}</span>
            <span className="tool-desc">{t('tools.dataDirDesc')}</span>
            <span className="tool-path" title={dataDir}>
              {dataDir || '—'}
            </span>
          </div>
        </div>

        {progress && (syncing || progress.finished) && (
          <div className="page-section">
            <h2 className="page-section-title">{t('tools.doubanProgress')}</h2>
            {progress.total > 0 && (
              <div className="progress-track" style={{maxWidth: 420}}>
                <div
                  className="progress-fill"
                  style={{width: `${Math.round(((progress.current || 0) / progress.total) * 100)}%`}}
                />
              </div>
            )}
            <p className="page-muted" style={{marginTop: 8}}>
              {progress.finished
                ? t('settings.doubanDone', {ok: progress.ok, errors: progress.errors, skipped: progress.skipped})
                : t('settings.doubanSyncing', {
                    cur: progress.current || 0,
                    total: progress.total || 0,
                    title: progress.title || '',
                  })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCard({
  icon,
  title,
  desc,
  action,
  badge,
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  desc: string;
  action?: string;
  badge?: number;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className={`tool-card${onClick ? ' clickable' : ''}${disabled ? ' disabled' : ''}`} onClick={disabled ? undefined : onClick}>
      <span className="tool-icon">{icon}</span>
      <span className="tool-title">
        {title}
        {badge !== undefined && <span className="nav-badge mis-badge">{badge}</span>}
      </span>
      <span className="tool-desc">{desc}</span>
      {action && <span className="tool-action">{action} ›</span>}
    </div>
  );
}
