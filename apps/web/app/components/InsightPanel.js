'use client';

import ReportResultsPanel from './ReportResultsPanel';

export default function InsightPanel({
  collapsed = false,
  onToggleCollapsed,
  reportItems = [],
  selectedReportId,
  onSelectReport,
  onDeleteReport,
  onReviseReport,
}) {
  return (
    <aside className={`insight-panel ${collapsed ? 'insight-panel-compact' : 'insight-panel-expanded'}`}>
      <ReportResultsPanel
        title="已出报表"
        description="首页始终保留当前报表区。需要继续调整时，直接在展开后的报表详情里补充要求。"
        items={reportItems}
        selectedReportId={selectedReportId}
        onSelectReport={onSelectReport}
        onDeleteReport={onDeleteReport}
        onReviseReport={onReviseReport}
        collapsed={collapsed}
        onToggleCollapsed={onToggleCollapsed}
        onRequestExpand={(id) => {
          onSelectReport?.(id);
          onToggleCollapsed?.();
        }}
        className="report-results-home"
      />
    </aside>
  );
}
