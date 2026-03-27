'use client';

import { useState } from 'react';
import GeneratedReportDetail from './GeneratedReportDetail';
import {
  copyGeneratedReportLink,
  downloadGeneratedReport,
  getGeneratedReportActionLabel,
} from '../lib/generated-reports';

export default function InsightPanel({
  collapsed = false,
  onToggleCollapsed,
  reportItems = [],
  selectedReportId,
  onSelectReport,
  onDeleteReport,
  onReviseReport,
}) {
  const [drafts, setDrafts] = useState({});
  const [submittingId, setSubmittingId] = useState('');
  const [feedbackById, setFeedbackById] = useState({});

  async function handlePrimaryAction(item) {
    if (!item) return;
    if (item.kind === 'table' || item.format === 'ppt' || item.format === 'pdf' || item.downloadUrl) {
      downloadGeneratedReport(item);
      return;
    }
    await copyGeneratedReportLink(item);
  }

  async function handleRevise(item) {
    const instruction = String(drafts[item.id] || '').trim();
    if (!instruction || !onReviseReport) return;

    try {
      setSubmittingId(item.id);
      setFeedbackById((prev) => ({
        ...prev,
        [item.id]: { type: 'pending', message: '正在根据你的要求更新当前报表。' },
      }));
      const result = await onReviseReport(item.id, instruction);
      setDrafts((prev) => ({ ...prev, [item.id]: '' }));
      setFeedbackById((prev) => ({
        ...prev,
        [item.id]: {
          type: 'success',
          message: result?.message || '当前报表已按你的要求更新。',
        },
      }));
    } catch (error) {
      setFeedbackById((prev) => ({
        ...prev,
        [item.id]: {
          type: 'error',
          message: error instanceof Error ? error.message : '当前报表调整失败，请稍后再试。',
        },
      }));
      throw error;
    } finally {
      setSubmittingId('');
    }
  }

  if (collapsed) {
    return (
      <aside className="insight-panel insight-panel-collapsed">
        <button className="ghost-btn insight-collapse-handle" onClick={onToggleCollapsed} type="button">
          展开报表列表
        </button>
      </aside>
    );
  }

  return (
    <aside className="insight-panel report-center-panel">
      <button className="ghost-btn insight-collapse-handle" onClick={onToggleCollapsed} type="button">
        收起
      </button>

      <div className="insight-panel-header">
        <div>
          <h3>已出报表</h3>
          <p>查看当前结果，并继续按自然语言调整。</p>
        </div>
      </div>

      {!reportItems.length ? (
        <section className="card report-empty-card">
          <h4>还没有已出报表</h4>
          <p>左侧对话生成表格、静态页、PPT 或文档后，这里会自动沉淀结果。</p>
        </section>
      ) : (
        <section className="report-center-list">
          {reportItems.map((item) => {
            const expanded = item.id === selectedReportId;
            const feedback = feedbackById[item.id];

            return (
              <article className={`card report-list-card ${expanded ? 'report-list-card-active' : ''}`} key={item.id}>
                <button
                  className="report-list-trigger"
                  type="button"
                  onClick={() => onSelectReport?.(expanded ? '' : item.id)}
                >
                  <span className="report-list-title">{item.title}</span>
                </button>

                {expanded ? (
                  <div className="report-list-expanded">
                    <div className="report-list-actions">
                      <button className="ghost-btn" type="button" onClick={() => void handlePrimaryAction(item)}>
                        {getGeneratedReportActionLabel(item)}
                      </button>
                      <button className="ghost-btn" type="button" onClick={() => onDeleteReport?.(item.id)}>
                        删除
                      </button>
                    </div>

                    <GeneratedReportDetail item={item} />

                    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                      <div style={{ fontWeight: 700 }}>继续调整这份报表</div>
                      <textarea
                        className="filter-input"
                        rows={3}
                        placeholder="例如：改成更适合管理层查看，突出风险点和行动建议。"
                        value={drafts[item.id] || ''}
                        onChange={(event) => setDrafts((prev) => ({ ...prev, [item.id]: event.target.value }))}
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
                          disabled={submittingId === item.id || !String(drafts[item.id] || '').trim()}
                          onClick={() => void handleRevise(item)}
                        >
                          {submittingId === item.id ? '调整中...' : '按要求调整'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </aside>
  );
}
