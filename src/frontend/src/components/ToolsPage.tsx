// 工具页：按分类展示 src/tools/<id>/ 里注册的工具。
// 工具卡片由各工具的 define.ts（名称 / 分类 / 图标 / 排序）自动生成；
// 顶部可按分类筛选（全部 / 其他 / PDF / EPUB ...），分类列表同样来自注册表。
import React, {useState} from 'react';
import {useI18n} from '../i18n';
import {TOOLS, TOOL_CATEGORIES, toolsOf} from '../tools';
import type {ToolCategory, ToolDef} from '../tools/types';

interface Props {
  /** 卡片角标数量（键为 define.ts 的 badgeKey，如 misrecords） */
  badges: Record<string, number>;
  onOpenTool: (id: string) => void;
}

/** 'all' = 不筛选 */
type Filter = ToolCategory | 'all';

export default function ToolsPage({badges, onOpenTool}: Props) {
  const {t} = useI18n();
  const [filter, setFilter] = useState<Filter>('all');

  // 只显示有工具的分类
  const sections = TOOL_CATEGORIES.map((cat) => [cat, toolsOf(cat)] as const).filter(
    ([, items]) => items.length > 0,
  );

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">{t('tools.title')}</span>
      </div>

      <div className="filter-bar">
        <span className="filter-label">{t('tools.filterType')}</span>
        <div className="chip-row">
          <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            {t('tools.filterAll')}
            <span className="chip-cnt">{TOOLS.length}</span>
          </button>
          {sections.map(([cat, items]) => (
            <button
              key={cat}
              className={`chip ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {t(`tools.category.${cat}`)}
              <span className="chip-cnt">{items.length}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="page-scroll">
        {sections
          .filter(([cat]) => filter === 'all' || filter === cat)
          .map(([cat, items]) => (
            <div className="page-section" key={cat}>
              <h2 className="page-section-title">{t(`tools.category.${cat}`)}</h2>
              <div className="tools-grid">
                {items.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    badge={tool.badgeKey ? badges[tool.badgeKey] : undefined}
                    onClick={() => onOpenTool(tool.id)}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function ToolCard({
  tool,
  badge,
  onClick,
}: {
  tool: ToolDef;
  badge?: number;
  onClick: () => void;
}) {
  const {t} = useI18n();
  return (
    <div className="tool-card clickable" onClick={onClick}>
      <span className="tool-head">
        <span className="tool-icon">{tool.icon}</span>
        <span className="tool-title">{t(tool.nameKey)}</span>
        {badge !== undefined && badge > 0 && <span className="nav-badge mis-badge">{badge}</span>}
      </span>
      <span className="tool-desc">{t(tool.descKey)}</span>
    </div>
  );
}
