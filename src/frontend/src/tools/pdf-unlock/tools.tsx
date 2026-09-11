// 清除密码 —— PDF 工具弹窗。
//
// 入口：工具页「PDF › 清除密码」选本地文件；书架右键 PDF 书籍 → PDF 工具 → 清除密码。
// 已加密的 PDF 需要给出当前密码（打开文件所需的密码）才能去掉保护。
import React, {useCallback, useEffect, useState} from 'react';
import type {PdfFileInfo} from '../../types';
import {humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {inspectPdf, pickPdfFile, removePdfPassword} from './lib';

export default function PdfUnlockToolDialog({book, onClose, onChanged}: ToolDialogProps) {
  const {t} = useI18n();
  const [path, setPath] = useState(book?.path ?? '');
  // 书架入口才带上 book_id（用户重新选文件后就只作用于那个文件）
  const [bookId, setBookId] = useState<number | undefined>(book?.id);
  const [info, setInfo] = useState<PdfFileInfo | null>(null);
  const [needCurrent, setNeedCurrent] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const inspect = useCallback(
    async (p: string, pw = '') => {
      setErr('');
      try {
        const res = await inspectPdf(p, pw);
        setInfo(res);
        setNeedCurrent(!!res.needs_password);
        if (res.needs_password) setErr(t('tools.pdfPwErrCurrent'));
      } catch (e) {
        setInfo(null);
        setErr(String(e));
      }
    },
    [t],
  );

  useEffect(() => {
    if (path) inspect(path);
    // 只按入口给的文件初始化一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async () => {
    try {
      const p = await pickPdfFile();
      if (!p) return;
      setPath(p);
      setBookId(undefined); // 选的是磁盘上的文件，不再绑书架记录
      setInfo(null);
      setNeedCurrent(false);
      setCurrentPw('');
      setDone(false);
      await inspect(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const submit = async () => {
    if (!path) {
      setErr(t('tools.pdfPwErrNoFile'));
      return;
    }
    if (needCurrent && !currentPw) {
      setErr(t('tools.pdfPwErrCurrent'));
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await removePdfPassword({
        book_id: bookId ?? 0,
        path,
        user_password: '',
        owner_password: '',
        current_password: currentPw,
        strength: '',
        allow_print: true,
        allow_copy: true,
      });
      setInfo(res);
      setNeedCurrent(!!res.needs_password);
      if (res.needs_password) {
        setErr(t('tools.pdfPwErrCurrent'));
        return;
      }
      setDone(true);
      setCurrentPw('');
      onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const encrypted = !!info?.encrypted;
  const plain = !!info && !info.encrypted;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{width: 560}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🔓 {t('tools.pdfUnlock')}</h2>
          <button className="modal-close" onClick={onClose}>
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
                  {encrypted ? (
                    <span className="pdf-badge on">{t('tools.pdfPwEncrypted')}</span>
                  ) : (
                    <span className="pdf-badge off">{t('tools.pdfPwPlain')}</span>
                  )}
                </span>
              </div>
              {encrypted && !done && (
                <div style={{marginTop: 10}}>
                  <label style={{fontSize: 12, color: 'var(--text-2)'}}>{t('tools.pdfPwCurrent')}</label>
                  <div style={{display: 'flex', gap: 8}}>
                    <input
                      type="password"
                      value={currentPw}
                      placeholder={t('tools.pdfPwCurrentPlaceholder')}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && inspect(path, currentPw)}
                    />
                    <button className="btn btn-soft" onClick={() => inspect(path, currentPw)} disabled={busy}>
                      {t('tools.pdfPwVerify')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {done && <div className="tool-note ok">✅ {t('tools.pdfUnlockDone')}</div>}
          {plain && !done && <div className="tool-note ok">{t('tools.pdfUnlockPlain')}</div>}
          {encrypted && !done && <div className="hint">{t('tools.pdfUnlockHint')}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-soft" onClick={onClose} disabled={busy}>
            {done ? t('mis.close') : t('tag.cancel')}
          </button>
          {!done && (
            <button className="btn btn-primary" onClick={submit} disabled={busy || !path || !encrypted}>
              {busy ? t('tools.pdfPwWorking') : t('tools.pdfUnlockSubmit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
