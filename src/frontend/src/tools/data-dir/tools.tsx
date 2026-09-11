// 数据目录 —— 工具弹窗。
import React, {useEffect, useState} from 'react';
import {useI18n} from '../../i18n';
import {useToast} from '../../components/Toast';
import type {ToolDialogProps} from '../types';
import {dataDirPath, openPath} from './lib';

export default function DataDirToolDialog({onClose}: ToolDialogProps) {
  const {t} = useI18n();
  const toast = useToast();
  const [dir, setDir] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    dataDirPath()
      .then((d) => setDir(d || ''))
      .catch(() => setDir(''));
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dir);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      toast.err(String(e));
    }
  };

  const open = async () => {
    try {
      await openPath(dir);
    } catch (e) {
      toast.err(String(e));
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{width: 560}} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('tools.dataDir')}</h2>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p style={{margin: '0 0 12px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6}}>
            {t('tools.dataDirIntro')}
          </p>
          <div className="form-row">
            <label>{t('tools.dataDirPath')}</label>
            <div className="path-box" title={dir}>
              {dir || '—'}
            </div>
            <div className="hint">{t('tools.dataDirHint')}</div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-soft" onClick={copy} disabled={!dir}>
            {copied ? t('tools.dataDirCopied') : t('tools.dataDirCopy')}
          </button>
          <button className="btn btn-primary" onClick={open} disabled={!dir}>
            {t('tools.dataDirOpen')}
          </button>
        </div>
      </div>
    </div>
  );
}
