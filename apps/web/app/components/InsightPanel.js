'use client';

import { useEffect, useRef } from 'react';
import ReportResultsPanel from './ReportResultsPanel';

export default function InsightPanel({
  mobileViewport = false,
  collapsed = false,
  onToggleCollapsed,
  reportItems = [],
  selectedReportId,
  onSelectReport,
  onDeleteReport,
}) {
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  function clearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleDrawerToggle() {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    if (!mobileViewport || collapsed) {
      onToggleCollapsed?.();
    }
  }

  function handleDrawerPressStart() {
    if (!mobileViewport || collapsed) return;
    longPressTriggeredRef.current = false;
    clearLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      onToggleCollapsed?.();
    }, 520);
  }

  function handleDrawerPressEnd() {
    clearLongPress();
  }

  return (
    <aside
      className={`insight-panel ${collapsed ? 'insight-panel-compact' : 'insight-panel-expanded'} ${mobileViewport ? 'insight-panel-mobile' : ''}`}
    >
      {mobileViewport ? (
        <button
          type="button"
          className={`insight-mobile-rail ${collapsed ? 'collapsed' : 'expanded'}`}
          onClick={handleDrawerToggle}
          onPointerDown={handleDrawerPressStart}
          onPointerUp={handleDrawerPressEnd}
          onPointerLeave={handleDrawerPressEnd}
          onPointerCancel={handleDrawerPressEnd}
        >
          <span className="insight-mobile-rail-title">报表</span>
          <span className="insight-mobile-rail-meta">{reportItems.length} 份</span>
          <span className="insight-mobile-rail-hint">
            {collapsed ? '点开查看' : '长按收起'}
          </span>
        </button>
      ) : null}
      <ReportResultsPanel
        title="已出报表"
        description=""
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
        mobileViewport={mobileViewport}
        className="report-results-home"
        showStepper={false}
      />
    </aside>
  );
}
