// 工具（Tools）插件约定 —— 每个工具一个目录：
//
//   src/tools/<tool-id>/define.ts   工具元信息：名称 / 描述（i18n 键）、分类（类型）、图标、排序
//   src/tools/<tool-id>/lib.ts      该工具用到的后端调用封装（wails bindings）
//   src/tools/<tool-id>/tools.tsx   工具弹窗页面（默认导出 React 组件）
//   src/tools/<tool-id>/page.tsx    整页工具页面（define.ts 里声明 page 字段时用，替代 tools.tsx）
//
// 目录名即工具 id；新增工具只要新建目录，src/tools/index.ts 会自动发现，
// 工具页按 category 分组展示，书架右键的「<分类>工具」子菜单通过 bookFormats 匹配。
//
// 「整页工具」与「弹窗工具」二选一：声明了 page（= App 的路由 key，如 'tags'）
// 的工具点击后切到该整页（侧栏同名入口共用同一实现），否则弹出 tools.tsx。

import type {ComponentType} from 'react';
import type {Book, Settings, Tag} from '../types';

/** 工具分类（类型）：决定工具页分组与书架右键子菜单 */
export type ToolCategory = 'other' | 'pdf' | 'epub';

/** define.ts 导出的工具元信息 */
export interface ToolDef {
  /** 分类：other=通用工具，pdf=PDF 工具，epub=EPUB 工具 */
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
  /**
   * 整页工具：值 = App 的 Page 路由 key（如 'tags'）。
   * 声明后工具入口直接切到该页面而不是弹窗，目录里放 page.tsx。
   */
  page?: string;
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

/** 宿主传给整页工具的上下文 */
export interface ToolPageProps {
  /** 全部标签（标签页需要） */
  tags: Tag[];
  /** 跳到书架并按这些标签筛选（标签数量入口） */
  onOpenShelf: (tagIDs: number[]) => void;
  /** 数据已变化 → 宿主刷新书架 / 标签 / 统计 */
  onChanged: () => void;
}

/** 注册表条目：元信息 + 弹窗组件（tools.tsx）或整页组件（page.tsx） */
export interface ToolModule extends ToolDef {
  /** 目录名 */
  id: string;
  /** tools.tsx 的默认导出 */
  Dialog?: ComponentType<ToolDialogProps>;
  /** page.tsx 的默认导出（配合 def.page） */
  Page?: ComponentType<ToolPageProps>;
}
