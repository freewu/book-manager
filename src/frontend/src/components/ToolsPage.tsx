// 工具页：按分类展示 src/tools/<id>/ 里注册的工具。
// 工具卡片由各工具的 define.ts（名称 / 分类 / 图标 / 排序）自动生成。
import React from 'react';
import {useI18n} from '../i18n';
import {TOOL_CATEGORIES, toolsOf} from '../tools';
import type {ToolDef} from '../tools/types';

interface Props {
  /** 卡片角标数量（键为 define.ts 的 badgeKey，如 misrecords） */
  badges: Record<string, number>;
  onOpenTool: (id: string) => void;
}

export default function ToolsPage({badges, onOpenTool}: Props) {
  const {t} = useI18n();

  return (
    <div className="main">
      <div className="toolbar">
        <span className="title">{t('tools.title')}</span>
      </div>

      <div className="page-scroll">
        {TOOL_CATEGORIES.map((cat) => {
          const items = toolsOf(cat);
          if (items.length === 0) return null;
          return (
            <div className="page-section" key={cat}>
              <h2 className="page-section-title">{t(`tools.category.${cat}`)}</h2>
              <div className="tools-grid">
                {items.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    tool={tool}
                    action={t(tool.actionKey || 'tools.open')}
                    badge={tool.badgeKey ? badges[tool.badgeKey] : undefined}
                    onClick={() => onOpenTool(tool.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToolCard({
  tool,
  action,
  badge,
  onClick,
}: {
  tool: ToolDef;
  action: string;
  badge?: number;
  onClick: () => void;
}) {
  const {t} = useI18n();
  return (
    <div className="tool-card clickable" onClick={onClick}>
      <span className="tool-icon">{tool.icon}</span>
      <span className="tool-title">
        {t(tool.nameKey)}
        {badge !== undefined && badge > 0 && <span className="nav-badge mis-badge">{badge}</span>}
      </span>
      <span className="tool-desc">{t(tool.descKey)}</span>
      <span className="tool-action">{action} ›</span>
    </div>
  );
}
