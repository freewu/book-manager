// 误录管理页（整页工具，见 tools/misrecords/define.ts）：
// 列出被标记为误录的文件，可以单条恢复（下次扫描会重新收录）或一次清空。
import React, {useCallback, useEffect, useState} from 'react';
import type {Misrecord} from '../../types';
import {useI18n} from '../../i18n';
import {useToast} from '../../components/Toast';
import type {ToolPageProps} from '../types';
import {clearMisrecords, fmtDate, listMisrecords, restoreMisrecord} from './lib';

export default function MisrecordsPage({onChanged}: ToolPageProps) {
  const {t} = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<Misrecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listMisrecords());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const restore = async (m: Misrecord) => {
    if (busy) return;
    setBusy(true);
    try {
      await restoreMisrecord(m.id);
      setItems((prev) => prev.filter((x) => x.id !== m.id));
      toast.ok(t('mis.restored', {name: m.file_name || t('mis.unnamed')}));
      onChanged();
    } catch (e) {
      toast.err(String(e));
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (busy || items.length === 0) return;
    if (!window.confirm(t('mis.clearConfirm'))) return;
    const n = items.length;
    setBusy(true);
    try {
      await clearMisrecords();
      setItems([]);
      toast.ok(t('mis.cleared', {n}));
      onChanged();
    } catch (e) {
      toast.err(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main mis-page">
      <div className="toolbar">
        <span className="title">{t('mis.title')}</span>
        <span className="toolbar-note">{t('mis.count', {n: items.length})}</span>
        <span className="spacer" />
        {items.length > 0 && (
          <button className="btn btn-danger btn-sm" data-testid="mis-clear" onClick={clearAll} disabled={busy}>
            {t('mis.clearAll')}
          </button>
        )}
      </div>

      <div className="page-scroll">
        <p className="mis-intro">{t('mis.intro')}</p>
        {loading ? (
          <div className="empty-inline">{t('mis.loading')}</div>
        ) : items.length === 0 ? (
          <div className="empty">
            <div className="big-icon">🚫</div>
            <h2>{t('mis.empty')}</h2>
            <p className="page-muted">{t('mis.emptyHint')}</p>
          </div>
        ) : (
          <table className="list-table mis-table">
            <thead>
              <tr>
                <th>{t('mis.fileName')}</th>
                <th>{t('mis.path')}</th>
                <th>{t('mis.reason')}</th>
                <th>{t('mis.time')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} data-mis-id={m.id}>
                  <td className="mis-file" title={m.file_name || t('mis.unnamed')}>
                    {m.file_name || t('mis.unnamed')}
                  </td>
                  <td className="mis-path" title={m.path}>
                    {m.path}
                  </td>
                  <td className="mis-reason" title={m.reason || ''}>
                    {m.reason || '—'}
                  </td>
                  <td className="mis-time">{fmtDate(m.created_at)}</td>
                  <td>
                    <button
                      className="btn btn-ok btn-sm"
                      data-testid="mis-restore"
                      onClick={() => restore(m)}
                      disabled={busy}
                    >
                      {t('mis.restore')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
