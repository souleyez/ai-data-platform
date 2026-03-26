'use client';

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
}) {
  async function handlePrimaryAction(item) {
    if (!item) return;
    if (item.kind === 'table' || item.format === 'ppt' || item.format === 'pdf' || item.downloadUrl) {
      downloadGeneratedReport(item);
      return;
    }
    await copyGeneratedReportLink(item);
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
          <h3>生成报表列表</h3>
        </div>
      </div>

      {!reportItems.length ? (
        <section className="card report-empty-card">
          <h4>还没有生成报表</h4>
          <p>左侧对话生成表格、静态页、PDF 或 PPT 后，这里会自动沉淀结果。</p>
        </section>
      ) : (
        <section className="report-center-list">
          {reportItems.map((item) => {
            const expanded = item.id === selectedReportId;

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
