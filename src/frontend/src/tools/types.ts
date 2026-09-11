// 工具（Tools）插件约定 —— 每个工具一个目录：
//
//   src/tools/<tool-id>/define.ts   工具元信息：名称 / 描述（i18n 键）、分类（类型）、图标、排序
//   src/tools/<tool-id>/lib.ts      该工具用到的后端调用封装（wails bindings）
//   src/tools/<tool-id>/tools.tsx   工具弹窗页面（默认导出 React 组件）
//
// 目录名即工具 id；新增工具只要新建目录，src/tools/index.ts 会自动发现，
// 工具页按 category 分组展示，书架右键的「<分类>工具」子菜单通过 bookFormats 匹配。

import type {ComponentType} from 'react';
import type {Book, Settings, Tag} from '../types';

/** 工具分类（类型）：决定工具页分组与书架右键子菜单 */
export type ToolCategory = 'other' | 'pdf';

/** define.ts 导出的工具元信息 */
export interface ToolDef {
  /** 分类：other=通用工具，pdf=PDF 工具 */
  category: ToolCategory;
  /** 卡片图标（emoji） */
  icon: string;
  /** i18n 键：工具名称 */
  nameKey: string;
  /** i18n 键：工具描述 */
  descKey: string;
  /** 分类内排序，越小越靠前 */
  order?: number;
  /** 该工具作用于哪些书籍格式（书架右键子菜单据此显示） */
  bookFormats?: string[];
  /** 卡片角标数量来源（宿主提供的 badges 键名，如 misrecords，不是 i18n key） */
  badgeKey?: string;
}

/** 宿主传给工具弹窗的上下文 */
export interface ToolDialogProps {
  /** 从书架右键等入口带进来的书籍 */
  book?: Book | null;
  /** 应用设置（扫描工具需要） */
  settings: Settings;
  /** 标签列表（标签工具需要） */
  tags: Tag[];
  /** 关闭弹窗 */
  onClose: () => void;
  /** 数据已变化 → 宿主刷新书架 / 标签 / 统计 */
  onChanged: () => void;
}

/** 注册表条目：元信息 + 弹窗组件 */
export interface ToolModule extends ToolDef {
  /** 目录名 */
  id: string;
  /** tools.tsx 的默认导出 */
  Dialog: ComponentType<ToolDialogProps>;
}
