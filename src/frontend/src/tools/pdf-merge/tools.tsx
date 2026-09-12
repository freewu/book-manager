// 合并 PDF —— PDF 工具弹窗。
//
// 入口：工具页「PDF › 合并 PDF」多选本地文件；书架右键 PDF 书籍 → PDF 工具 → 合并 PDF
// （会把这本书作为第一个文件，可以再添加别的）。
// 列表顺序就是合并顺序（↑/↓ 调整），可选按文件名生成书签目录；
// 加密的文件要先填打开密码，后端会先解到临时副本再合并，合并结果不带密码。
import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {PdfMergeFile, PdfMergeProgress, PdfMergeResult} from '../../types';
import {humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {TFunc} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {inspectPdfFiles, mergePdfs, pickOutPdfFile, pickPdfFiles, revealFile, subscribeProgress} from './lib';

/** 取路径所在目录（\ 与 / 都支持） */
function dirOf(p: string): string {
  const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return i > 0 ? p.slice(0, i) : '';
}

/** 取不带扩展名的文件名 */
function stemOf(p: string): string {
  const base = p.split(/[\\/]/).pop() ?? '';
  return base.replace(/\.[^.]+$/, '');
}

/** 合并后的默认文件名：第一个文件的名字 + 「-合并」(后缀走 i18n) */
function defaultOutName(files: string[], t: TFunc): string {
  const suffix = t('tools.pdfMergeSuffix');
  return files.length > 0 ? `${stemOf(files[0])}-${suffix}.pdf` : `${suffix}.pdf`;
}

/** 刚加进列表、还没检查过的占位行 */
function placeholder(path: string): PdfMergeFile {
  return {
    path,
    name: path.split(/[\\/]/).pop() ?? path,
    size: 0,
    pages: 0,
    encrypted: false,
    needs_password: false,
    error: '',
  };
}

export default function PdfMergeToolDialog({book, onClose, onChanged}: ToolDialogProps) {
  const {t} = useI18n();
  // 书架入口：把这本书当作第一个文件
  const [files, setFiles] = useState<PdfMergeFile[]>(book?.path ? [placeholder(book.path)] : []);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [outPath, setOutPath] = useState('');
  const [bookmarks, setBookmarks] = useState(true);
  const [addToShelf, setAddToShelf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<PdfMergeProgress | null>(null);
  const [result, setResult] = useState<PdfMergeResult | null>(null);
  const [err, setErr] = useState('');
  const busyRef = useRef(false);

  const paths = files.map((f) => f.path);
  const pathKey = paths.join('|');

  // 检查所有文件（带已填的密码），列表按后端返回的顺序对齐
  const inspect = useCallback(
    async (list: string[], pw: Record<string, string>) => {
      if (list.length === 0) {
        setFiles([]);
        return;
      }
      const res = await inspectPdfFiles(list, pw);
      setFiles(res);
    },
    [],
  );

  useEffect(() => {
    if (pathKey) {
      inspect(pathKey.split('|'), passwords).catch((e) => setErr(String(e)));
    }
    // 只在文件集合或密码变化时重新检查
  }, [pathKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 进度来自 pdfmerge:progress 事件
  useEffect(() => {
    const off = subscribeProgress((p) => {
      if (busyRef.current) setProg(p);
    });
    return off;
  }, []);

  const add = async () => {
    try {
      const picked = await pickPdfFiles();
      if (!picked.length) return;
      // 同一个文件不重复添加（Windows 路径不区分大小写）
      const has = (p: string) => paths.some((x) => x.toLowerCase() === p.toLowerCase());
      const fresh = picked.filter((p) => !has(p));
      setResult(null);
      setErr('');
      if (fresh.length > 0) setFiles([...files, ...fresh.map(placeholder)]);
    } catch (e) {
      setErr(String(e));
    }
  };

  const remove = (path: string) => {
    setFiles(files.filter((f) => f.path !== path));
    setResult(null);
  };

  const move = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= files.length) return;
    const next = [...files];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    setFiles(next);
    setResult(null);
  };

  const verify = async (path: string) => {
    setErr('');
    try {
      const res = await inspectPdfFiles([path], passwords);
      if (res.length > 0) {
        setFiles((prev) => prev.map((f) => (f.path === path ? res[0] : f)));
      }
    } catch (e) {
      setErr(String(e));
    }
  };

  const pickOut = async () => {
    try {
      const p = await pickOutPdfFile(defaultOutName(paths, t), outPath ? dirOf(outPath) : dirOf(paths[0] ?? ''));
      if (p) setOutPath(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const blocking = files.filter((f) => f.error || f.needs_password);
  const totalPages = files.reduce((n, f) => n + (f.pages || 0), 0);
  const totalSize = files.reduce((n, f) => n + (f.size || 0), 0);
  const canMerge = files.length > 0 && blocking.length === 0 && !busy;

  const submit = async () => {
    if (files.length === 0) {
      setErr(t('tools.pdfMergeErrNoFile'));
      return;
    }
    if (blocking.length > 0) {
      setErr(t('tools.pdfMergeErrBlocked'));
      return;
    }
    // 还没选保存位置：先弹保存框（取消就什么都不做）
    let out = outPath;
    if (!out) {
      out = await pickOutPdfFile(defaultOutName(paths, t), dirOf(paths[0] ?? ''));
      if (!out) return;
      setOutPath(out);
    }
    setBusy(true);
    busyRef.current = true;
    setErr('');
    setResult(null);
    setProg(null);
    try {
      const res = await mergePdfs({
        files: paths,
        passwords,
        out_path: out,
        bookmarks,
        add_to_shelf: addToShelf,
      });
      setResult(res);
      if (res.added) onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const done = !!result;
  const outName = outPath ? outPath.split(/[\\/]/).pop() : defaultOutName(paths, t);
  const outDir = outPath ? dirOf(outPath) : dirOf(paths[0] ?? '');

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{width: 640}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🧷 {t('tools.pdfMerge')}</h2>
          <button className="modal-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>
              {t('tools.pdfMergeFiles', {n: files.length})}
              {files.length > 0 && ` · ${t('tools.pdfMergeTotal', {pages: totalPages, size: humanSize(totalSize)})}`}
            </label>
            <div className="merge-list">
              {files.length === 0 && <div className="merge-empty">{t('tools.pdfMergeNoFile')}</div>}
              {files.map((f, i) => (
                <div className="merge-item" key={f.path}>
                  <span className="merge-idx">{i + 1}</span>
                  <div className="merge-main">
                    <div className="merge-name" title={f.path}>
                      {f.name}
                    </div>
                    <div className="merge-meta">
                      {f.size > 0 && humanSize(f.size)}
                      {f.pages > 0 && ` · ${t('tools.pdfPwPages', {n: f.pages})}`}
                      {f.encrypted && <span className="pdf-badge on">{t('tools.pdfPwEncrypted')}</span>}
                      {f.error && <span className="merge-err">{f.error}</span>}
                      {!f.error && f.needs_password && <span className="merge-warn">{t('tools.pdfMergeNeedPw')}</span>}
                    </div>
                    {f.encrypted && !f.error && (
                      <div className="merge-pw">
                        <input
                          type="password"
                          value={passwords[f.path] ?? ''}
                          placeholder={t('tools.pdfMergePwPlaceholder')}
                          onChange={(e) => setPasswords({...passwords, [f.path]: e.target.value})}
                          onKeyDown={(e) => e.key === 'Enter' && verify(f.path)}
                          disabled={busy}
                        />
                        <button className="btn btn-soft" onClick={() => verify(f.path)} disabled={busy}>
                          {t('tools.pdfPwVerify')}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="merge-actions">
                    <button
                      className="btn btn-soft btn-icon"
                      title={t('tools.pdfMergeUp')}
                      onClick={() => move(i, -1)}
                      disabled={busy || i === 0}
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-soft btn-icon"
                      title={t('tools.pdfMergeDown')}
                      onClick={() => move(i, 1)}
                      disabled={busy || i === files.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-soft btn-icon"
                      title={t('tools.pdfMergeRemove')}
                      onClick={() => remove(f.path)}
                      disabled={busy}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{display: 'flex', gap: 8, marginTop: 8}}>
              <button className="btn btn-soft" onClick={add} disabled={busy}>
                ＋ {t('tools.pdfMergeAdd')}
              </button>
              {files.length > 0 && (
                <button
                  className="btn btn-soft"
                  onClick={() => {
                    setFiles([]);
                    setResult(null);
                  }}
                  disabled={busy}
                >
                  {t('tools.pdfMergeClear')}
                </button>
              )}
            </div>
            {book && <div className="hint">{t('tools.pdfMergeFromShelf', {title: book.title || book.file_name})}</div>}
          </div>

          <div className="form-row">
            <label>{t('tools.pdfMergeOut')}</label>
            <div style={{display: 'flex', gap: 8}}>
              <div className="path-box" title={outPath}>
                {outName || t('tools.pdfMergeOutHint')}
              </div>
              <button className="btn btn-soft" onClick={pickOut} disabled={busy}>
                {t('tools.pdfMergePickOut')}
              </button>
            </div>
            <div className="hint">{outDir ? `${outDir}\\${outName}` : t('tools.pdfMergeOutDefault')}</div>
          </div>

          <div className="form-row">
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
              <input
                type="checkbox"
                checked={bookmarks}
                onChange={(e) => setBookmarks(e.target.checked)}
                style={{width: 'auto'}}
                disabled={busy}
              />
              {t('tools.pdfMergeBookmarks')}
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 6}}>
              <input
                type="checkbox"
                checked={addToShelf}
                onChange={(e) => setAddToShelf(e.target.checked)}
                style={{width: 'auto'}}
                disabled={busy}
              />
              {t('tools.pdfMergeAddToShelf')}
            </label>
          </div>

          {busy && (
            <div className="form-row">
              <div className="progress-track">
                <div
                  className="fill"
                  style={{
                    width:
                      prog && prog.phase === 'merge'
                        ? '90%'
                        : prog && prog.total > 0
                          ? `${Math.round((prog.current / prog.total) * 80)}%`
                          : '5%',
                  }}
                />
              </div>
              <div className="hint">
                {prog?.phase === 'merge'
                  ? t('tools.pdfMergeMerging', {n: files.length})
                  : prog && prog.total > 0
                    ? t('tools.pdfMergePreparing', {cur: prog.current + 1, total: prog.total, name: prog.name})
                    : t('tools.pdfMergeWorking')}
              </div>
            </div>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {done && (
            <div className="tool-note ok">
              <div>✅ {t('tools.pdfMergeDone')}</div>
              <div style={{marginTop: 4}}>{result.path.split(/[\\/]/).pop()}</div>
              <div style={{marginTop: 4, opacity: 0.85}}>
                {t('tools.pdfMergeStats', {
                  files: result.files,
                  pages: result.pages,
                  size: humanSize(result.bytes),
                })}
              </div>
              {addToShelf && result.shelf_error && (
                <div style={{marginTop: 4}}>⚠️ {t('tools.pdfEpubShelfErr', {msg: result.shelf_error})}</div>
              )}
              {addToShelf && !result.shelf_error && (
                <div style={{marginTop: 4, opacity: 0.85}}>
                  {result.added ? t('tools.pdfEpubAdded') : t('tools.pdfEpubExists')}
                </div>
              )}
            </div>
          )}
          {!done && <div className="hint">{t('tools.pdfMergeHint')}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-soft" onClick={onClose} disabled={busy}>
            {done ? t('mis.close') : t('tag.cancel')}
          </button>
          {done ? (
            <button className="btn btn-primary" onClick={() => revealFile(result.path)}>
              {t('tools.pdfEpubOpenDir')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={submit} disabled={!canMerge}>
              {busy ? t('tools.pdfMergeWorking') : t('tools.pdfMergeSubmit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
