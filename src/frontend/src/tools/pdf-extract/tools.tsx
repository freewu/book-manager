// 提取页面 —— PDF 工具弹窗。
//
// 入口：工具页「PDF › 提取页面」选一个本地 PDF；书架右键 PDF 书籍也会带进来。
// 交互：pdf.js 每次渲染一组 20 页的缩略图，点缩略图选中/取消；可以翻组（上一组 /
// 下一组 / 跳到第 N 页）、放大单页细看（放大时也能选中），已选页面跨组保留，
// 右侧/下方一直列着已选页码。确认后把选中的页按页码升序写成一个新 PDF。
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type {PDFDocumentProxy} from 'pdfjs-dist';
import type {PdfExtractInfo, PdfExtractResult} from '../../types';
import {base64ToArrayBuffer, humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {TFunc} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {extractPdfPages, inspectSource, pickOutPdfFile, pickPdfFile, readPdfData, revealFile} from './lib';

// vite bundles the worker as an asset
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** 一组（一屏）看多少页 */
const PAGE_SIZE = 20;
/** 缩略图宽度档位：小 / 中 / 大 */
const THUMB_WIDTHS = [104, 140, 186];
/** 放大查看时基准宽度（再乘以缩放倍数） */
const VIEW_BASE_WIDTH = 720;
const ZOOM_STEPS = [0.6, 0.8, 1, 1.4, 2, 3, 4];

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

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

/** 新 PDF 的默认文件名：原名 + 「-提取」(后缀走 i18n) */
function defaultOutName(path: string, t: TFunc): string {
  const stem = stemOf(path);
  return `${stem || 'pdf'}-${t('tools.pdfExtractSuffix')}.pdf`;
}

/** 一页缩略图（自己渲染，选中状态由 React 管） */
function Thumb({
  doc,
  page,
  width,
  selected,
  onToggle,
  onZoom,
  zoomTitle,
}: {
  doc: PDFDocumentProxy;
  page: number;
  width: number;
  selected: boolean;
  onToggle: (page: number) => void;
  onZoom: (page: number) => void;
  zoomTitle: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page);
      const base = p.getViewport({scale: 1});
      const vp = p.getViewport({scale: width / base.width});
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      setFailed(false);
      await p.render({canvasContext: canvas.getContext('2d')!, viewport: vp}).promise;
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page, width]);

  return (
    <div
      className={`page-thumb${selected ? ' on' : ''}`}
      onClick={() => onToggle(page)}
      title={String(page)}
      data-page={page}
    >
      <div className="page-thumb-canvas">
        {failed ? <div className="page-thumb-fail">!</div> : <canvas ref={canvasRef} />}
      </div>
      <div className="page-thumb-bar">
        <span className="page-thumb-num">{page}</span>
        <button
          className="page-thumb-zoom"
          title={zoomTitle}
          onClick={(e) => {
            e.stopPropagation();
            onZoom(page);
          }}
        >
          🔍
        </button>
      </div>
    </div>
  );
}

/** 放大查看单页：可以缩放、翻页，也能直接选中/取消这一页 */
function PageViewer({
  doc,
  page,
  selected,
  onPage,
  onToggle,
  onClose,
}: {
  doc: PDFDocumentProxy;
  page: number;
  selected: boolean;
  onPage: (page: number) => void;
  onToggle: (page: number) => void;
  onClose: () => void;
}) {
  const {t} = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(1.4);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(page);
      const base = p.getViewport({scale: 1});
      const vp = p.getViewport({scale: (VIEW_BASE_WIDTH * zoom) / base.width});
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      setFailed(false);
      await p.render({canvasContext: canvas.getContext('2d')!, viewport: vp}).promise;
    })().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [doc, page, zoom]);

  // 方向键翻页、Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && page > 1) onPage(page - 1);
      else if (e.key === 'ArrowRight' && page < doc.numPages) onPage(page + 1);
      else if (e.key === '+' || e.key === '=') setZoom((z) => ZOOM_STEPS.find((v) => v > z) ?? z);
      else if (e.key === '-') setZoom((z) => [...ZOOM_STEPS].reverse().find((v) => v < z) ?? z);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doc, page, onPage, onClose]);

  const zoomIn = () => setZoom((z) => ZOOM_STEPS.find((v) => v > z) ?? z);
  const zoomOut = () => setZoom((z) => [...ZOOM_STEPS].reverse().find((v) => v < z) ?? z);

  return (
    <div className="viewer-mask" onClick={onClose}>
      <div className="viewer" onClick={(e) => e.stopPropagation()}>
        <div className="viewer-bar">
          <span className="viewer-page">{t('tools.pdfExtractViewerPage', {page, total: doc.numPages})}</span>
          <button className="btn btn-soft" onClick={() => onPage(page - 1)} disabled={page <= 1}>
            ‹ {t('tools.pdfExtractViewerPrev')}
          </button>
          <button className="btn btn-soft" onClick={() => onPage(page + 1)} disabled={page >= doc.numPages}>
            {t('tools.pdfExtractViewerNext')} ›
          </button>
          <span className="spacer" />
          <button className="btn btn-soft" onClick={zoomOut} disabled={zoom <= ZOOM_STEPS[0]}>
            −
          </button>
          <span className="viewer-zoom">{Math.round(zoom * 100)}%</span>
          <button className="btn btn-soft" onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}>
            ＋
          </button>
          <button className="btn btn-soft" onClick={() => setZoom(1)}>
            {t('tools.pdfExtractFit')}
          </button>
          <button className={`btn ${selected ? 'btn-soft' : 'btn-primary'}`} onClick={() => onToggle(page)}>
            {selected ? t('tools.pdfExtractViewerUnselect') : t('tools.pdfExtractViewerSelect')}
          </button>
          <button className="btn btn-soft" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="viewer-stage">
          {failed ? <div className="viewer-fail">!</div> : <canvas ref={canvasRef} />}
        </div>
      </div>
    </div>
  );
}

export default function PdfExtractToolDialog({book, onClose, onChanged}: ToolDialogProps) {
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
  const [thumbIdx, setThumbIdx] = useState(1);
  const [group, setGroup] = useState(0);
  const [jumpTo, setJumpTo] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [outPath, setOutPath] = useState('');
  const [addToShelf, setAddToShelf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PdfExtractResult | null>(null);
  const [err, setErr] = useState('');
  const docRef = useRef<PDFDocumentProxy | null>(null);

  // 打开一个源文件：清掉上一份的选择/输出/密码状态
  const loadSource = useCallback(async (path: string) => {
    setSel(new Set());
    setResult(null);
    setOutPath('');
    setErr('');
    setPassword('');
    setPwInput('');
    setPwErr('');
    setGroup(0);
    setJumpTo('');
    setViewer(null);
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
    const path = src?.path ?? '';
    if (!path) return;
    setPwErr('');
    setErr('');
    try {
      const info = await inspectSource(path, pwInput);
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
        docRef.current = d;
        setDoc(d);
      } catch (e) {
        if (alive) setLoadErr(String((e as Error)?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      docRef.current?.destroy();
      docRef.current = null;
      setDoc(null);
    };
  }, [path, ready, password]);

  const pages = src?.pages ?? 0;
  const totalGroups = Math.max(1, Math.ceil(pages / PAGE_SIZE));
  const from = pages > 0 ? group * PAGE_SIZE + 1 : 0;
  const to = pages > 0 ? Math.min(pages, from + PAGE_SIZE - 1) : 0;
  const visible = useMemo(() => {
    const out: number[] = [];
    for (let n = from; n <= to; n++) out.push(n);
    return out;
  }, [from, to]);
  const selectedPages = useMemo(() => [...sel].sort((a, b) => a - b), [sel]);

  const toggle = useCallback((page: number) => {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
    setResult(null);
  }, []);

  const selectGroup = (on: boolean) => {
    setSel((prev) => {
      const next = new Set(prev);
      visible.forEach((n) => (on ? next.add(n) : next.delete(n)));
      return next;
    });
    setResult(null);
  };

  const goGroup = (g: number) => {
    setGroup(Math.max(0, Math.min(totalGroups - 1, g)));
    setViewer(null);
  };

  const jump = () => {
    const n = parseInt(jumpTo, 10);
    if (!Number.isFinite(n) || n < 1 || n > pages) return;
    goGroup(Math.floor((n - 1) / PAGE_SIZE));
    setJumpTo('');
  };

  const pickOut = async () => {
    try {
      const p = await pickOutPdfFile(defaultOutName(path, t), outPath ? dirOf(outPath) : dirOf(path));
      if (p) setOutPath(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const submit = async () => {
    if (!path) {
      setErr(t('tools.pdfExtractErrNoFile'));
      return;
    }
    if (selectedPages.length === 0) {
      setErr(t('tools.pdfExtractErrNoPages'));
      return;
    }
    let out = outPath;
    if (!out) {
      out = await pickOutPdfFile(defaultOutName(path, t), dirOf(path));
      if (!out) return;
      setOutPath(out);
    }
    setBusy(true);
    setErr('');
    setResult(null);
    try {
      const res = await extractPdfPages({
        path,
        password,
        pages: selectedPages,
        out_path: out,
        add_to_shelf: addToShelf,
      });
      setResult(res);
      if (res.added) onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const done = !!result;
  const outName = outPath ? baseName(outPath) : defaultOutName(path, t);

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{width: 880}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>✂️ {t('tools.pdfExtract')}</h2>
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
            {src?.needs_password && <div className="merge-warn">{t('tools.pdfExtractNeedPw')}</div>}
            {pwErr && <div className="merge-err">{pwErr}</div>}
            {book && <div className="hint">{t('tools.pdfExtractFromShelf', {title: book.title || book.file_name})}</div>}
          </div>

          {loading && <div className="hint">{t('tools.pdfExtractLoading')}</div>}
          {loadErr && <div className="tool-note err">{t('tools.pdfExtractLoadErr', {msg: loadErr})}</div>}

          {doc && pages > 0 && (
            <>
              <div className="form-row">
                <div className="thumb-toolbar">
                  <button className="btn btn-soft" onClick={() => goGroup(group - 1)} disabled={busy || group <= 0}>
                    ‹ {t('tools.pdfExtractPrevGroup')}
                  </button>
                  <span className="thumb-range">{t('tools.pdfExtractRange', {from, to, total: pages})}</span>
                  <button
                    className="btn btn-soft"
                    onClick={() => goGroup(group + 1)}
                    disabled={busy || group >= totalGroups - 1}
                  >
                    {t('tools.pdfExtractNextGroup')} ›
                  </button>
                  <span className="spacer" />
                  <span className="thumb-range">{t('tools.pdfExtractJump')}</span>
                  <input
                    className="thumb-jump"
                    value={jumpTo}
                    inputMode="numeric"
                    placeholder="1"
                    onChange={(e) => setJumpTo(e.target.value.replace(/[^0-9]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && jump()}
                    disabled={busy}
                  />
                  <button className="btn btn-soft" onClick={jump} disabled={busy || !jumpTo}>
                    {t('tools.pdfExtractJumpGo')}
                  </button>
                </div>
                <div className="thumb-toolbar">
                  <span className="thumb-range">{t('tools.pdfExtractThumbSize')}</span>
                  <div className="chip-row">
                    {THUMB_WIDTHS.map((w, i) => (
                      <button
                        key={w}
                        className={`chip${thumbIdx === i ? ' active' : ''}`}
                        onClick={() => setThumbIdx(i)}
                        disabled={busy}
                      >
                        {t(`tools.pdfExtractThumb${['Small', 'Medium', 'Large'][i]}`)}
                      </button>
                    ))}
                  </div>
                  <span className="spacer" />
                  <button className="btn btn-soft" onClick={() => selectGroup(true)} disabled={busy}>
                    {t('tools.pdfExtractSelectGroup')}
                  </button>
                  <button className="btn btn-soft" onClick={() => selectGroup(false)} disabled={busy}>
                    {t('tools.pdfExtractUnselectGroup')}
                  </button>
                  <button
                    className="btn btn-soft"
                    onClick={() => {
                      setSel(new Set());
                      setResult(null);
                    }}
                    disabled={busy || sel.size === 0}
                  >
                    {t('tools.pdfExtractClearSel')}
                  </button>
                </div>
                <div className="thumb-grid" style={{gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB_WIDTHS[thumbIdx]}px, 1fr))`}}>
                  {visible.map((n) => (
                    <Thumb
                      key={n}
                      doc={doc}
                      page={n}
                      width={THUMB_WIDTHS[thumbIdx]}
                      selected={sel.has(n)}
                      onToggle={toggle}
                      onZoom={setViewer}
                      zoomTitle={t('tools.pdfExtractZoom')}
                    />
                  ))}
                </div>
              </div>

              <div className="form-row">
                <label>
                  {t('tools.pdfExtractSelected', {n: selectedPages.length})}
                  {pages > 0 && ` · ${t('tools.pdfExtractOfTotal', {total: pages})}`}
                </label>
                {selectedPages.length === 0 ? (
                  <div className="merge-empty">{t('tools.pdfExtractNoSel')}</div>
                ) : (
                  <div className="sel-chips">
                    {selectedPages.map((n) => (
                      <button key={n} className="sel-chip" title={t('tools.pdfExtractRemove')} onClick={() => toggle(n)}>
                        {n} ✕
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                <div className="hint">{outPath ? outPath : t('tools.pdfExtractOutDefault')}</div>
                <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 6}}>
                  <input
                    type="checkbox"
                    checked={addToShelf}
                    onChange={(e) => setAddToShelf(e.target.checked)}
                    style={{width: 'auto'}}
                    disabled={busy}
                  />
                  {t('tools.pdfExtractAddToShelf')}
                </label>
              </div>
            </>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {done && (
            <div className="tool-note ok">
              <div>✅ {t('tools.pdfExtractDone')}</div>
              <div style={{marginTop: 4}}>{result.path.split(/[\\/]/).pop()}</div>
              <div style={{marginTop: 4, opacity: 0.85}}>
                {t('tools.pdfExtractStats', {pages: result.pages.length, total: pages, size: humanSize(result.bytes)})}
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
          {!done && <div className="hint">{t('tools.pdfExtractHint')}</div>}
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
            <button className="btn btn-primary" onClick={submit} disabled={busy || !doc || selectedPages.length === 0}>
              {busy ? t('tools.pdfExtractWorking') : t('tools.pdfExtractSubmit')}
            </button>
          )}
        </div>

        {viewer !== null && doc && (
          <PageViewer
            doc={doc}
            page={viewer}
            selected={sel.has(viewer)}
            onPage={setViewer}
            onToggle={toggle}
            onClose={() => setViewer(null)}
          />
        )}
      </div>
    </div>
  );
}
