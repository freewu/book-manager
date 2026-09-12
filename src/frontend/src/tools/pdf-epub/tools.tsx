// 转存 EPUB —— PDF 工具弹窗。
//
// 入口：工具页「PDF › 转存 EPUB」选本地文件；书架右键 PDF 书籍 → PDF 工具 → 转存 EPUB。
// 加密的 PDF 需要先输入打开密码；扫描版（没有文字层）无法转换。
import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {PdfFileInfo, PdfToEpubProgress, PdfToEpubResult} from '../../types';
import {humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {convertPdfToEpub, inspectPdf, pickOutDir, pickPdfFile, revealFile, subscribeProgress} from './lib';

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

export default function PdfEpubToolDialog({book, onClose, onChanged}: ToolDialogProps) {
  const {t, lang} = useI18n();
  const [path, setPath] = useState(book?.path ?? '');
  // 书架入口才带上 book_id（用户重新选文件后就只作用于那个文件）
  const [bookId, setBookId] = useState<number | undefined>(book?.id);
  const [info, setInfo] = useState<PdfFileInfo | null>(null);
  const [needPw, setNeedPw] = useState(false);
  const [password, setPassword] = useState('');
  const [outDir, setOutDir] = useState('');
  const [fileName, setFileName] = useState(book ? stemOf(book.path) : '');
  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [useCover, setUseCover] = useState(true);
  const [addToShelf, setAddToShelf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<PdfToEpubProgress | null>(null);
  const [result, setResult] = useState<PdfToEpubResult | null>(null);
  const [err, setErr] = useState('');
  const busyRef = useRef(false);

  const inspect = useCallback(
    async (p: string, pw = '') => {
      setErr('');
      try {
        const res = await inspectPdf(p, pw);
        setInfo(res);
        setNeedPw(!!res.needs_password);
        if (res.needs_password) setErr(t('tools.pdfEpubErrPassword'));
        else if (!pw && res.title && !title) setTitle(res.title);
      } catch (e) {
        setInfo(null);
        setErr(String(e));
      }
    },
    // 只关心 path/pw，title 只在未填时兜底
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t],
  );

  useEffect(() => {
    if (path) inspect(path);
    // 只按入口给的文件初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 转换进度来自 pdf2epub:progress 事件
  useEffect(() => {
    const off = subscribeProgress((p) => {
      if (busyRef.current) setProg(p);
    });
    return off;
  }, []);

  const pick = async () => {
    try {
      const p = await pickPdfFile();
      if (!p) return;
      setPath(p);
      setBookId(undefined); // 选的是磁盘上的文件，不再绑书架记录
      setInfo(null);
      setNeedPw(false);
      setPassword('');
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

  const submit = async (pw = password) => {
    if (!path) {
      setErr(t('tools.pdfEpubErrNoFile'));
      return;
    }
    setBusy(true);
    busyRef.current = true;
    setErr('');
    setResult(null);
    setProg(null);
    try {
      const res = await convertPdfToEpub({
        book_id: bookId ?? 0,
        path,
        password: pw,
        out_dir: outDir,
        file_name: fileName,
        title,
        author,
        language: book?.language || lang,
        use_cover: useCover,
        add_to_shelf: addToShelf,
      });
      setResult(res);
      setNeedPw(!!res.needs_password);
      if (res.needs_password) setErr(t('tools.pdfEpubErrPassword'));
      if (res.added) onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const done = !!result && !result.needs_password && !result.no_text;
  const target = outDir || dirOf(path);
  const outName = fileName.trim() || title.trim() || stemOf(path);

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{width: 600}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📗 {t('tools.pdfEpub')}</h2>
          <button className="modal-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>{t('tools.pdfPwFile')}</label>
            <div style={{display: 'flex', gap: 8}}>
              <div className="path-box" title={path}>
                {path || t('tools.pdfPwNoFile')}
              </div>
              <button className="btn btn-soft" onClick={pick} disabled={busy}>
                {t('tools.pdfPwPick')}
              </button>
            </div>
            {book && bookId !== undefined && (
              <div className="hint">{t('tools.pdfPwFromShelf', {title: book.title || book.file_name})}</div>
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
                <span className="pdf-info-val">
                  {humanSize(info.size)}
                  {info.pages > 0 ? ` · ${t('tools.pdfPwPages', {n: info.pages})}` : ''}
                </span>
                <span className="pdf-info-key">{t('tools.pdfPwStatus')}</span>
                <span className="pdf-info-val">
                  {info.encrypted ? (
                    <span className="pdf-badge on">{t('tools.pdfPwEncrypted')}</span>
                  ) : (
                    <span className="pdf-badge off">{t('tools.pdfPwPlain')}</span>
                  )}
                </span>
              </div>
            </div>
          )}

          {needPw && (
            <div className="form-row">
              <label>{t('tools.pdfPwCurrent')}</label>
              <div style={{display: 'flex', gap: 8}}>
                <input
                  type="password"
                  value={password}
                  placeholder={t('tools.pdfPwCurrentPlaceholder')}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !busy && submit()}
                  disabled={busy}
                />
                <button className="btn btn-soft" onClick={() => inspect(path, password)} disabled={busy}>
                  {t('tools.pdfPwVerify')}
                </button>
              </div>
            </div>
          )}

          <div className="form-row">
            <label>{t('tools.pdfEpubOutDir')}</label>
            <div style={{display: 'flex', gap: 8}}>
              <div className="path-box" title={target}>
                {target || t('tools.pdfEpubOutDirHint')}
              </div>
              <button className="btn btn-soft" onClick={pickDir} disabled={busy}>
                {t('tools.pdfEpubPickDir')}
              </button>
            </div>
            <div className="hint">{outDir ? `${outName}.epub` : t('tools.pdfEpubOutDirDefault')}</div>
          </div>

          <div className="form-row">
            <label>{t('tools.pdfEpubFileName')}</label>
            <input
              value={fileName}
              placeholder={t('tools.pdfEpubFileNamePlaceholder')}
              onChange={(e) => setFileName(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="form-row">
            <label>{t('tools.pdfEpubTitle')}</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
          </div>

          <div className="form-row">
            <label>{t('tools.pdfEpubAuthor')}</label>
            <input value={author} onChange={(e) => setAuthor(e.target.value)} disabled={busy} />
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
              {t('tools.pdfEpubUseCover')}
            </label>
            <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 6}}>
              <input
                type="checkbox"
                checked={addToShelf}
                onChange={(e) => setAddToShelf(e.target.checked)}
                style={{width: 'auto'}}
                disabled={busy}
              />
              {t('tools.pdfEpubAddToShelf')}
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
                  ? t('tools.pdfEpubProgress', {cur: prog.current, total: prog.total, chars: prog.chars})
                  : t('tools.pdfEpubReading')}
              </div>
            </div>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {result?.no_text && <div className="tool-note err">🚫 {t('tools.pdfEpubNoText')}</div>}
          {done && (
            <div className="tool-note ok">
              <div>✅ {t('tools.pdfEpubDone')}</div>
              <div style={{marginTop: 4}}>{result.file_name}</div>
              <div style={{marginTop: 4, opacity: 0.85}}>
                {t('tools.pdfEpubStats', {
                  pages: result.pages,
                  chars: result.chars,
                  size: humanSize(result.bytes),
                })}
                {result.dropped > 0 ? ` · ${t('tools.pdfEpubDropped', {n: result.dropped})}` : ''}
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
          {!done && !result?.no_text && <div className="hint">{t('tools.pdfEpubHint')}</div>}
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
            <button className="btn btn-primary" onClick={() => submit()} disabled={busy || !path}>
              {busy ? t('tools.pdfEpubWorking') : t('tools.pdfEpubSubmit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
