// 宿主：渲染当前打开的「工具」弹窗（lib.ts 里的后端调用由各工具自己的 tools.tsx 使用）。
import React from 'react';
import type {Book, Settings, Tag} from '../types';
import {getTool} from './index';

export interface ActiveTool {
  id: string;
  book?: Book | null;
}

interface Props {
  tool: ActiveTool | null;
  settings: Settings;
  tags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ToolHost({tool, settings, tags, onClose, onChanged}: Props) {
  if (!tool) return null;
  const mod = getTool(tool.id);
  if (!mod) return null;
  // 整页工具（如「标签管理」）由侧栏入口切页打开，宿主不弹窗。
  if (!mod.Dialog) return null;
  const Dialog = mod.Dialog;
  return (
    <Dialog
      book={tool.book ?? null}
      settings={settings}
      tags={tags}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}
