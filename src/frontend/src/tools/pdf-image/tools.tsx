// 转存图片 —— PDF 工具弹窗。
//
// 入口：工具页「PDF › 转存图片」选一个本地 PDF；书架右键 PDF 书籍也会带进来。
// 交互：选「所有页面」或填一个页码范围（1-3,5,8-10），选 PNG / JPEG、清晰度
// （DPI，JPEG 还能调质量）和输出目录，然后前端用 pdf.js 逐页渲染成图片，
// 每页交给后端落盘成 <前缀>-001.png 这样的文件，中途可以停止。
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {PdfExtractInfo} from '../../types';
import {base64ToArrayBuffer, humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {
  blobToBase64,
  defaultOutDir,
  dirOf,
  inspectSource,
  parsePages,
  pickOutDir,
  pickPdfFile,
  plannedName,
  rangesText,
  readPdfData,
  revealDir,
  sanitizePrefix,
  savePdfImage,
  stemOf,
} from './lib';

// vite bundles the worker as an asset
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** 清晰度档位（DPI，72 是 PDF 的原始单位） */
const DPI_STEPS = [96, 150, 300];
/** 单页最大像素数：超过就按比例缩小，避免超大页面把内存吃满 */
const MAX_PIXELS = 40 * 1000 * 1000;

interface Progress {
  cur: number;
  total: number;
  page: number;
}

interface ExportResult {
  count: number;
  bytes: number;
  overwritten: number;
  clamped: number;
  dir: string;
  first: string;
  last: string;
  secs: number;
  stopped: boolean;
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

export default function PdfImageToolDialog({book, onClose}: ToolDialogProps) {
  const {t} = useI18n();
  const [src, setSrc] = useState<PdfExtractInfo | null>(() =>
    book?.path
      ? {path: book.path, name: baseName(book.path), size: 0, pages: 0, encrypted: false, needs_password: false, error: ''}
      : null,
  );
  const [password, setPassword] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState('');
  const [scope, setScope] = useState<'all' | 'range'>('all');
  const [rangeText, setRangeText] = useState('');
  const [format, setFormat] = useState<'png' | 'jpg'>('png');
  const [quality, setQuality] = useState(90);
  const [dpi, setDpi] = useState(150);
  const [outDir, setOutDir] = useState('');
  const [prefix, setPrefix] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>({cur: 0, total: 0, page: 0});
  const [result, setResult] = useState<ExportResult | null>(null);
  const [err, setErr] = useState('');
  const cancelRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 打开一个源文件：清掉上一份的设置
  const loadSource = useCallback(async (path: string) => {
    setResult(null);
    setErr('');
    setPassword('');
    setPwInput('');
    setPwErr('');
    setScope('all');
    setRangeText('');
    setOutDir('');
    setPrefix('');
    setProgress({cur: 0, total: 0, page: 0});
    if (!path) {
      setSrc(null);
      return;
    }
    setSrc({path, name: baseName(path), size: 0, pages: 0, encrypted: false, needs_password: false, error: ''});
    try {
      setSrc(await inspectSource(path, ''));
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
    const p = src?.path ?? '';
    if (!p) return;
    setPwErr('');
    setErr('');
    try {
      const info = await inspectSource(p, pwInput);
      if (info.pages > 0 && !info.needs_password && !info.error) {
        setPassword(pwInput);
        setSrc(info);
      } else {
        setPwErr(info.error || t('tools.pdfExtractPwWrong'));
      }
    } catch (e) {
      setPwErr(String(e));
    }
  };

  // 载入 pdf.js 文档（给了密码、且文件能读时才载入）
  const path = src?.path ?? '';
  const ready = !!src && !src.error && !src.needs_password;
  useEffect(() => {
    if (!path || !ready) {
      setDoc(null);
      return;
    }
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadErr('');
      try {
        const b64 = await readPdfData(path);
        const d = await pdfjsLib.getDocument({data: base64ToArrayBuffer(b64), password: password || undefined}).promise;
        if (!alive) {
          d.destroy();
          return;
        }
        setDoc(d);
      } catch (e) {
        if (alive) setLoadErr(String((e as Error)?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      setDoc(null);
    };
  }, [path, ready, password]);

  const pages = src?.pages ?? 0;
  const parsed = useMemo(
    () => (pages > 0 ? (scope === 'all' ? parsePages('', pages, t) : parsePages(rangeText, pages, t)) : {pages: [], error: ''}),
    [scope, rangeText, pages, t],
  );
  const list = parsed.pages;
  const count = list.length;
  const effDir = outDir || (path ? defaultOutDir(path) : '');
  const effPrefix = prefix.trim() ? prefix : stemOf(path) || 'pdf';
  const firstName = count > 0 ? plannedName(effPrefix, format, list[0], pages) : '';
  const lastName = count > 0 ? plannedName(effPrefix, format, list[count - 1], pages) : '';

  const pickDir = async () => {
    try {
      const d = await pickOutDir(effDir ? dirOf(effDir) || effDir : '');
      if (d) setOutDir(d);
    } catch (e) {
      setErr(String(e));
    }
  };

  const run = async () => {
    if (!doc || pages <= 0) {
      setErr(t('tools.pdfExtractErrNoFile'));
      return;
    }
    if (parsed.error) {
      setErr(parsed.error);
      return;
    }
    if (count === 0) {
      setErr(t('tools.pdfImageNoPages'));
      return;
    }
    if (!effDir) {
      setErr(t('tools.pdfImageOutDirErr'));
      return;
    }

    cancelRef.current = false;
    setBusy(true);
    setErr('');
    setResult(null);
    setProgress({cur: 0, total: count, page: 0});

    const dir = effDir;
    const outPrefix = sanitizePrefix(effPrefix);
    const t0 = Date.now();
    let done = 0;
    let bytes = 0;
    let overwritten = 0;
    let clamped = 0;
    let first = '';
    let last = '';

    try {
      const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t('tools.pdfImageEncodeErr'));

      for (let i = 0; i < list.length; i++) {
        if (cancelRef.current) break;
        const page = list[i];
        setProgress({cur: i, total: list.length, page});

        const p = await doc.getPage(page);
        const base = p.getViewport({scale: 1});
        let scale = dpi / 72;
        if (base.width * scale * base.height * scale > MAX_PIXELS) {
          scale *= Math.sqrt(MAX_PIXELS / (base.width * scale * base.height * scale));
          clamped++;
        }
        const vp = p.getViewport({scale});
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        // 先铺白底：PNG 里的透明区域导出后不会变成黑块
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        await p.render({canvasContext: ctx, viewport: vp}).promise;

        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, format === 'png' ? 'image/png' : 'image/jpeg', format === 'png' ? undefined : quality / 100),
        );
        if (!blob) throw new Error(t('tools.pdfImageEncodeErr'));
        const data = await blobToBase64(blob);

        const saved = await savePdfImage({dir, prefix: outPrefix, format, page, total: pages, data});
        done++;
        bytes += saved.bytes;
        if (saved.existed) overwritten++;
        if (!first) first = saved.name;
        last = saved.name;
        p.cleanup();
        setProgress({cur: i + 1, total: list.length, page});
      }

      setResult({
        count: done,
        bytes,
        overwritten,
        clamped,
        dir,
        first,
        last,
        secs: Math.max(1, Math.round((Date.now() - t0) / 1000)),
        stopped: cancelRef.current,
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const pct = progress.total > 0 ? Math.round((progress.cur / progress.total) * 100) : 0;
  const done = !!result;

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{width: 760}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🖼️ {t('tools.pdfImage')}</h2>
          <button className="modal-close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="form-row">
            <label>{t('tools.pdfExtractSource')}</label>
            <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
              <div className="path-box" title={path}>
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
            {src?.needs_password && <div className="merge-warn">{t('tools.pdfImageNeedPw')}</div>}
            {pwErr && <div className="merge-err">{pwErr}</div>}
            {book && <div className="hint">{t('tools.pdfExtractFromShelf', {title: book.title || book.file_name})}</div>}
          </div>

          {loading && <div className="hint">{t('tools.pdfExtractLoading')}</div>}
          {loadErr && <div className="tool-note err">{t('tools.pdfExtractLoadErr', {msg: loadErr})}</div>}

          {doc && pages > 0 && (
            <>
              <div className="form-row">
                <label>{t('tools.pdfImageScope')}</label>
                <div className="chip-row">
                  <button
                    className={`chip${scope === 'all' ? ' active' : ''}`}
                    onClick={() => setScope('all')}
                    disabled={busy}
                  >
                    {t('tools.pdfImageScopeAll')}
                  </button>
                  <button
                    className={`chip${scope === 'range' ? ' active' : ''}`}
                    onClick={() => setScope('range')}
                    disabled={busy}
                  >
                    {t('tools.pdfImageScopeRange')}
                  </button>
                </div>
                {scope === 'range' && (
                  <>
                    <input
                      className="img-range"
                      value={rangeText}
                      placeholder={t('tools.pdfImageRangePlaceholder')}
                      onChange={(e) => setRangeText(e.target.value)}
                      disabled={busy}
                    />
                    <div className="hint">{t('tools.pdfImageRangeHint')}</div>
                  </>
                )}
                {parsed.error ? (
                  <div className="merge-err">{parsed.error}</div>
                ) : (
                  <div className="img-summary">
                    {t('tools.pdfImageRangeCount', {n: count})}
                    {count > 0 && ` · ${rangesText(list)}`}
                    {pages > 0 && ` · ${t('tools.pdfExtractOfTotal', {total: pages})}`}
                  </div>
                )}
              </div>

              <div className="form-row">
                <label>{t('tools.pdfImageFormat')}</label>
                <div className="chip-row">
                  <button className={`chip${format === 'png' ? ' active' : ''}`} onClick={() => setFormat('png')} disabled={busy}>
                    PNG
                  </button>
                  <button className={`chip${format === 'jpg' ? ' active' : ''}`} onClick={() => setFormat('jpg')} disabled={busy}>
                    JPEG
                  </button>
                </div>
                {format === 'jpg' && (
                  <div className="img-quality">
                    <span className="thumb-range">{t('tools.pdfImageQuality')}</span>
                    <input
                      type="range"
                      min={50}
                      max={100}
                      step={5}
                      value={quality}
                      onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                      disabled={busy}
                    />
                    <span className="img-quality-val">{quality}</span>
                  </div>
                )}
                <div className="chip-row" style={{marginTop: 8}}>
                  <span className="thumb-range">{t('tools.pdfImageDpi')}</span>
                  {DPI_STEPS.map((d) => (
                    <button key={d} className={`chip${dpi === d ? ' active' : ''}`} onClick={() => setDpi(d)} disabled={busy}>
                      {d} DPI
                    </button>
                  ))}
                </div>
                <div className="hint">{t('tools.pdfImageDpiHint')}</div>
              </div>

              <div className="form-row">
                <label>{t('tools.pdfImageOutDir')}</label>
                <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                  <div className="path-box" title={effDir}>
                    {effDir}
                  </div>
                  <button className="btn btn-soft" onClick={pickDir} disabled={busy}>
                    {t('tools.pdfEpubPickDir')}
                  </button>
                </div>
                {!outDir && <div className="hint">{t('tools.pdfImageOutDirDefault', {name: baseName(effDir)})}</div>}
                <div className="form-row" style={{marginTop: 8}}>
                  <label>{t('tools.pdfImagePrefix')}</label>
                  <input
                    value={prefix}
                    placeholder={stemOf(path) || 'pdf'}
                    onChange={(e) => setPrefix(e.target.value)}
                    disabled={busy}
                  />
                </div>
                {firstName && (
                  <div className="img-summary">
                    {t('tools.pdfImagePreview', {n: count, first: firstName, last: lastName})}
                  </div>
                )}
              </div>
            </>
          )}

          {busy && (
            <div className="form-row">
              <div className="progress-track">
                <div className="fill" style={{width: `${pct}%`}} />
              </div>
              <div className="img-summary">{t('tools.pdfImageProgress', {cur: progress.cur, total: progress.total})}</div>
            </div>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {done && result && (
            <div className="tool-note ok">
              <div>{result.stopped ? `⏹ ${t('tools.pdfImageStopped')}` : `✅ ${t('tools.pdfImageDone')}`}</div>
              <div style={{marginTop: 4}}>
                {t('tools.pdfImageStats', {n: result.count, size: humanSize(result.bytes), secs: result.secs})}
              </div>
              {result.first && (
                <div style={{marginTop: 4, opacity: 0.85}}>
                  {result.first}
                  {result.last !== result.first ? ` … ${result.last}` : ''}
                </div>
              )}
              <div style={{marginTop: 4, opacity: 0.85}}>{result.dir}</div>
              {result.overwritten > 0 && (
                <div style={{marginTop: 4}}>⚠️ {t('tools.pdfImageOverwrote', {n: result.overwritten})}</div>
              )}
              {result.clamped > 0 && <div style={{marginTop: 4}}>⚠️ {t('tools.pdfImageClamped', {n: result.clamped})}</div>}
            </div>
          )}
          {!done && !busy && <div className="hint">{t('tools.pdfImageHint')}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-soft" onClick={onClose} disabled={busy}>
            {done ? t('mis.close') : t('tag.cancel')}
          </button>
          {busy ? (
            <button
              className="btn btn-soft"
              onClick={() => {
                cancelRef.current = true;
              }}
            >
              {t('tools.pdfImageCancel')}
            </button>
          ) : done && result ? (
            <button className="btn btn-primary" onClick={() => revealDir(result.dir)}>
              {t('tools.pdfEpubOpenDir')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={run} disabled={!doc || count === 0 || !!parsed.error}>
              {t('tools.pdfImageSubmit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
