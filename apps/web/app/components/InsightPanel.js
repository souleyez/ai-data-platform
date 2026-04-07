'use client';

import ReportResultsPanel from './ReportResultsPanel';

export default function InsightPanel({
  collapsed = false,
  onToggleCollapsed,
  reportItems = [],
  selectedReportId,
  onSelectReport,
  onDeleteReport,
}) {
  return (
    <aside className={`insight-panel ${collapsed ? 'insight-panel-compact' : 'insight-panel-expanded'}`}>
      <ReportResultsPanel
        title="已出报表"
        description="首页始终保留当前报表区，这里只保留查看、下载和删除。"
        items={reportItems}
        selectedReportId={selectedReportId}
        onSelectReport={onSelectReport}
        onDeleteReport={onDeleteReport}
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
