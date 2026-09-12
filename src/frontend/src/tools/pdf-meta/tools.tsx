// 修改文档 —— PDF 工具弹窗。
//
// 入口：工具页「PDF › 修改文档」选一个本地 PDF；书架右键 PDF 书籍也会带进来。
// 交互：读出现有的标题 / 作者 / 主题 / 关键词（其余信息只读展示），改完选
// 「另存为新文件」（默认）或「覆盖原文件」保存。只有改动过的键才会写回，
// 空值表示删掉那条信息。
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {PdfMetaInfo, PdfMetaResult} from '../../types';
import {humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {TFunc} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {
  defaultOutName,
  dirOf,
  inspectMeta,
  keywordsText,
  parseKeywords,
  pdfDate,
  pickOutPdfFile,
  pickPdfFile,
  revealFile,
  sameKeywords,
  savePdfMeta,
} from './lib';

type Mode = 'new' | 'inplace';

/** 四个可编辑字段的表单值 */
interface Form {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

const EMPTY: Form = {title: '', author: '', subject: '', keywords: ''};

function formOf(info: PdfMetaInfo): Form {
  return {
    title: info.title ?? '',
    author: info.author ?? '',
    subject: info.subject ?? '',
    keywords: keywordsText(info.keywords),
  };
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** 字段名（按表单顺序） */
const FIELD_KEYS = ['Title', 'Author', 'Subject', 'Keywords'] as const;

export default function PdfMetaToolDialog({book, onClose, onChanged}: ToolDialogProps) {
  const {t} = useI18n();
  const [src, setSrc] = useState<PdfMetaInfo | null>(() =>
    book?.path
      ? {
          path: book.path,
          name: baseName(book.path),
          size: 0,
          pages: 0,
          version: '',
          encrypted: false,
          needs_password: false,
          error: '',
          title: '',
          author: '',
          subject: '',
          keywords: [],
          creator: '',
          producer: '',
          creation_date: '',
          mod_date: '',
        }
      : null,
  );
  /** 读到的原值：改动 = 表单值 ≠ 原值 */
  const [orig, setOrig] = useState<Form>(EMPTY);
  const [form, setForm] = useState<Form>(EMPTY);
  const [password, setPassword] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [mode, setMode] = useState<Mode>('new');
  const [outPath, setOutPath] = useState('');
  const [addToShelf, setAddToShelf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PdfMetaResult | null>(null);
  const [err, setErr] = useState('');

  const loadSource = useCallback(async (path: string) => {
    setResult(null);
    setOutPath('');
    setErr('');
    setPassword('');
    setPwInput('');
    setPwErr('');
    setMode('new');
    setOrig(EMPTY);
    setForm(EMPTY);
    if (!path) {
      setSrc(null);
      return;
    }
    setSrc({
      path,
      name: baseName(path),
      size: 0,
      pages: 0,
      version: '',
      encrypted: false,
      needs_password: false,
      error: '',
      title: '',
      author: '',
      subject: '',
      keywords: [],
      creator: '',
      producer: '',
      creation_date: '',
      mod_date: '',
    });
    try {
      const info = await inspectMeta(path, '');
      setSrc(info);
      if (!info.needs_password && !info.error) {
        setOrig(formOf(info));
        setForm(formOf(info));
      }
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  // 书架入口带进来的文件：进来就检查一次
  const bookPath = book?.path ?? '';
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    if (bookPath) loadSource(bookPath);
  }, [bookPath, loadSource]);

  const pick = async () => {
    try {
      const p = await pickPdfFile();
      if (p) await loadSource(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const verify = async () => {
    const path = src?.path ?? '';
    if (!path) return;
    setPwErr('');
    setErr('');
    try {
      const info = await inspectMeta(path, pwInput);
      if (info.pages > 0 && !info.needs_password && !info.error) {
        setPassword(pwInput);
        setSrc(info);
        setOrig(formOf(info));
        setForm(formOf(info));
      } else {
        setPwErr(info.error || t('tools.pdfExtractPwWrong'));
      }
    } catch (e) {
      setPwErr(String(e));
    }
  };

  const pages = src?.pages ?? 0;
  const ready = !!src && !src.error && !src.needs_password;
  const encrypted = !!src?.encrypted;

  // 单个字段是否被改过（关键词按集合比较）
  const dirty = useMemo(() => {
    const kw = parseKeywords(form.keywords);
    return {
      Title: (form.title ?? '').trim() !== (orig.title ?? '').trim(),
      Author: (form.author ?? '').trim() !== (orig.author ?? '').trim(),
      Subject: (form.subject ?? '').trim() !== (orig.subject ?? '').trim(),
      Keywords: !sameKeywords(kw, parseKeywords(orig.keywords)),
    } as Record<(typeof FIELD_KEYS)[number], boolean>;
  }, [form, orig]);

  const changedKeys = FIELD_KEYS.filter((k) => dirty[k]);
  const changedText = changedKeys.map((k) => fieldLabel(k, t)).join(', ');

  const kwList = parseKeywords(form.keywords);
  const outName = outPath ? baseName(outPath) : defaultOutName(src?.path ?? '', t('tools.pdfMetaSuffix'));

  const pickOut = async () => {
    const path = src?.path ?? '';
    try {
      const p = await pickOutPdfFile(defaultOutName(path, t('tools.pdfMetaSuffix')), dirOf(outPath) || dirOf(path), t('tools.pdfMetaSave'));
      if (p) setOutPath(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const revert = () => {
    setForm(orig);
    setResult(null);
    setErr('');
  };

  const submit = async () => {
    const path = src?.path ?? '';
    if (!path) {
      setErr(t('tools.pdfMetaNoFile'));
      return;
    }
    if (changedKeys.length === 0) {
      setErr(t('tools.pdfMetaNoChange'));
      return;
    }
    let out = path;
    if (mode === 'new') {
      out = outPath;
      if (!out) {
        out = await pickOutPdfFile(defaultOutName(path, t('tools.pdfMetaSuffix')), dirOf(path), t('tools.pdfMetaSave'));
        if (!out) return;
        setOutPath(out);
      }
    }
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const res = await savePdfMeta({
        path,
        password,
        out_path: out,
        title: form.title,
        author: form.author,
        subject: form.subject,
        keywords: kwList,
        add_to_shelf: mode === 'new' && addToShelf,
      });
      setResult(res);
      // 保存后表单就是新值，不再显示「已修改」
      setOrig(form);
      if (res.added) onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const done = !!result;
  const field = (key: 'title' | 'author' | 'subject' | 'keywords', label: string) => (
    <div className="form-row" data-field={key}>
      <label>
        {label}
        {dirty[fieldKey(key)] && <span className="pdf-badge on meta-tag">{t('tools.pdfMetaDirty')}</span>}
      </label>
      <input
        type="text"
        value={form[key]}
        placeholder={key === 'keywords' ? t('tools.pdfMetaKwPlaceholder') : ''}
        onChange={(e) => {
          setForm((f) => ({...f, [key]: e.target.value}));
          setResult(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        disabled={busy}
      />
      {key === 'keywords' && (
        <div className="hint">
          {kwList.length > 0 ? t('tools.pdfMetaKwCount', {n: kwList.length}) : t('tools.pdfMetaFieldEmpty')}
        </div>
      )}
    </div>
  );

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{width: 640}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>📝 {t('tools.pdfMeta')}</h2>
          <button className="modal-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>{t('tools.pdfExtractSource')}</label>
            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
              <div className="path-box" title={src?.path}>
                {src
                  ? `${src.name}${pages > 0 ? ` · ${t('tools.pdfPwPages', {n: pages})}` : ''}${src.size ? ` · ${humanSize(src.size)}` : ''}`
                  : t('tools.pdfExtractNoFile')}
              </div>
              <button className="btn btn-soft" onClick={pick} disabled={busy}>
                {t('tools.pdfExtractPick')}
              </button>
            </div>
            {src?.error && <div className="merge-err">{src.error}</div>}
            {src?.needs_password && (
              <div className="merge-pw" style={{marginTop: 8}}>
                <input
                  type="password"
                  value={pwInput}
                  placeholder={t('tools.pdfMergePwPlaceholder')}
                  onChange={(e) => setPwInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verify()}
                  disabled={busy}
                />
                <button className="btn btn-soft" onClick={verify} disabled={busy}>
                  {t('tools.pdfPwVerify')}
                </button>
              </div>
            )}
            {src?.needs_password && <div className="merge-warn">{t('tools.pdfExtractNeedPw')}</div>}
            {pwErr && <div className="merge-err">{pwErr}</div>}
            {book && <div className="hint">{t('tools.pdfExtractFromShelf', {title: book.title || book.file_name})}</div>}
          </div>

          {ready && (
            <>
              <div className="form-row">
                <label className="meta-group">{t('tools.pdfMetaFields')}</label>
                <div className="meta-summary">
                  {changedKeys.length > 0 ? (
                    <>
                      <span className="pdf-badge on">
                        {t('tools.pdfMetaChanged', {n: changedKeys.length, fields: changedText})}
                      </span>
                      <button className="btn btn-soft meta-revert" onClick={revert} disabled={busy}>
                        {t('tools.pdfMetaRevert')}
                      </button>
                    </>
                  ) : (
                    <span className="hint">{t('tools.pdfMetaNoChange')}</span>
                  )}
                </div>
              </div>
              {field('title', t('tools.pdfMetaFieldTitle'))}
              {field('author', t('tools.pdfMetaFieldAuthor'))}
              {field('subject', t('tools.pdfMetaFieldSubject'))}
              {field('keywords', t('tools.pdfMetaFieldKeywords'))}

              <div className="form-row">
                <label>{t('tools.pdfMetaReadonly')}</label>
                <div className="pdf-info">
                  <span className="pdf-info-key">{t('tools.pdfMetaPages')}</span>
                  <span className="pdf-info-val">{pages}</span>
                  <span className="pdf-info-key">{t('tools.pdfMetaVersion')}</span>
                  <span className="pdf-info-val">{src?.version || '—'}</span>
                  <span className="pdf-info-key">{t('tools.pdfMetaCreator')}</span>
                  <span className="pdf-info-val" title={src?.creator}>
                    {src?.creator || '—'}
                  </span>
                  <span className="pdf-info-key">{t('tools.pdfMetaProducer')}</span>
                  <span className="pdf-info-val" title={src?.producer}>
                    {src?.producer || '—'}
                  </span>
                  <span className="pdf-info-key">{t('tools.pdfMetaCreated')}</span>
                  <span className="pdf-info-val">{pdfDate(src?.creation_date ?? '') || '—'}</span>
                  <span className="pdf-info-key">{t('tools.pdfMetaModified')}</span>
                  <span className="pdf-info-val">{pdfDate(src?.mod_date ?? '') || '—'}</span>
                </div>
              </div>

              <div className="form-row">
                <label>{t('tools.pdfMetaMode')}</label>
                <div className="chip-row">
                  <button className={`chip${mode === 'new' ? ' active' : ''}`} onClick={() => setMode('new')} disabled={busy}>
                    {t('tools.pdfMetaModeNew')}
                  </button>
                  {!encrypted && (
                    <button
                      className={`chip${mode === 'inplace' ? ' active' : ''}`}
                      onClick={() => setMode('inplace')}
                      disabled={busy}
                    >
                      {t('tools.pdfMetaModeInPlace')}
                    </button>
                  )}
                </div>
                {encrypted ? (
                  <div className="merge-warn">{t('tools.pdfMetaEncWarn')}</div>
                ) : (
                  mode === 'inplace' && <div className="merge-warn">{t('tools.pdfMetaInPlaceWarn')}</div>
                )}
              </div>

              {mode === 'new' && (
                <div className="form-row">
                  <label>{t('tools.pdfMergeOut')}</label>
                  <div style={{display: 'flex', gap: 8}}>
                    <div className="path-box" title={outPath}>
                      {outName}
                    </div>
                    <button className="btn btn-soft" onClick={pickOut} disabled={busy}>
                      {t('tools.pdfMergePickOut')}
                    </button>
                  </div>
                  <div className="hint">{outPath || t('tools.pdfMetaOutDefault')}</div>
                  <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 6}}>
                    <input
                      type="checkbox"
                      checked={addToShelf}
                      onChange={(e) => setAddToShelf(e.target.checked)}
                      style={{width: 'auto'}}
                      disabled={busy}
                    />
                    {t('tools.pdfMetaAddToShelf')}
                  </label>
                </div>
              )}
            </>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {done && (
            <div className="tool-note ok">
              <div>✅ {result.in_place ? t('tools.pdfMetaDoneInPlace') : t('tools.pdfMetaDoneNew')}</div>
              <div style={{marginTop: 4}}>{result.path.split(/[\\/]/).pop()}</div>
              <div style={{marginTop: 4, opacity: 0.85}}>
                {t('tools.pdfMetaStats', {
                  n: result.changed.length,
                  fields: result.changed.map((k) => fieldLabel(k, t)).join(', '),
                  size: humanSize(result.bytes),
                })}
              </div>
              {result.shelf_error && <div style={{marginTop: 4}}>⚠️ {t('tools.pdfEpubShelfErr', {msg: result.shelf_error})}</div>}
              {!result.in_place && !result.shelf_error && result.added && (
                <div style={{marginTop: 4, opacity: 0.85}}>{t('tools.pdfEpubAdded')}</div>
              )}
            </div>
          )}
          {!done && <div className="hint">{t('tools.pdfMetaHint')}</div>}
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
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={busy || !ready || changedKeys.length === 0}
            >
              {busy ? t('tools.pdfMetaSaving') : t('tools.pdfMetaSave')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 表单字段名 → Info 字典键 */
function fieldKey(key: 'title' | 'author' | 'subject' | 'keywords'): (typeof FIELD_KEYS)[number] {
  switch (key) {
    case 'title':
      return 'Title';
    case 'author':
      return 'Author';
    case 'subject':
      return 'Subject';
    default:
      return 'Keywords';
  }
}

/** Info 字典键 → 界面上的字段名 */
function fieldLabel(key: string, tfn: TFunc): string {
  switch (key) {
    case 'Title':
      return tfn('tools.pdfMetaFieldTitle');
    case 'Author':
      return tfn('tools.pdfMetaFieldAuthor');
    case 'Subject':
      return tfn('tools.pdfMetaFieldSubject');
    case 'Keywords':
      return tfn('tools.pdfMetaFieldKeywords');
    default:
      return key;
  }
}
