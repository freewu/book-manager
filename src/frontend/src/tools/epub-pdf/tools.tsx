// 转存 PDF —— EPUB 工具弹窗。
//
// 入口：工具页「EPUB › 转存 PDF」选本地文件；书架右键 EPUB 书籍 → EPUB 工具 → 转存 PDF。
// 结果 PDF 带书签目录、内嵌中文字体子集，可以正常选中 / 复制文字。
import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {EpubFileInfo, EpubToPdfProgress, EpubToPdfResult} from '../../types';
import {humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {convertEpubToPdf, inspectEpub, pickEpubFile, pickOutDir, revealFile, subscribeProgress} from './lib';

/** 可选纸张（与后端 epub2pdf 的 pageSizes 一致） */
const PAGE_SIZES = ['A4', 'A5', 'B5', '16K', 'LETTER'] as const;

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

export default function EpubPdfToolDialog({book, onClose, onChanged}: ToolDialogProps) {
  const {t, lang} = useI18n();
  const [path, setPath] = useState(book?.path ?? '');
  // 书架入口才带上 book_id（用户重新选文件后就只作用于那个文件）
  const [bookId, setBookId] = useState<number | undefined>(book?.id);
  const [info, setInfo] = useState<EpubFileInfo | null>(null);
  const [outDir, setOutDir] = useState('');
  const [fileName, setFileName] = useState(book ? stemOf(book.path) : '');
  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [pageSize, setPageSize] = useState<string>('A4');
  const [useCover, setUseCover] = useState(true);
  const [addToShelf, setAddToShelf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<EpubToPdfProgress | null>(null);
  const [result, setResult] = useState<EpubToPdfResult | null>(null);
  const [err, setErr] = useState('');
  const busyRef = useRef(false);

  const inspect = useCallback(
    async (p: string) => {
      setErr('');
      try {
        const res = await inspectEpub(p);
        setInfo(res);
        if (res.title && !title) setTitle(res.title);
        if (res.author && !author) setAuthor(res.author);
      } catch (e) {
        setInfo(null);
        setErr(String(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (path) inspect(path);
    // 只按入口给的文件初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 转换进度来自 epub2pdf:progress 事件
  useEffect(() => {
    const off = subscribeProgress((p) => {
      if (busyRef.current) setProg(p);
    });
    return off;
  }, []);

  const pick = async () => {
    try {
      const p = await pickEpubFile();
      if (!p) return;
      setPath(p);
      setBookId(undefined); // 选的是磁盘上的文件，不再绑书架记录
      setInfo(null);
      setResult(null);
      setFileName(stemOf(p));
      setTitle('');
      setAuthor('');
      setOutDir('');
      await inspect(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const pickDir = async () => {
    try {
      const dir = await pickOutDir(outDir || dirOf(path));
      if (dir) setOutDir(dir);
    } catch (e) {
      setErr(String(e));
    }
  };

  const submit = async () => {
    if (!path) {
      setErr(t('tools.epubPdfErrNoFile'));
      return;
    }
    setBusy(true);
    busyRef.current = true;
    setErr('');
    setResult(null);
    setProg(null);
    try {
      const res = await convertEpubToPdf({
        book_id: bookId ?? 0,
        path,
        out_dir: outDir,
        file_name: fileName,
        title,
        author,
        language: book?.language || lang,
        page_size: pageSize,
        use_cover: useCover,
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

  const done = !!result && !result.no_text;
  const target = outDir || dirOf(path);
  const outName = fileName.trim() || title.trim() || stemOf(path);

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{width: 600}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📕 {t('tools.epubPdf')}</h2>
          <button className="modal-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>{t('tools.epubPdfFile')}</label>
            <div style={{display: 'flex', gap: 8}}>
              <div className="path-box" title={path}>
                {path || t('tools.epubPdfNoFile')}
              </div>
              <button className="btn btn-soft" onClick={pick} disabled={busy}>
                {t('tools.epubPdfPick')}
              </button>
            </div>
            {book && bookId !== undefined && (
              <div className="hint">{t('tools.epubPdfFromShelf', {title: book.title || book.file_name})}</div>
            )}
          </div>

          {info && (
            <div className="form-row">
              <div className="pdf-info">
                <span className="pdf-info-key">{t('tools.pdfPwName')}</span>
                <span className="pdf-info-val" title={info.name}>
                  {info.name}
                </span>
                <span className="pdf-info-key">{t('tools.pdfPwSize')}</span>
                <span className="pdf-info-val">{humanSize(info.size)}</span>
                <span className="pdf-info-key">{t('tools.epubPdfContent')}</span>
                <span className="pdf-info-val">
                  {t('tools.epubPdfChapters', {n: info.chapters})} · {t('tools.epubPdfChars', {n: info.chars})}
                </span>
              </div>
            </div>
          )}

          <div className="form-row">
            <label>{t('tools.epubPdfOutDir')}</label>
            <div style={{display: 'flex', gap: 8}}>
              <div className="path-box" title={target}>
                {target || t('tools.epubPdfOutDirHint')}
              </div>
              <button className="btn btn-soft" onClick={pickDir} disabled={busy}>
                {t('tools.epubPdfPickDir')}
              </button>
            </div>
            <div className="hint">{outDir ? `${outName}.pdf` : t('tools.epubPdfOutDirDefault')}</div>
          </div>

          <div className="form-row">
            <label>{t('tools.epubPdfFileName')}</label>
            <input
              value={fileName}
              placeholder={t('tools.epubPdfFileNamePlaceholder')}
              onChange={(e) => setFileName(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="form-row">
            <label>{t('tools.epubPdfTitle')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          </div>

          <div className="form-row">
            <label>{t('tools.epubPdfAuthor')}</label>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} disabled={busy} />
          </div>

          <div className="form-row">
            <label>{t('tools.epubPdfPageSize')}</label>
            <select value={pageSize} onChange={(e) => setPageSize(e.target.value)} disabled={busy}>
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {t(`tools.pageSize.${s}`)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'}}>
              <input
                type="checkbox"
                checked={useCover}
                onChange={(e) => setUseCover(e.target.checked)}
                style={{width: 'auto'}}
                disabled={busy}
              />
              {t('tools.epubPdfUseCover')}
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 6}}>
              <input
                type="checkbox"
                checked={addToShelf}
                onChange={(e) => setAddToShelf(e.target.checked)}
                style={{width: 'auto'}}
                disabled={busy}
              />
              {t('tools.epubPdfAddToShelf')}
            </label>
          </div>

          {busy && (
            <div className="form-row">
              <div className="progress-track">
                <div
                  className="fill"
                  style={{width: prog && prog.total > 0 ? `${Math.round((prog.current / prog.total) * 100)}%` : '5%'}}
                />
              </div>
              <div className="hint">
                {prog && prog.total > 0
                  ? t('tools.epubPdfProgress', {cur: prog.current, total: prog.total, chars: prog.chars})
                  : t('tools.epubPdfReading')}
              </div>
            </div>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {result?.no_text && <div className="tool-note err">🚫 {t('tools.epubPdfNoText')}</div>}
          {done && (
            <div className="tool-note ok">
              <div>✅ {t('tools.epubPdfDone')}</div>
              <div style={{marginTop: 4}}>{result.file_name}</div>
              <div style={{marginTop: 4, opacity: 0.85}}>
                {t('tools.epubPdfStats', {
                  pages: result.pages,
                  chapters: result.chapters,
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
          {!done && !result?.no_text && <div className="hint">{t('tools.epubPdfHint')}</div>}
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
            <button className="btn btn-primary" onClick={submit} disabled={busy || !path}>
              {busy ? t('tools.epubPdfWorking') : t('tools.epubPdfSubmit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
