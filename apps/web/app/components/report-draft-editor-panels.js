'use client';

import { buildRestorePreview, formatHistoryTime } from './report-draft-editor-helpers';

function DraftReadinessPanel({ draft, readinessMeta, visualMixSummary }) {
  return (
    <div className="report-draft-readiness">
      <div className="report-draft-readiness-summary">
        <div>
          <strong>终稿就绪度</strong>
          <span className={`report-draft-readiness-badge ${readinessMeta.className}`.trim()}>
            {readinessMeta.label}
          </span>
        </div>
        {draft?.evidenceCoverage ? (
          <span className="report-draft-readiness-note">
            证据/数据覆盖 {draft.evidenceCoverage.coveredModules}/{draft.evidenceCoverage.totalModules}
          </span>
        ) : null}
      </div>
      {Array.isArray(draft?.qualityChecklist) && draft.qualityChecklist.length ? (
        <div className="report-draft-checklist">
          {draft.qualityChecklist.map((item) => (
            <div
              key={item.key || item.label}
              className={`report-draft-checklist-item is-${item.status}`.trim()}
            >
              <strong>{item.label}</strong>
              <span>{item.detail || ''}</span>
            </div>
          ))}
        </div>
      ) : null}
      {visualMixSummary.length ? (
        <div className="report-draft-visual-mix">
          <div className="report-draft-visual-mix-header">
            <strong>视觉比例目标</strong>
            <span>当前模块数 / 目标数</span>
          </div>
          <div className="report-draft-visual-mix-grid">
            {visualMixSummary.map((item) => (
              <div
                key={item.key}
                className={`report-draft-visual-mix-card ${item.status}`.trim()}
              >
                <strong>{item.label}</strong>
                <span>{item.currentCount} / {item.targetCount}</span>
                <small>最少 {item.minCount}，最多 {item.maxCount}</small>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DraftHistoryPanel({ draft, draftHistory, submittingKey, restoreDraftHistory }) {
  if (!draftHistory.length) return null;
  return (
    <div className="report-draft-history">
      <div className="report-draft-history-header">
        <strong>草稿版本轨迹</strong>
        <span>最近 {draftHistory.length} 次动作</span>
      </div>
      <div className="report-draft-history-list">
        {draftHistory.map((entry) => (
          <div key={entry.id || `${entry.action}-${entry.createdAt}`} className="report-draft-history-item">
            <div className="report-draft-history-item-head">
              <strong>{entry.label || '草稿更新'}</strong>
              <div className="report-draft-history-item-actions">
                <span>{formatHistoryTime(entry.createdAt)}</span>
                {entry.canRestore ? (
                  <button
                    className="ghost-btn report-draft-history-restore-btn"
                    type="button"
                    disabled={submittingKey === `restore-${entry.id}`}
                    onClick={() => void restoreDraftHistory(entry.id)}
                  >
                    {submittingKey === `restore-${entry.id}` ? '恢复中...' : '恢复此版'}
                  </button>
                ) : null}
              </div>
            </div>
            {entry.detail ? <span className="report-draft-history-detail">{entry.detail}</span> : null}
            {entry.canRestore ? (() => {
              const restorePreview = buildRestorePreview(draft, entry);
              return restorePreview?.lines?.length ? (
                <div className="report-draft-history-preview">
                  <strong>{restorePreview.headline}</strong>
                  <div className="report-draft-history-preview-list">
                    {restorePreview.lines.map((line) => (
                      <span key={`${entry.id}-${line}`}>{line}</span>
                    ))}
                  </div>
                </div>
              ) : null;
            })() : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export { DraftHistoryPanel, DraftReadinessPanel };
