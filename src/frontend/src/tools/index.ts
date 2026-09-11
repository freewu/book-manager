// 工具注册表：自动发现 src/tools/<id>/{define.ts,tools.tsx}。
import type {ComponentType} from 'react';
import type {Book} from '../types';
import type {ToolCategory, ToolDef, ToolDialogProps, ToolModule} from './types';

const defineModules = import.meta.glob('./*/define.ts', {eager: true}) as Record<string, {def: ToolDef}>;
const dialogModules = import.meta.glob('./*/tools.tsx', {eager: true}) as Record<
  string,
  {default: ComponentType<ToolDialogProps>}
>;

/** './pdf-password/define.ts' → 'pdf-password' */
function toolId(path: string): string {
  return path.split('/')[1];
}

/** 工具页分类展示顺序 */
export const TOOL_CATEGORIES: ToolCategory[] = ['other', 'pdf'];

export const TOOLS: ToolModule[] = Object.entries(defineModules)
  .map(([path, mod]) => {
    const id = toolId(path);
    const dialog = dialogModules[`./${id}/tools.tsx`]?.default;
    if (!dialog) {
      throw new Error(`tools/${id}/tools.tsx 缺少默认导出的弹窗组件`);
    }
    return {...mod.def, id, Dialog: dialog};
  })
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id));

/** 按分类取工具 */
export function toolsOf(category: ToolCategory): ToolModule[] {
  return TOOLS.filter((x) => x.category === category);
}

/** 按 id 取工具 */
export function getTool(id: string): ToolModule | undefined {
  return TOOLS.find((x) => x.id === id);
}

/** 能作用于某本书的工具（书架右键子菜单用） */
export function toolsForBook(book: Book): ToolModule[] {
  if (!book.format) return [];
  const format = book.format.toLowerCase();
  return TOOLS.filter((x) => (x.bookFormats ?? []).map((f) => f.toLowerCase()).includes(format));
}
