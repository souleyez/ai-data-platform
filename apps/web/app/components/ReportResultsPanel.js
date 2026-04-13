'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  buildDraftEditorPath,
  downloadGeneratedReportAs,
  formatGeneratedReportTime,
  getGeneratedReportShareActions,
} from '../lib/generated-reports';

const GeneratedReportDetail = dynamic(() => import('./GeneratedReportDetail'));

function ReportShareActions({ item }) {
  if (item?.status === 'processing') return null;
  const actions = getGeneratedReportShareActions(item);
  if (!actions.length) return null;

  return (
    <div className="report-list-actions">
      {actions.map((action) => (
        <button
          key={action.key}
          className="ghost-btn"
          type="button"
          onClick={() => void downloadGeneratedReportAs(item, action.key)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}

function formatReportStatus(status) {
  if (status === 'processing') return '生成中';
  if (status === 'failed') return '生成失败';
  return '已完成';
}

function hasEditableDraft(item) {
  return Boolean(item?.kind === 'page' && item?.draft?.modules?.length);
}

function getDraftReadinessMeta(readiness) {
  if (readiness === 'ready') return { label: '可终稿', className: 'is-ready' };
  if (readiness === 'blocked') return { label: '需先补齐', className: 'is-blocked' };
  if (readiness === 'needs_attention') return { label: '可继续优化', className: 'is-warning' };
  return null;
}

function ReportResultItem({
  item,
  expanded,
  collapsed,
  onSelect,
  onDeleteReport,
  onRequestExpand,
  stickySelection = false,
}) {
  const metaLabel = item.templateLabel || item.outputType || item.kind || '报表';
  const statusLabel = formatReportStatus(item.status);
  const readinessMeta = getDraftReadinessMeta(item?.draft?.readiness);

  return (
    <article className={`card report-list-card ${expanded ? 'report-list-card-active' : ''}`}>
      <button
        className="report-list-trigger"
        type="button"
        onClick={() => {
          if (collapsed && onRequestExpand) {
            onRequestExpand?.(item.id);
            return;
          }
          onSelect?.(expanded && !stickySelection ? '' : item.id);
        }}
      >
        <span className="report-list-title-row">
          <span className="report-list-title">{item.title}</span>
          <span className="report-list-meta">
            {formatGeneratedReportTime(item.createdAt)} · {statusLabel}
            {readinessMeta ? (
              <span className={`report-list-chip ${readinessMeta.className}`.trim()}>{readinessMeta.label}</span>
            ) : null}
          </span>
        </span>
        <span className="report-list-subtitle">{metaLabel}</span>
      </button>

      {expanded && !collapsed ? (
        <div className="report-list-expanded">
          <ReportShareActions item={item} />

          <GeneratedReportDetail item={item} />

          {onDeleteReport ? (
            <div className="report-list-actions">
              <button className="ghost-btn" type="button" onClick={() => onDeleteReport(item.id)}>
                删除报表
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default function ReportResultsPanel({
  title = '已出报表',
  description = '',
  items = [],
  selectedReportId = '',
  activeItemOverride = null,
  activeItemLoading = false,
  onSelectReport,
  onDeleteReport,
  collapsed = false,
  onToggleCollapsed,
  onRequestExpand,
  mobileViewport = false,
  className = '',
  showStepper = true,
  featuredExpanded = false,
  onItemChange,
}) {
  const [internalSelectedId, setInternalSelectedId] = useState('');
  const controlled = typeof onSelectReport === 'function';
  const activeId = controlled ? selectedReportId : internalSelectedId;
  const hasAutoSelectedRef = useRef(false);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const activeItem = activeItemOverride || (activeIndex >= 0 ? items[activeIndex] : items[0] || null);
  const canStep = items.length > 1 && activeIndex >= 0;
  const activeItemCanEditDraft = hasEditableDraft(activeItem);
  const activeItemReadiness = getDraftReadinessMeta(activeItem?.draft?.readiness);

  useEffect(() => {
    if (controlled) return;

    if (!items.length) {
      setInternalSelectedId('');
      hasAutoSelectedRef.current = false;
      return;
    }

    const hasActive = items.some((item) => item.id === activeId);
    if (activeId) {
      if (!hasActive && !collapsed) {
        setInternalSelectedId(items[0].id);
      }
      hasAutoSelectedRef.current = true;
      return;
    }

    if (!collapsed && !hasAutoSelectedRef.current) {
      setInternalSelectedId(items[0].id);
      hasAutoSelectedRef.current = true;
    }
  }, [activeId, collapsed, controlled, items]);

  function handleSelect(nextId) {
    if (controlled) {
      onSelectReport?.(nextId);
      return;
    }
    setInternalSelectedId(nextId);
  }

  function stepSelection(offset) {
    if (!canStep) return;
    const nextIndex = (activeIndex + offset + items.length) % items.length;
    handleSelect(items[nextIndex]?.id || '');
  }

  function renderCompactList() {
    return (
      <section className={`report-center-list ${collapsed ? 'report-center-list-compact' : ''}`}>
        {items.map((item) => (
          <ReportResultItem
            key={item.id}
            item={item}
            expanded={!collapsed && item.id === activeId}
            collapsed={collapsed}
            onSelect={handleSelect}
            onDeleteReport={onDeleteReport}
            onRequestExpand={onRequestExpand}
          />
        ))}
      </section>
    );
  }

  function renderFeaturedExpanded() {
    return (
      <div className="report-results-featured-shell">
        <aside className="report-results-featured-list">
          <div className="report-results-featured-list-head">
            <strong>已出报表</strong>
            <span>{items.length} 份</span>
          </div>
          <section className="report-center-list report-center-list-featured">
            {items.map((item) => (
              <ReportResultItem
                key={item.id}
                item={item}
                expanded={item.id === activeId}
                collapsed
                onSelect={handleSelect}
                onDeleteReport={onDeleteReport}
                onRequestExpand={onRequestExpand}
                stickySelection
              />
            ))}
          </section>
        </aside>

        <section className="report-results-featured-main">
          <div className="panel-header report-results-featured-header">
            <div className="report-results-featured-copy">
              <h3>{activeItem?.title || title}</h3>
              <p>
                {activeItem
                  ? `${formatGeneratedReportTime(activeItem.createdAt)} · ${formatReportStatus(activeItem.status)}`
                  : '选择一份报表后可在这里展开查看、切换和编辑。'}
              </p>
              {activeItemReadiness ? (
                <div className={`report-list-chip ${activeItemReadiness.className}`.trim()}>{activeItemReadiness.label}</div>
              ) : null}
            </div>
            <div className="report-results-toolbar">
              {activeItemCanEditDraft ? (
                <Link className="ghost-btn compact-inline-btn is-active" href={buildDraftEditorPath(activeItem)}>
                  进入编辑
                </Link>
              ) : null}
              {canStep ? (
                <div className="report-results-stepper">
                  <button className="ghost-btn compact-inline-btn" type="button" onClick={() => stepSelection(-1)}>
                    上一份
                  </button>
                  <button className="ghost-btn compact-inline-btn" type="button" onClick={() => stepSelection(1)}>
                    下一份
                  </button>
                </div>
              ) : null}
              {onToggleCollapsed ? (
                <button className="ghost-btn report-panel-toggle" type="button" onClick={onToggleCollapsed}>
                  收起
                </button>
              ) : null}
            </div>
          </div>

          {activeItem ? (
            <div className="report-results-featured-body">
              {activeItemLoading ? (
                <section className="report-empty-card">
                  <h4>正在加载报表详情</h4>
                  <p>列表已经可用，当前选中的报表详情正在按需加载。</p>
                </section>
              ) : null}
              {!activeItemLoading ? (
                <>
                  <div className="report-results-featured-actions">
                    <ReportShareActions item={activeItem} />
                    {activeItemCanEditDraft ? (
                      <Link className="ghost-btn" href={buildDraftEditorPath(activeItem)}>
                        打开独立编辑页
                      </Link>
                    ) : null}
                    {onDeleteReport ? (
                      <button className="ghost-btn" type="button" onClick={() => onDeleteReport(activeItem.id)}>
                        删除报表
                      </button>
                    ) : null}
                  </div>
                  <div className="report-results-featured-preview">
                    <GeneratedReportDetail item={activeItem} />
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <section className="report-empty-card">
              <h4>还没有已出报表</h4>
              <p>生成表格、静态页、PPT 或文档后，这里会自动沉淀结果。</p>
            </section>
          )}
        </section>
      </div>
    );
  }

  return (
    <section className={`card documents-card report-results-card ${className}`.trim()}>
      {!items.length ? (
        <>
          <div className="panel-header report-results-header">
            <div>
              <h3>{title}</h3>
              {description ? <p>{description}</p> : null}
            </div>
            <div className="report-results-toolbar">
              {onToggleCollapsed ? (
                <button className="ghost-btn report-panel-toggle" type="button" onClick={onToggleCollapsed}>
                  {collapsed ? '展开报表' : mobileViewport ? '长按侧边收起' : '收起'}
                </button>
              ) : null}
            </div>
          </div>
          <section className="report-empty-card">
            <h4>还没有已出报表</h4>
            <p>生成表格、静态页、PPT 或文档后，这里会自动沉淀结果。</p>
          </section>
        </>
      ) : featuredExpanded && !collapsed && !mobileViewport ? (
        renderFeaturedExpanded()
      ) : (
        <div className="reports-scroll-panel report-results-scroll">
          <div className="panel-header report-results-header">
            <div>
              <h3>{title}</h3>
              {description ? <p>{description}</p> : null}
            </div>
            <div className="report-results-toolbar">
              {showStepper && canStep ? (
                <div className="report-results-stepper">
                  <button className="ghost-btn compact-inline-btn" type="button" onClick={() => stepSelection(-1)}>
                    上一份
                  </button>
                  <button className="ghost-btn compact-inline-btn" type="button" onClick={() => stepSelection(1)}>
                    下一份
                  </button>
                </div>
              ) : null}
              {onToggleCollapsed ? (
                <button className="ghost-btn report-panel-toggle" type="button" onClick={onToggleCollapsed}>
                  {collapsed ? '展开报表' : mobileViewport ? '长按侧边收起' : '收起'}
                </button>
              ) : null}
            </div>
          </div>
          {renderCompactList()}
        </div>
      )}
    </section>
  );
}
