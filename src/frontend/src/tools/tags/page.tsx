// 标签页（整页工具，见 tools/tags/define.ts）：
// 两个 tab：「标签列表」展示所有标签 + 书籍数量，支持 新建 / 改名换色 / 冻结解冻 /
// 删除 / 拖拽排序；「标签云」按收录数量把标签做成大字云。点标签的数量跳到书架按该标签筛选。
import React, {useMemo, useRef, useState} from 'react';
import type {Tag} from '../../types';
import {useI18n} from '../../i18n';
import type {ToolPageProps} from '../types';
import {createTag, deleteTag, freezeTag, randomTagColor, reorderTags, updateTag} from './lib';

const DEFAULT_COLOR = '#5b7cfa';

/** 标签云里的字号 / 不透明度范围：收录越多 → 字越大、越不透明。 */
const CLOUD_MIN_SIZE = 14;
const CLOUD_MAX_SIZE = 30;
const CLOUD_MIN_OPACITY = 0.42;
/** 云状排布时每个标签上下抖动的最大像素（由 id 决定，固定不变） */
const CLOUD_JITTER = 10;

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
  const [tab, setTab] = useState<'list' | 'cloud'>('list');
  // 拖拽排序：拖动的行 + 当前悬停到的行（提交时按这两个下标换位）
  const [dragId, setDragId] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const orderRef = useRef<number[]>([]);
  const dragIdRef = useRef<number | null>(null);
  const dropIdxRef = useRef<number | null>(null);

  const active = useMemo(() => tags.filter((tg) => !tg.frozen), [tags]);
  const frozen = useMemo(() => tags.filter((tg) => tg.frozen), [tags]);
  const marked = useMemo(
    () => active.reduce((n, tg) => n + tg.book_count, 0) + frozen.reduce((n, tg) => n + tg.book_count, 0),
    [active, frozen],
  );

  // 整页的展示顺序就是后端给顺序（frozen 分组 + sort_order），拖拽也基于它换位
  const flatIDs = useMemo(() => tags.map((tg) => tg.id), [tags]);
  const maxCount = useMemo(() => Math.max(1, ...tags.map((tg) => tg.book_count)), [tags]);

  /** 0~1 的固定散列：同一个标签每次渲染都落在同一个高度上。 */
  const jitter = (id: number, salt: number) => {
    const h = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
    return h - Math.floor(h);
  };

  /** 云状排布：数量最多的摆在正中间，其余按大小往两边散（middle-out），
   *  再给每个标签一个固定的上下抖动，整体是一团居中的云，而不是一行行对齐的列表。 */
  const cloudTags = useMemo(() => {
    const sorted = [...tags].sort((a, b) => b.book_count - a.book_count || a.id - b.id);
    if (sorted.length === 0) return [] as Tag[];
    const left: Tag[] = [];
    const right: Tag[] = [];
    sorted.slice(1).forEach((tg, i) => {
      if (i % 2 === 0) left.push(tg);
      else right.push(tg);
    });
    return [...left.reverse(), sorted[0], ...right];
  }, [tags]);

  /** 标签云：数量占比 0~1，字号和不透明度都跟着它走。 */
  const cloudStyle = (tg: Tag): React.CSSProperties => {
    const ratio = Math.max(0, Math.min(1, tg.book_count / maxCount));
    return {
      fontSize: `${Math.round(CLOUD_MIN_SIZE + (CLOUD_MAX_SIZE - CLOUD_MIN_SIZE) * ratio)}px`,
      opacity: CLOUD_MIN_OPACITY + (1 - CLOUD_MIN_OPACITY) * ratio,
      color: tg.color,
    };
  };

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

  // ---------- 拖拽排序 ----------
  // 用指针事件自己实现（不依赖 HTML5 dnd）：按下手柄后跟着鼠标，
  // 经过哪一行就把那一行记成落点，松手时换位并整批写回后端。
  const setDrop = (i: number | null) => {
    dropIdxRef.current = i;
    setDropIdx(i);
  };

  const startDrag = (e: React.PointerEvent, tg: Tag) => {
    if (busy || editingId != null) return;
    e.preventDefault();
    orderRef.current = flatIDs;
    dragIdRef.current = tg.id;
    setDragId(tg.id);
    setDrop(orderRef.current.indexOf(tg.id));

    const onMove = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
      const row = el?.closest('.tag-row') as HTMLElement | null;
      if (!row) return;
      const idx = orderRef.current.indexOf(Number(row.dataset.tagId));
      if (idx >= 0) setDrop(idx);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const from = orderRef.current.indexOf(dragIdRef.current ?? -1);
      const to = dropIdxRef.current;
      dragIdRef.current = null;
      setDragId(null);
      setDrop(null);
      if (from < 0 || to == null || to === from) return;
      const next = [...orderRef.current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      if (next.join(',') === orderRef.current.join(',')) return;
      return guard(async () => reorderTags(next));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

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
          <div
            className={`tag-row${tg.frozen ? ' frozen' : ''}${dragId === tg.id ? ' dragging' : ''}${
              dropIdx != null && dragId != null && dropIdx === tags.findIndex((x) => x.id === tg.id) ? ' drop-target' : ''
            }`}
            data-tag-id={tg.id}
            key={tg.id}
          >
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
                <span
                  className="tag-drag"
                  data-testid="tag-drag"
                  title={t('tag.dragTip')}
                  onPointerDown={(e) => startDrag(e, tg)}
                >
                  ⠿
                </span>
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
        <div className="detail-tabs tag-tabs">
          <button
            data-testid="tag-tab-list"
            className={tab === 'list' ? 'active' : ''}
            onClick={() => setTab('list')}
          >
            {t('tag.tabList')}
          </button>
          <button
            data-testid="tag-tab-cloud"
            className={tab === 'cloud' ? 'active' : ''}
            onClick={() => setTab('cloud')}
          >
            {t('tag.tabCloud')}
          </button>
        </div>
        <span className="spacer" />
      </div>

      {tab === 'cloud' ? (
        <div className="page-scroll">
          <div className="page-section">
            <h2 className="page-section-title">{t('tag.cloudTitle')}</h2>
            {tags.length === 0 ? (
              <div className="filter-empty">{t('tag.empty')}</div>
            ) : (
              <>
                <div className="tag-cloud" data-testid="tag-cloud">
                  {cloudTags.map((tg) => (
                    <button
                      key={tg.id}
                      data-cloud-id={tg.id}
                      data-cloud-count={tg.book_count}
                      className={`cloud-tag${tg.frozen ? ' frozen' : ''}`}
                      style={
                        {
                          ...cloudStyle(tg),
                          '--cloud-jitter': `${Math.round((jitter(tg.id, 1) - 0.5) * 2 * CLOUD_JITTER)}px`,
                        } as React.CSSProperties
                      }
                      title={t('tag.cloudTip', {n: tg.book_count})}
                      onClick={() => onOpenShelf([tg.id])}
                    >
                      {tg.name}
                      <span className="cloud-cnt">{tg.book_count}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
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
              <button
                type="button"
                data-testid="tag-random"
                className="btn btn-soft btn-sm"
                title={t('tag.randomTip')}
                onClick={() => setColor(randomTagColor())}
              >
                {t('tag.randomColor')}
              </button>
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
      )}
    </div>
  );
}
