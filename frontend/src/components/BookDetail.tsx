import React, {useCallback, useEffect, useState} from 'react';
import type {Book, DoubanBook, Note, Tag} from '../types';
import {App, getCoverDataUrl, humanSize, humanDuration, fmtDate, invalidateCover} from '../api';
import {useToast} from './Toast';

interface Props {
  book: Book;
  tags: Tag[];
  onClose: () => void;
  onChanged: (b: Book) => void;
  onOpen: () => void;
  onMisrecord: () => void;
}

export default function BookDetail({book: initial, tags, onClose, onChanged, onOpen, onMisrecord}: Props) {
  const toast = useToast();
  const [book, setBook] = useState<Book>(initial);
  const [cover, setCover] = useState<string | null>(null);
  const [tab, setTab] = useState<'info' | 'notes'>('info');
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({title: '', author: '', publisher: '', description: ''});
  const [busy, setBusy] = useState(false);
  const [doubanBusy, setDoubanBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<DoubanBook[]>([]);
  const [searching, setSearching] = useState(false);

  const reload = useCallback(async (b: Book) => {
    const fresh = await App.GetBook(b.id);
    setBook(fresh);
    onChanged(fresh);
    if (fresh.has_cover) {
      const u = await getCoverDataUrl(fresh.id, true);
      setCover(u);
    } else {
      setCover(null);
    }
  }, [onChanged]);

  useEffect(() => {
    reload(initial);
  }, [initial, reload]);

  useEffect(() => {
    if (tab === 'notes') {
      App.ListNotes(book.id).then(setNotes).catch(() => setNotes([]));
    }
  }, [tab, book.id]);

  const fetchDouban = async () => {
    setDoubanBusy(true);
    try {
      const updated = await App.FetchDouban(book.id);
      toast.ok(`已获取豆瓣信息：${updated.douban_url ? '匹配成功' : '评分 0'}`);
      invalidateCover(updated.id);
      await reload(updated);
    } catch (e) {
      toast.err(`豆瓣获取失败：${String(e)}`);
    } finally {
      setDoubanBusy(false);
    }
  };

  const doSearch = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const r = await App.DoubanSearch(searchTerm);
      setSearchResults(r);
    } catch (e) {
      toast.err(`搜索失败：${String(e)}`);
    } finally {
      setSearching(false);
    }
  };

  const pickDouban = async (d: DoubanBook) => {
    setBusy(true);
    try {
      await App.EnrichBookByTitle(book.id, d);
      toast.ok(`已关联《${d.title}》`);
      invalidateCover(book.id);
      await reload(book);
    } catch (e) {
      toast.err(String(e));
    } finally {
      setBusy(false);
    }
  };

  const clearDouban = async () => {
    await App.ClearDoubanInfo(book.id);
    invalidateCover(book.id);
    await reload(book);
  };

  const saveMeta = async () => {
    await App.UpdateBookMeta(book.id, edit.title, edit.author, edit.publisher, edit.description);
    setEditing(false);
    await reload(book);
    toast.ok('已保存');
  };

  const toggleTag = async (tid: number) => {
    const ids = book.tags.some((t) => t.id === tid)
      ? book.tags.filter((t) => t.id !== tid).map((t) => t.id)
      : [...book.tags.map((t) => t.id), tid];
    await App.SetBookTags(book.id, ids);
    await reload(book);
  };

  const markMis = async () => {
    const reason = prompt('标记为误录（可选原因）：', '');
    if (reason === null) return;
    await App.MarkMisrecord(book.id, reason || '');
    toast.ok('已标记为误录，后续扫描将跳过该文件');
    onMisrecord();
  };

  const del = async () => {
    if (!confirm(`确定从书架删除《${book.title}》吗？\n（不会删除磁盘上的文件）`)) return;
    await App.DeleteBook(book.id);
    toast.ok('已删除');
    onMisrecord();
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    await App.CreateNote(book.id, noteText, '', '', '');
    setNoteText('');
    const n = await App.ListNotes(book.id);
    setNotes(n);
    toast.ok('笔记已保存');
  };

  const delNote = async (id: number) => {
    await App.DeleteNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const fmtBadge = book.format.toUpperCase();

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal wide" style={{width: 820}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📖 书籍详情</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-cover">
              {cover ? (
                <img src={cover} alt={book.title} />
              ) : (
                <div className="placeholder">📕</div>
              )}
            </div>
            <div className="detail-info">
              <h3>
                {book.title} <span style={{fontSize: 12, color: 'var(--text-3)'}}>({fmtBadge})</span>
              </h3>
              <div className="sub">{book.author || '未知作者'}</div>

              {book.douban_rating > 0 && (
                <div style={{display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
                  <span className="detail-rating">⭐ {book.douban_rating.toFixed(1)}</span>
                  {book.douban_rating_count > 0 && (
                    <span style={{fontSize: 12, color: 'var(--text-3)'}}>{book.douban_rating_count} 人评价</span>
                  )}
                  {book.douban_url && (
                    <a
                      href={book.douban_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{fontSize: 12, color: 'var(--accent)'}}
                    >
                      豆瓣页面 ↗
                    </a>
                  )}
                </div>
              )}

              <div className="detail-meta">
                <span className="k">出版社</span>
                <span>{book.publisher || '—'}</span>
                <span className="k">语言</span>
                <span>{book.language || '—'}</span>
                <span className="k">大小</span>
                <span>{humanSize(book.size)}</span>
                <span className="k">阅读进度</span>
                <span>{Math.round(book.read_progress * 10) / 10}%{book.total_read_seconds > 0 ? ` · 累计 ${humanDuration(book.total_read_seconds)}` : ''}</span>
                <span className="k">入库时间</span>
                <span>{fmtDate(book.created_at)}</span>
                <span className="k">文件位置</span>
                <span style={{wordBreak: 'break-all'}}>{book.path}</span>
                <span className="k">MD5</span>
                <span style={{fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all'}}>{book.hash}</span>
              </div>

              <div className="detail-tags">
                {book.tags.map((t) => (
                  <span key={t.id} className="chip" style={{borderColor: t.color, color: t.color}}>
                    {t.name}
                  </span>
                ))}
              </div>

              <div className="detail-actions">
                <button className="btn btn-primary" onClick={onOpen}>
                  📖 打开阅读
                </button>
                <button className="btn btn-soft" onClick={fetchDouban} disabled={doubanBusy}>
                  {doubanBusy ? '获取中...' : '🌐 豆瓣获取'}
                </button>
                <button className="btn btn-soft" onClick={() => App.OpenBookFolder(book.id)}>
                  📁 打开文件夹
                </button>
                <button className="btn btn-soft" onClick={() => setEditing((v) => !v)}>
                  ✏️ 编辑信息
                </button>
                <button className="btn btn-danger" onClick={markMis}>
                  🚫 标记误录
                </button>
                <button className="btn btn-danger" onClick={del}>
                  🗑️ 删除
                </button>
              </div>
            </div>
          </div>

          {editing && (
            <div style={{marginTop: 14, border: '1px solid var(--border)', borderRadius: 10, padding: 14}}>
              <div className="form-row">
                <label>书名</label>
                <input value={edit.title} onChange={(e) => setEdit({...edit, title: e.target.value})} />
              </div>
              <div className="form-row">
                <label>作者</label>
                <input value={edit.author} onChange={(e) => setEdit({...edit, author: e.target.value})} />
              </div>
              <div className="form-row">
                <label>出版社</label>
                <input value={edit.publisher} onChange={(e) => setEdit({...edit, publisher: e.target.value})} />
              </div>
              <div className="form-row">
                <label>简介</label>
                <textarea
                  rows={3}
                  value={edit.description}
                  onChange={(e) => setEdit({...edit, description: e.target.value})}
                  style={{width: '100%'}}
                />
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveMeta}>
                保存
              </button>
            </div>
          )}

          {!editing && (
            <div style={{marginTop: 14}}>
              <div className="detail-tabs">
                <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>
                  标签 / 豆瓣
                </button>
                <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}>
                  笔记（{notes.length}）
                </button>
              </div>

              {tab === 'info' && (
                <div>
                  <div className="form-row">
                    <label>标签</label>
                    <div className="tag-picker">
                      {tags.map((t) => (
                        <span
                          key={t.id}
                          className={`tag-choice ${book.tags.some((x) => x.id === t.id) ? 'on' : ''}`}
                          style={book.tags.some((x) => x.id === t.id) ? {background: t.color, borderColor: t.color} : {}}
                          onClick={() => toggleTag(t.id)}
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="form-row">
                    <label>豆瓣手动搜索（书名不匹配时可手动关联）</label>
                    <div style={{display: 'flex', gap: 8}}>
                      <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="输入书名搜索豆瓣" />
                      <button className="btn btn-soft" onClick={doSearch} disabled={searching}>
                        {searching ? '搜索中...' : '搜索'}
                      </button>
                      {book.douban_url && (
                        <button className="btn btn-soft" onClick={clearDouban}>
                          清除豆瓣信息
                        </button>
                      )}
                    </div>
                    {searchResults.length > 0 && (
                      <div style={{marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6}}>
                        {searchResults.map((r, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              border: '1px solid var(--border)',
                              borderRadius: 8,
                              padding: 6,
                              fontSize: 13,
                            }}
                          >
                            <span>⭐ {r.rating > 0 ? r.rating.toFixed(1) : '—'}</span>
                            <span style={{fontWeight: 600}}>{r.title}</span>
                            <span style={{color: 'var(--text-3)', fontSize: 12}}>{r.author}</span>
                            <span style={{flex: 1}} />
                            <button className="btn btn-primary btn-sm" onClick={() => pickDouban(r)} disabled={busy}>
                              关联
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tab === 'notes' && (
                <div>
                  <div className="form-row">
                    <textarea
                      rows={2}
                      placeholder="写下你的阅读笔记..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      style={{width: '100%'}}
                    />
                    <div style={{marginTop: 6}}>
                      <button className="btn btn-primary btn-sm" onClick={addNote}>
                        ＋ 添加笔记
                      </button>
                    </div>
                  </div>
                  {notes.length === 0 ? (
                    <div className="empty-inline">暂无笔记</div>
                  ) : (
                    notes.map((n) => (
                      <div key={n.id} className="note-item">
                        {n.quote && <div className="quote">“{n.quote}”</div>}
                        <div className="content">{n.content}</div>
                        <div className="meta">
                          <span>{fmtDate(n.created_at)}</span>
                          <span className="spacer" />
                          <button onClick={() => delNote(n.id)}>删除</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {book.description && (
            <div className="detail-desc" style={{marginTop: 10}}>
              <b>简介：</b>
              {book.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
