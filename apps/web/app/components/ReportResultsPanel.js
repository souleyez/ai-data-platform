'use client';

import { useEffect, useRef, useState } from 'react';
import GeneratedReportDetail from './GeneratedReportDetail';
import {
  downloadGeneratedReportAs,
  formatGeneratedReportTime,
  getGeneratedReportShareActions,
} from '../lib/generated-reports';

function ReportShareActions({ item }) {
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

function ReportResultItem({
  item,
  expanded,
  collapsed,
  onSelect,
  onDeleteReport,
  onReviseReport,
  onRequestExpand,
}) {
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function handleRevise() {
    const instruction = String(draft || '').trim();
    if (!instruction || !onReviseReport) return;

    try {
      setSubmitting(true);
      setFeedback({ type: 'pending', message: '正在根据你的要求调整当前报表。' });
      const result = await onReviseReport(item.id, instruction);
      setDraft('');
      setFeedback({
        type: 'success',
        message: result?.message || '已按你的要求更新当前报表。',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : '当前报表调整失败，请稍后再试。',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const metaLabel = item.templateLabel || item.outputType || item.kind || '报表';

  return (
    <article className={`card report-list-card ${expanded ? 'report-list-card-active' : ''}`}>
      <button
        className="report-list-trigger"
        type="button"
        onClick={() => {
          if (collapsed) {
            onRequestExpand?.(item.id);
            return;
          }
          onSelect?.(expanded ? '' : item.id);
        }}
      >
        <span className="report-list-title-row">
          <span className="report-list-title">{item.title}</span>
          <span className="report-list-meta">{formatGeneratedReportTime(item.createdAt)}</span>
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

          {onReviseReport ? (
            <div className="report-revise-box">
              <div className="report-revise-title">继续调整这份报表</div>
              <textarea
                className="filter-input"
                rows={3}
                placeholder="例如：改成更适合管理层查看，突出风险点和行动建议。"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              {feedback?.message ? (
                <div
                  className="capture-task-note"
                  style={{
                    color:
                      feedback.type === 'error'
                        ? '#b91c1c'
                        : feedback.type === 'success'
                          ? '#166534'
                          : '#475569',
                  }}
                >
                  {feedback.message}
                </div>
              ) : null}
              <div>
                <button
                  className="primary-btn"
                  type="button"
                  disabled={submitting || !String(draft || '').trim()}
                  onClick={() => void handleRevise()}
                >
                  {submitting ? '调整中...' : '按要求调整'}
                </button>
              </div>
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
  onSelectReport,
  onDeleteReport,
  onReviseReport,
  collapsed = false,
  onToggleCollapsed,
  onRequestExpand,
  className = '',
}) {
  const [internalSelectedId, setInternalSelectedId] = useState('');
  const controlled = typeof onSelectReport === 'function';
  const activeId = controlled ? selectedReportId : internalSelectedId;
  const hasAutoSelectedRef = useRef(false);

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

  return (
    <section className={`card documents-card report-results-card ${className}`.trim()}>
      <div className="panel-header report-results-header">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        {onToggleCollapsed ? (
          <button className="ghost-btn report-panel-toggle" type="button" onClick={onToggleCollapsed}>
            {collapsed ? '展开报表' : '收起'}
          </button>
        ) : null}
      </div>

      {!items.length ? (
        <section className="report-empty-card">
          <h4>还没有已出报表</h4>
          <p>生成表格、静态页、PPT 或文档后，这里会自动沉淀结果。</p>
        </section>
      ) : (
        <div className="reports-scroll-panel report-results-scroll">
          <section className={`report-center-list ${collapsed ? 'report-center-list-compact' : ''}`}>
            {items.map((item) => (
              <ReportResultItem
                key={item.id}
                item={item}
                expanded={!collapsed && item.id === activeId}
                collapsed={collapsed}
                onSelect={handleSelect}
                onDeleteReport={onDeleteReport}
                onReviseReport={onReviseReport}
                onRequestExpand={onRequestExpand}
              />
            ))}
          </section>
        </div>
      )}
    </section>
  );
}
