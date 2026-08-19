import React, {useState} from 'react';
import type {Tag} from '../types';
import {App} from '../api';
import {useI18n} from '../i18n';

interface Props {
  tags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}

export default function TagManager({tags, onClose, onChanged}: Props) {
  const {t} = useI18n();
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5b7cfa');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#5b7cfa');

  const create = async () => {
    if (!name.trim()) return;
    await App.CreateTag(name.trim(), color);
    setName('');
    onChanged();
  };

  const startEdit = (t: Tag) => {
    setEditingId(t.id);
    setEditName(t.name);
    setEditColor(t.color);
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    await App.UpdateTag(editingId, editName.trim() || editName, editColor);
    setEditingId(null);
    onChanged();
  };

  const del = async (tg: Tag) => {
    if (!confirm(t('tag.deleteConfirm', {name: tg.name, n: tg.book_count}))) return;
    await App.DeleteTag(tg.id);
    onChanged();
  };

  const COLORS = ['#5b7cfa', '#f25f5c', '#2fa36b', '#d97706', '#9b5de5', '#00bbd4', '#e63946', '#6a994e', '#f4a261', '#457b9d'];

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{width: 520}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('tag.title')}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>{t('tag.new')}</label>
            <div style={{display: 'flex', gap: 8}}>
              <input placeholder={t('tag.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{width: 46, padding: 3}} />
              <button className="btn btn-primary" onClick={create}>
                {t('tag.add')}
              </button>
            </div>
            <div className="hint">{t('tag.hint')}</div>
          </div>

          {tags.length === 0 ? (
            <div className="empty-inline">{t('tag.empty')}</div>
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              {tags.map((tg) => (
                <div
                  key={tg.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    border: '1px solid var(--border)',
                    borderRadius: 9,
                    padding: '7px 10px',
                  }}
                >
                  {editingId === tg.id ? (
                    <>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{flex: 1}} />
                      <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} style={{width: 40, padding: 2}} />
                      <button className="btn btn-ok btn-sm" onClick={saveEdit}>
                        {t('tag.save')}
                      </button>
                      <button className="btn btn-soft btn-sm" onClick={() => setEditingId(null)}>
                        {t('tag.cancel')}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="tag-dot" style={{background: tg.color}} />
                      <span style={{fontWeight: 600}}>{tg.name}</span>
                      <span style={{fontSize: 12, color: 'var(--text-3)'}}>{t('tag.books', {n: tg.book_count})}</span>
                      <span style={{flex: 1}} />
                      <button className="btn btn-soft btn-sm" onClick={() => startEdit(tg)}>
                        {t('tag.edit')}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(tg)}>
                        {t('tag.delete')}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
