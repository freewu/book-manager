import React, {useEffect, useState} from 'react';
import type {Misrecord} from '../types';
import {App, fmtDate} from '../api';
import {useI18n} from '../i18n';

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export default function MisrecordManager({onClose, onChanged}: Props) {
  const {t} = useI18n();
  const [items, setItems] = useState<Misrecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await App.GetMisrecords());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const remove = async (m: Misrecord) => {
    await App.RemoveMisrecord(m.id);
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    onChanged();
  };

  const clearAll = async () => {
    if (!confirm(t('mis.clearConfirm'))) return;
    await App.ClearMisrecords();
    setItems([]);
    onChanged();
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{width: 680}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('mis.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p style={{margin: '0 0 12px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6}}>
            {t('mis.intro')}
          </p>
          {loading ? (
            <div className="empty-inline">{t('mis.loading')}</div>
          ) : items.length === 0 ? (
            <div className="empty-inline">{t('mis.empty')}</div>
          ) : (
            <table className="list-table">
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
                  <tr key={m.id}>
                    <td style={{fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {m.file_name || t('mis.unnamed')}
                    </td>
                    <td style={{maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-2)'}}>
                      {m.path}
                    </td>
                    <td style={{fontSize: 12, color: 'var(--text-2)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {m.reason || '—'}
                    </td>
                    <td style={{fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap'}}>{fmtDate(m.created_at)}</td>
                    <td>
                      <button className="btn btn-ok btn-sm" onClick={() => remove(m)}>
                        {t('mis.restore')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-foot">
          {items.length > 0 && (
            <button className="btn btn-danger" onClick={clearAll}>
              {t('mis.clearAll')}
            </button>
          )}
          <button className="btn btn-soft" onClick={onClose}>
            {t('mis.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
