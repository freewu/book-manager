// 标签页（整页工具，见 tools/tags/define.ts）：
// 展示所有标签 + 书籍数量，并支持 新建 / 改名换色 / 冻结解冻 / 删除；
// 点标签的数量跳到书架按该标签筛选。
import React, {useMemo, useState} from 'react';
import type {Tag} from '../../types';
import {useI18n} from '../../i18n';
import type {ToolPageProps} from '../types';
import {createTag, deleteTag, freezeTag, updateTag} from './lib';

const DEFAULT_COLOR = '#5b7cfa';

/** 分组顺序：使用中的在前，冻结的在后面单独一组。 */
const GROUPS: {id: 'active' | 'frozen'; titleKey: string}[] = [
  {id: 'active', titleKey: 'tag.groupActive'},
  {id: 'frozen', titleKey: 'tag.groupFrozen'},
];

/**
 * 后端错误 → 界面文案。
 * 后端 db 层返回「标签名不能为空 / 标签名已存在」，sqlite 约束错误里是 UNIQUE。
 */
const ERR_TEXT: {match: string[]; errKey: string}[] = [
  {match: ['已存在', 'UNIQUE'], errKey: 'tag.errExists'},
  {match: ['不能为空'], errKey: 'tag.errEmpty'},
];

export default function TagsPage({tags, onOpenShelf, onChanged}: ToolPageProps) {
  const {t} = useI18n();
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(DEFAULT_COLOR);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => tags.filter((tg) => !tg.frozen), [tags]);
  const frozen = useMemo(() => tags.filter((tg) => tg.frozen), [tags]);
  const marked = useMemo(
    () => active.reduce((n, tg) => n + tg.book_count, 0) + frozen.reduce((n, tg) => n + tg.book_count, 0),
    [active, frozen],
  );

  /** 统一处理错误：认识的错误映射成 i18n 文案，其余展示原文。 */
  const fail = (e: unknown) => {
    const msg = String((e as {message?: string})?.message ?? e ?? '');
    const hit = ERR_TEXT.find((x) => x.match.some((m) => msg.includes(m)));
    setErr(hit ? t(hit.errKey) : msg);
  };

  const guard = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await fn();
      onChanged();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    const n = name.trim();
    if (!n) return;
    if (tags.some((tg) => tg.name === n)) {
      setErr(t('tag.errExists'));
      return;
    }
    return guard(async () => {
      await createTag(n, color);
      setName('');
      setColor(DEFAULT_COLOR);
    });
  };

  const startEdit = (tg: Tag) => {
    setErr('');
    setEditingId(tg.id);
    setEditName(tg.name);
    setEditColor(tg.color);
  };

  const saveEdit = () => {
    if (editingId == null) return;
    const n = editName.trim();
    if (!n) return;
    if (tags.some((tg) => tg.id !== editingId && tg.name === n)) {
      setErr(t('tag.errExists'));
      return;
    }
    const id = editingId;
    return guard(async () => {
      await updateTag(id, n, editColor);
      setEditingId(null);
    });
  };

  const toggleFrozen = (tg: Tag) => guard(async () => freezeTag(tg.id, !tg.frozen));

  const del = (tg: Tag) => {
    if (!window.confirm(t('tag.deleteConfirm', {name: tg.name, n: tg.book_count}))) return;
    return guard(async () => {
      if (editingId === tg.id) setEditingId(null);
      await deleteTag(tg.id);
    });
  };

  const section = (titleKey: string, list: Tag[]) => (
    <div className="page-section" key={titleKey}>
      <h2 className="page-section-title">
        {t(titleKey)}
        <span className="tag-group-count">{list.length}</span>
      </h2>
      <div className="tag-list">
        {list.map((tg) => (
          <div className={`tag-row${tg.frozen ? ' frozen' : ''}`} data-tag-id={tg.id} key={tg.id}>
            {editingId === tg.id ? (
              <>
                <span className="tag-dot" style={{background: editColor}} />
                <input
                  className="tag-name-input"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <input
                  className="tag-color-input"
                  type="color"
                  value={editColor}
                  onChange={(e) => setEditColor(e.target.value)}
                />
                <span className="spacer" />
                <button className="btn btn-ok btn-sm" onClick={saveEdit} disabled={!editName.trim() || busy}>
                  {t('tag.save')}
                </button>
                <button className="btn btn-soft btn-sm" onClick={() => setEditingId(null)}>
                  {t('tag.cancel')}
                </button>
              </>
            ) : (
              <>
                <span className="tag-dot" style={{background: tg.color}} />
                <span className="tag-row-name" title={tg.name}>
                  {tg.name}
                </span>
                {tg.frozen && <span className="tag-badge">{t('tag.frozenBadge')}</span>}
                <button
                  className="tag-count-btn"
                  title={t('tag.jumpTip')}
                  disabled={tg.book_count === 0}
                  onClick={() => onOpenShelf([tg.id])}
                >
                  {t('tag.books', {n: tg.book_count})}
                  {tg.book_count > 0 && <span className="tag-count-arrow">›</span>}
                </button>
                <span className="spacer" />
                <button className="btn btn-soft btn-sm" onClick={() => startEdit(tg)}>
                  {t('tag.edit')}
                </button>
                <button className="btn btn-soft btn-sm" onClick={() => toggleFrozen(tg)} disabled={busy}>
                  {tg.frozen ? t('tag.unfreeze') : t('tag.freeze')}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => del(tg)} disabled={busy}>
                  {t('tag.delete')}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="main tags-page">
      <div className="toolbar">
        <span className="title">{t('tag.title')}</span>
        <span className="toolbar-note">{t('tag.total', {n: tags.length, m: marked})}</span>
        <span className="spacer" />
      </div>

      <div className="page-scroll">
        <div className="page-section">
          <h2 className="page-section-title">{t('tag.new')}</h2>
          <div className="tag-new-row">
            <input
              className="tag-name-input"
              placeholder={t('tag.namePlaceholder')}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
            />
            <input
              className="tag-color-input"
              type="color"
              value={color}
              title={t('tag.colorTitle')}
              onChange={(e) => setColor(e.target.value)}
            />
            <button className="btn btn-primary btn-sm" onClick={create} disabled={!name.trim() || busy}>
              {t('tag.add')}
            </button>
          </div>
          <div className="hint">{t('tag.hint')}</div>
          {err && <div className="tool-note err tag-err">{err}</div>}
        </div>

        {tags.length === 0 ? (
          <div className="empty">
            <div className="big-icon">🏷️</div>
            <h2>{t('tag.empty')}</h2>
            <p className="page-muted">{t('tag.emptyHint')}</p>
          </div>
        ) : (
          <>
            {GROUPS.map((g) => {
              const list = g.id === 'active' ? active : frozen;
              return list.length > 0 ? section(g.titleKey, list) : null;
            })}
          </>
        )}
      </div>
    </div>
  );
}
