import React, {useEffect, useState} from 'react';
import type {Misrecord} from '../types';
import {App, fmtDate} from '../api';

interface Props {
  onClose: () => void;
  onChanged: () => void;
}

export default function MisrecordManager({onClose, onChanged}: Props) {
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
    if (!confirm('清空所有误录记录？对应书籍将恢复显示，下次扫描将不再跳过这些文件。')) return;
    await App.ClearMisrecords();
    setItems([]);
    onChanged();
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{width: 680}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🚫 误录管理</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p style={{margin: '0 0 12px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6}}>
            被标记为「误录」的文件不会显示在书架上，且下次扫描时会自动跳过（按文件路径与 MD5 双重匹配）。
            你可以在此恢复误录的文件。
          </p>
          {loading ? (
            <div className="empty-inline">加载中...</div>
          ) : items.length === 0 ? (
            <div className="empty-inline">暂无误录记录</div>
          ) : (
            <table className="list-table">
              <thead>
                <tr>
                  <th>文件名</th>
                  <th>文件路径</th>
                  <th>原因</th>
                  <th>时间</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => (
                  <tr key={m.id}>
                    <td style={{fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                      {m.file_name || '(未命名)'}
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
                        恢复
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
              清空全部
            </button>
          )}
          <button className="btn btn-soft" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
