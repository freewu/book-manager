// 压缩文档 —— PDF 工具弹窗。
//
// 入口：工具页「PDF › 压缩文档」选一个本地 PDF；书架右键 PDF 书籍也会带进来。
// 交互：读出源文件信息与本机 Ghostscript 状态，选压缩档位（屏幕 / 电子书 /
// 打印 / 印前）、可临时改图像分辨率或转灰度，再选「另存为新文件」（默认）或
// 「覆盖原文件」压缩。没装 Ghostscript 时自动退回 pdfcpu 无损优化（不能调
// 图像参数，省下的空间也少）。
import React, {useCallback, useEffect, useRef, useState} from 'react';
import type {
  PdfCompressEngine,
  PdfCompressGhostscript,
  PdfCompressInfo,
  PdfCompressPreset,
  PdfCompressProgress,
  PdfCompressResult,
} from '../../types';
import {humanSize} from '../../api';
import {useI18n} from '../../i18n';
import type {ToolDialogProps} from '../types';
import {
  ENGINES,
  PRESETS,
  baseName,
  compressPdf,
  defaultOutName,
  detectGhostscript,
  dirOf,
  engineName,
  inspectPdf,
  percentText,
  phaseSuffix,
  pickGhostscriptExe,
  pickOutPdfFile,
  pickPdfFile,
  presetDef,
  revealFile,
  subscribeProgress,
} from './lib';

type Mode = 'new' | 'inplace';

/** 阶段的进度条宽度：Ghostscript 没有逐页进度，只能给出阶段感 */
const PHASE_WIDTH: Record<string, number> = {prep: 8, compress: 60, verify: 92, done: 100};

function emptyInfo(path: string): PdfCompressInfo {
  return {
    path,
    name: baseName(path),
    size: 0,
    pages: 0,
    version: '',
    encrypted: false,
    needs_password: false,
    error: '',
    ghostscript: {found: false, path: '', version: '', source: ''},
  };
}

/** Ghostscript 来源 → i18n 键后缀（配合 t(`tools.pdfCompressGsSource${...}`) 使用） */
function gsSourceSuffix(source: string): string {
  switch (source) {
    case 'manual':
      return 'Manual';
    case 'registry':
      return 'Registry';
    case 'env':
      return 'Env';
    case 'path':
      return 'Path';
    default:
      return 'Common';
  }
}

/** 分辨率输入：空 = 用档位默认，其它必须是 36–1200 的整数 */
function parseDPI(text: string): {value: number; bad: boolean} {
  const t = text.trim();
  if (!t) return {value: 0, bad: false};
  if (!/^\d{1,4}$/.test(t)) return {value: 0, bad: true};
  const n = Number(t);
  if (n < 36 || n > 1200) return {value: 0, bad: true};
  return {value: n, bad: false};
}

export default function PdfCompressToolDialog({book, onClose, onChanged}: ToolDialogProps) {
  const {t} = useI18n();
  const [src, setSrc] = useState<PdfCompressInfo | null>(() => (book?.path ? emptyInfo(book.path) : null));
  const [password, setPassword] = useState('');
  const [pwInput, setPwInput] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [gs, setGs] = useState<PdfCompressGhostscript | null>(null);
  const [gsNote, setGsNote] = useState('');
  const [gsBusy, setGsBusy] = useState(false);
  const [preset, setPreset] = useState<PdfCompressPreset>('ebook');
  const [dpiText, setDpiText] = useState('');
  const [grayscale, setGrayscale] = useState(false);
  const [engine, setEngine] = useState<PdfCompressEngine>('auto');
  const [mode, setMode] = useState<Mode>('new');
  const [outPath, setOutPath] = useState('');
  const [addToShelf, setAddToShelf] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState<PdfCompressProgress | null>(null);
  const [result, setResult] = useState<PdfCompressResult | null>(null);
  const [err, setErr] = useState('');
  /** 进度事件只在阶段切换时来，用 tick 让「已用时间」继续走 */
  const [, setTick] = useState(0);

  const busyRef = useRef(false);
  const startedAt = useRef(0);

  const loadSource = useCallback(async (path: string) => {
    setResult(null);
    setOutPath('');
    setErr('');
    setGsNote('');
    setPassword('');
    setPwInput('');
    setPwErr('');
    setMode('new');
    setDpiText('');
    setGrayscale(false);
    if (!path) {
      setSrc(null);
      return;
    }
    setSrc(emptyInfo(path));
    try {
      const info = await inspectPdf(path, '');
      setSrc(info);
      setGs(info.ghostscript ?? null);
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
    else detectGhostscript().then(setGs).catch(() => {});
  }, [bookPath, loadSource]);

  // 进度来自 pdfcompress:progress 事件
  useEffect(() => {
    const off = subscribeProgress((p) => {
      if (busyRef.current) setProg(p);
    });
    return off;
  }, []);

  // 压缩中让「已用 {s} 秒」持续刷新
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, [busy]);

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
      const info = await inspectPdf(path, pwInput);
      if (info.pages > 0 && !info.needs_password && !info.error) {
        setPassword(pwInput);
        setSrc(info);
        setGs(info.ghostscript ?? null);
      } else {
        setPwErr(info.error || t('tools.pdfExtractPwWrong'));
      }
    } catch (e) {
      setPwErr(String(e));
    }
  };

  const redetect = async () => {
    setGsBusy(true);
    setErr('');
    setGsNote('');
    try {
      const info = await detectGhostscript();
      setGs(info);
      setGsNote(info.found ? t('tools.pdfCompressGsDetected', {version: info.version || '—'}) : '');
    } catch (e) {
      setErr(String(e));
    } finally {
      setGsBusy(false);
    }
  };

  const pickGs = async () => {
    setGsBusy(true);
    setErr('');
    setGsNote('');
    try {
      const p = await pickGhostscriptExe();
      if (!p) return;
      const info = await detectGhostscript();
      setGs(info);
      setGsNote(t('tools.pdfCompressGsSelected', {path: p}));
    } catch (e) {
      setErr(String(e));
    } finally {
      setGsBusy(false);
    }
  };

  const pages = src?.pages ?? 0;
  const ready = !!src && !src.error && !src.needs_password;

  const dpi = parseDPI(dpiText);
  const gsFound = !!gs?.found;
  // auto：有 Ghostscript 就用，没有就退回 pdfcpu 无损优化
  const effective: PdfCompressEngine = engine === 'auto' ? (gsFound ? 'ghostscript' : 'pdfcpu') : engine;
  const knobOn = effective === 'ghostscript';
  const canRun = ready && !busy && !dpi.bad && (effective !== 'ghostscript' || gsFound);
  const presetInfo = presetDef(preset);

  const pickOut = async () => {
    const path = src?.path ?? '';
    try {
      const p = await pickOutPdfFile(
        defaultOutName(path, t('tools.pdfCompressSuffix')),
        dirOf(outPath) || dirOf(path),
        t('tools.pdfCompressPickOut'),
      );
      if (p) setOutPath(p);
    } catch (e) {
      setErr(String(e));
    }
  };

  const submit = async () => {
    const path = src?.path ?? '';
    if (!path) {
      setErr(t('tools.pdfCompressNoFile'));
      return;
    }
    let out = path;
    if (mode === 'new') {
      out = outPath;
      if (!out) {
        out = await pickOutPdfFile(
          defaultOutName(path, t('tools.pdfCompressSuffix')),
          dirOf(path),
          t('tools.pdfCompressPickOut'),
        );
        if (!out) return;
        setOutPath(out);
      }
    }
    busyRef.current = true;
    startedAt.current = Date.now();
    setBusy(true);
    setErr('');
    setResult(null);
    setProg({phase: 'prep', percent: 5, elapsed: 0});
    try {
      const res = await compressPdf({
        path,
        password,
        out_path: out,
        preset,
        dpi: dpi.value,
        grayscale,
        engine,
        add_to_shelf: mode === 'new' && addToShelf,
      });
      setResult(res);
      setSrc((s) => (s ? {...s, size: res.out_bytes, pages: res.pages || s.pages} : s));
      if (res.added) onChanged();
    } catch (e) {
      setErr(String(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
      setProg(null);
    }
  };

  const done = !!result;
  const elapsed = busy ? (prog?.elapsed ?? (Date.now() - startedAt.current) / 1000) : 0;
  const outName = outPath ? baseName(outPath) : defaultOutName(src?.path ?? '', t('tools.pdfCompressSuffix'));
  const grew = !!result && result.saved_bytes <= 0;

  return (
    <div className="modal-mask" onClick={busy ? undefined : onClose}>
      <div className="modal" style={{width: 680}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>🗜️ {t('tools.pdfCompress')}</h2>
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
            {src?.needs_password && <div className="merge-warn">{t('tools.pdfCompressNeedPw')}</div>}
            {pwErr && <div className="merge-err">{pwErr}</div>}
            {book && <div className="hint">{t('tools.pdfExtractFromShelf', {title: book.title || book.file_name})}</div>}
          </div>

          <div className="form-row" data-field="gs" data-gs-found={gsFound ? '1' : '0'}>
            <label>{t('tools.pdfCompressGsTitle')}</label>
            <div className={`pdf-compress-gs${gsFound ? ' on' : ' off'}`}>
              <span className={`pdf-badge ${gsFound ? 'on' : 'off'}`}>
                {gsFound ? t('tools.pdfCompressGsReady') : t('tools.pdfCompressGsNone')}
              </span>
              {gsFound ? (
                <>
                  <span className="pdf-compress-gs-ver">{gs.version || '—'}</span>
                  <span className="pdf-compress-gs-src">
                    {t('tools.pdfCompressGsFrom', {src: t(`tools.pdfCompressGsSource${gsSourceSuffix(gs?.source ?? '')}`)})}
                  </span>
                  <span className="pdf-compress-gs-path" title={gs?.path}>
                    {gs?.path}
                  </span>
                </>
              ) : (
                <span className="pdf-compress-gs-note">{t('tools.pdfCompressGsMissing')}</span>
              )}
            </div>
            <div className="pdf-compress-btns">
              <button className="btn btn-soft" onClick={pickGs} disabled={busy || gsBusy}>
                {t('tools.pdfCompressGsPick')}
              </button>
              <button className="btn btn-soft" onClick={redetect} disabled={busy || gsBusy}>
                {gsBusy ? t('tools.pdfCompressGsDetecting') : t('tools.pdfCompressGsRedetect')}
              </button>
            </div>
            {!gsFound && <div className="hint">{t('tools.pdfCompressGsHint')}</div>}
            {gsNote && <div className="tool-note ok">{gsNote}</div>}
          </div>

          {ready && (
            <>
              <div className="form-row" data-field="preset">
                <label>{t('tools.pdfCompressPreset')}</label>
                <div className="chip-row">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      className={`chip${preset === p.id ? ' active' : ''}`}
                      onClick={() => {
                        setPreset(p.id);
                        setResult(null);
                      }}
                      disabled={busy}
                    >
                      {t(p.labelKey)}
                    </button>
                  ))}
                </div>
                <div className="hint">{t(presetInfo.hintKey)}</div>
              </div>

              <div className="form-row" data-field="dpi">
                <label>{t('tools.pdfCompressDpi')}</label>
                <div className="pdf-compress-row">
                  <input
                    type="number"
                    min={36}
                    max={1200}
                    value={dpiText}
                    placeholder={`${presetInfo.dpi}`}
                    onChange={(e) => setDpiText(e.target.value)}
                    disabled={busy || !knobOn}
                  />
                  <label className="pdf-compress-check">
                    <input
                      type="checkbox"
                      checked={grayscale}
                      onChange={(e) => setGrayscale(e.target.checked)}
                      style={{width: 'auto'}}
                      disabled={busy || !knobOn}
                    />
                    {t('tools.pdfCompressGray')}
                  </label>
                </div>
                {dpi.bad ? (
                  <div className="merge-err">{t('tools.pdfCompressDpiBad')}</div>
                ) : (
                  <div className="hint">
                    {knobOn ? t('tools.pdfCompressDpiHint') : t('tools.pdfCompressKnobsOff')}
                  </div>
                )}
              </div>

              <div className="form-row" data-field="engine">
                <label>{t('tools.pdfCompressEngine')}</label>
                <div className="chip-row">
                  {ENGINES.map((e) => (
                    <button
                      key={e.id}
                      className={`chip${engine === e.id ? ' active' : ''}`}
                      onClick={() => {
                        setEngine(e.id);
                        setResult(null);
                      }}
                      disabled={busy}
                    >
                      {t(e.labelKey)}
                    </button>
                  ))}
                </div>
                <div className="hint">
                  {t(ENGINES.find((e) => e.id === engine)?.hintKey ?? 'tools.pdfCompressEngineAutoHint')}
                </div>
                {engine === 'ghostscript' && !gsFound && (
                  <div className="merge-warn">{t('tools.pdfCompressGsMissingWarn')}</div>
                )}
                {engine === 'auto' && !gsFound && (
                  <div className="hint">{t('tools.pdfCompressAutoFallback')}</div>
                )}
              </div>

              <div className="form-row" data-field="mode">
                <label>{t('tools.pdfMetaMode')}</label>
                <div className="chip-row">
                  <button className={`chip${mode === 'new' ? ' active' : ''}`} onClick={() => setMode('new')} disabled={busy}>
                    {t('tools.pdfMetaModeNew')}
                  </button>
                  {!src?.encrypted && (
                    <button
                      className={`chip${mode === 'inplace' ? ' active' : ''}`}
                      onClick={() => setMode('inplace')}
                      disabled={busy}
                    >
                      {t('tools.pdfMetaModeInPlace')}
                    </button>
                  )}
                </div>
                {src?.encrypted ? (
                  <div className="merge-warn">{t('tools.pdfCompressEncWarn')}</div>
                ) : (
                  mode === 'inplace' && <div className="merge-warn">{t('tools.pdfMetaInPlaceWarn')}</div>
                )}
              </div>

              {mode === 'new' && (
                <div className="form-row" data-field="out">
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
                  <label className="pdf-compress-check" style={{marginTop: 6}}>
                    <input
                      type="checkbox"
                      checked={addToShelf}
                      onChange={(e) => setAddToShelf(e.target.checked)}
                      style={{width: 'auto'}}
                      disabled={busy}
                    />
                    {t('tools.pdfCompressAddToShelf')}
                  </label>
                </div>
              )}
            </>
          )}

          {busy && (
            <div className="form-row" data-field="progress">
              <div className="progress-track">
                <div className="fill" style={{width: `${PHASE_WIDTH[prog?.phase ?? 'prep'] ?? 8}%`}} />
              </div>
              <div className="hint">
                {t(`tools.pdfCompressPhase${phaseSuffix(prog?.phase ?? 'prep')}`)} ·{' '}
                {t('tools.pdfCompressElapsed', {s: elapsed.toFixed(1)})}
              </div>
            </div>
          )}

          {err && <div className="tool-note err">{err}</div>}
          {done && (
            <div className="tool-note ok" data-testid="compress-done">
              <div>✅ {result.in_place ? t('tools.pdfCompressDoneInPlace') : t('tools.pdfCompressDoneNew')}</div>
              <div style={{marginTop: 4}}>{baseName(result.path)}</div>
              <div className="pdf-compress-stats">
                <span className="pdf-compress-saved">{percentText(result.saved_percent)}</span>
                <span>
                  {humanSize(result.in_bytes)} → {humanSize(result.out_bytes)}
                </span>
              </div>
              <div className="pdf-compress-meta">
                {t('tools.pdfCompressResultMeta', {
                  engine: engineName(result.engine),
                  dpi: result.dpi > 0 ? result.dpi : presetInfo.dpi,
                  pages: result.pages,
                  s: result.seconds.toFixed(1),
                })}
              </div>
              {grew && <div style={{marginTop: 4}}>⚠️ {t('tools.pdfCompressGrew')}</div>}
              {result.shelf_error && (
                <div style={{marginTop: 4}}>⚠️ {t('tools.pdfEpubShelfErr', {msg: result.shelf_error})}</div>
              )}
              {!result.in_place && !result.shelf_error && result.added && (
                <div style={{marginTop: 4, opacity: 0.85}}>{t('tools.pdfEpubAdded')}</div>
              )}
            </div>
          )}
          {!done && !busy && <div className="hint">{t('tools.pdfCompressHint')}</div>}
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
            <button className="btn btn-primary" onClick={submit} disabled={!canRun}>
              {busy ? t('tools.pdfCompressWorking') : t('tools.pdfCompressStart')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
