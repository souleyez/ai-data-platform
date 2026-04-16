'use client';

import { useMemo, useRef, useState } from 'react';
import { formatGeneratedReportTime } from '../lib/generated-reports';
import { orderLibrariesWithSelectedFirst } from '../lib/home-dataset-rail-order.mjs';
import { buildMobileDatasetSummary } from '../lib/home-mobile-shell-support.mjs';
import ChatPanel from './ChatPanel';
import GeneratedReportDetail from './GeneratedReportDetail';
import HomeDatasetRail from './HomeDatasetRail';

function formatReportStatus(status) {
  if (status === 'processing') return '生成中';
  if (status === 'failed') return '失败';
  return '已完成';
}

function hasRenderableReportContent(item) {
  return Boolean(
    item?.draft?.modules?.length
      || item?.page?.summary
      || item?.page?.cards?.length
      || item?.page?.sections?.length
      || item?.page?.charts?.length
      || item?.content,
  );
}

function shouldIgnoreSwipeTarget(target) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, input, textarea, select, a, label, [data-mobile-home-no-swipe="true"]'));
}

function MobileReportList({
  items = [],
  onOpenReport,
}) {
  if (!items.length) {
    return (
      <div className="mobile-home-empty-state">
        <strong>还没有已出报表</strong>
        <p>先在聊天区生成表格、静态页或文档，右侧才会出现可查看结果。</p>
      </div>
    );
  }

  return (
    <div className="mobile-home-report-list">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="mobile-home-report-item"
          onClick={() => onOpenReport?.(item.id)}
        >
          <span className="mobile-home-report-item-title">{item.title || '未命名报表'}</span>
          <span className="mobile-home-report-item-meta">
            {formatGeneratedReportTime(item.createdAt)} · {formatReportStatus(item.status)}
          </span>
          <span className="mobile-home-report-item-subtitle">
            {item.templateLabel || item.outputType || item.kind || '报表'}
          </span>
        </button>
      ))}
    </div>
  );
}

export default function HomeMobileShell({
  documentLibraries = [],
  documentTotal = 0,
  preferredLibraries = [],
  onToggleLibrary,
  onClearLibraries,
  onCreateLibrary,
  creatingLibrary = false,
  messages,
  input,
  isLoading,
  onInputChange,
  onSubmit,
  uploadInputRef,
  uploadLoading,
  onUploadFilesSelected,
  availableLibraries,
  selectedManualLibraries,
  onChangeManualLibrary,
  onAcceptGroupSuggestion,
  onAssignLibrary,
  groupSaving,
  onSubmitCredential,
  onConfirmTemplateOption,
  reportItems = [],
  selectedReportId = '',
  selectedReportItem = null,
  reportDetailLoading = false,
  onSelectReport,
  onPrepareReportPreview,
}) {
  const [drawerSide, setDrawerSide] = useState(null);
  const [drawerPreview, setDrawerPreview] = useState(null);
  const [reportPreviewOpen, setReportPreviewOpen] = useState(false);
  const gestureRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
  });

  const orderedLibraries = useMemo(
    () => orderLibrariesWithSelectedFirst(documentLibraries, preferredLibraries),
    [documentLibraries, preferredLibraries],
  );
  const selectedLibraries = useMemo(() => {
    if (!preferredLibraries.length) return orderedLibraries;
    const selectedSet = new Set(preferredLibraries);
    return orderedLibraries.filter((item) => selectedSet.has(item.key));
  }, [orderedLibraries, preferredLibraries]);
  const selectionSummary = useMemo(
    () => buildMobileDatasetSummary({
      selectedLibraries,
      totalLibraries: orderedLibraries.length,
      totalDocuments: documentTotal,
    }),
    [documentTotal, orderedLibraries.length, selectedLibraries],
  );
  const activeReport = selectedReportItem
    || reportItems.find((item) => item.id === selectedReportId)
    || null;

  const leftDrawerProgress = drawerSide === 'libraries'
    ? 1
    : (drawerPreview?.side === 'libraries' ? drawerPreview.progress : 0);
  const rightDrawerProgress = drawerSide === 'reports'
    ? 1
    : (drawerPreview?.side === 'reports' ? drawerPreview.progress : 0);
  const backdropOpacity = Math.max(leftDrawerProgress, rightDrawerProgress, reportPreviewOpen ? 1 : 0);

  function closeTransientPanels() {
    setDrawerSide(null);
    setDrawerPreview(null);
    setReportPreviewOpen(false);
  }

  function handleTouchStart(event) {
    if (drawerSide || reportPreviewOpen) return;
    const touch = event.touches?.[0];
    if (!touch || shouldIgnoreSwipeTarget(event.target)) return;
    gestureRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }

  function handleTouchMove(event) {
    if (!gestureRef.current.active || drawerSide || reportPreviewOpen) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;
    if (Math.abs(deltaX) < 18 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;

    const side = deltaX > 0 ? 'libraries' : 'reports';
    const progress = Math.max(0, Math.min(1, Math.abs(deltaX) / Math.max(window.innerWidth || 1, 1)));
    setDrawerPreview({ side, progress });
    event.preventDefault();
  }

  function handleTouchEnd() {
    if (!gestureRef.current.active) return;
    gestureRef.current.active = false;
    if (drawerPreview?.progress >= 0.5 && drawerPreview?.side) {
      setDrawerSide(drawerPreview.side);
    }
    setDrawerPreview(null);
  }

  function handleOpenReport(reportId) {
    if (!reportId) return;
    onSelectReport?.(reportId);
    onPrepareReportPreview?.();
    setDrawerSide(null);
    setDrawerPreview(null);
    setReportPreviewOpen(true);
  }

  return (
    <div className="mobile-home-shell">
      <header className="mobile-home-topbar" data-mobile-home-no-swipe="true">
        <span className="mobile-home-topbar-label">当前数据集</span>
        <strong className="mobile-home-topbar-title">{selectionSummary.title}</strong>
        <span className="mobile-home-topbar-meta">{selectionSummary.meta}</span>
      </header>

      <div
        className="mobile-home-stage"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      >
        <ChatPanel
          compact
          panelClassName="chat-panel-mobile-home"
          messages={messages}
          input={input}
          isLoading={isLoading}
          onInputChange={onInputChange}
          onSubmit={onSubmit}
          uploadInputRef={uploadInputRef}
          uploadLoading={uploadLoading}
          onUploadFilesSelected={onUploadFilesSelected}
          availableLibraries={availableLibraries}
          selectedManualLibraries={selectedManualLibraries}
          onChangeManualLibrary={onChangeManualLibrary}
          onAcceptGroupSuggestion={onAcceptGroupSuggestion}
          onAssignLibrary={onAssignLibrary}
          groupSaving={groupSaving}
          onSubmitCredential={onSubmitCredential}
          onConfirmTemplateOption={onConfirmTemplateOption}
          singlePageMode
          chatDebugAvailable={false}
          chatDebugDetailsEnabled={false}
          onToggleChatDebugDetails={() => {}}
        />
      </div>

      <div
        className={`mobile-home-backdrop ${backdropOpacity > 0 ? 'is-visible' : ''}`.trim()}
        style={{ opacity: backdropOpacity }}
        onClick={closeTransientPanels}
      />

      <aside
        className="mobile-home-drawer mobile-home-drawer-left"
        data-mobile-home-no-swipe="true"
        style={{ transform: `translate3d(${(-100 + leftDrawerProgress * 100).toFixed(3)}%, 0, 0)` }}
      >
        <div className="mobile-home-drawer-head">
          <div>
            <strong>数据集</strong>
            <span>{selectionSummary.meta}</span>
          </div>
          <button type="button" className="ghost-btn compact-inline-btn" onClick={() => setDrawerSide(null)}>
            收起
          </button>
        </div>
        <HomeDatasetRail
          libraries={orderedLibraries}
          totalDocuments={documentTotal}
          selectedKeys={preferredLibraries}
          onToggleLibrary={onToggleLibrary}
          onClearSelection={onClearLibraries}
          onCreateLibrary={onCreateLibrary}
          creating={creatingLibrary}
          clearChipActive={selectedLibraries.length >= orderedLibraries.length}
          clearChipLabel={`全部数据集 ${documentTotal}`}
          selectionSummaryLabel={`${selectedLibraries.length || orderedLibraries.length || 0} 个数据集`}
          createPlaceholder="新建数据集"
          createButtonLabel="新增"
        />
      </aside>

      <aside
        className="mobile-home-drawer mobile-home-drawer-right"
        data-mobile-home-no-swipe="true"
        style={{ transform: `translate3d(${(100 - rightDrawerProgress * 100).toFixed(3)}%, 0, 0)` }}
      >
        <div className="mobile-home-drawer-head">
          <div>
            <strong>已出报表</strong>
            <span>{reportItems.length} 份</span>
          </div>
          <button type="button" className="ghost-btn compact-inline-btn" onClick={() => setDrawerSide(null)}>
            收起
          </button>
        </div>
        <MobileReportList items={reportItems} onOpenReport={handleOpenReport} />
      </aside>

      {reportPreviewOpen ? (
        <section className="mobile-home-report-preview" data-mobile-home-no-swipe="true">
          <header className="mobile-home-report-preview-head">
            <div className="mobile-home-report-preview-copy">
              <span className="mobile-home-topbar-label">报表预览</span>
              <strong>{activeReport?.title || '加载中'}</strong>
              <span>
                {activeReport
                  ? `${formatGeneratedReportTime(activeReport.createdAt)} · ${formatReportStatus(activeReport.status)}`
                  : '正在准备报表内容'}
              </span>
            </div>
            <div className="mobile-home-report-preview-actions">
              <button
                type="button"
                className="ghost-btn compact-inline-btn"
                onClick={() => setReportPreviewOpen(false)}
              >
                关闭
              </button>
            </div>
          </header>

          <div className="mobile-home-report-preview-body">
            {reportDetailLoading || !hasRenderableReportContent(activeReport) ? (
              <div className="mobile-home-empty-state">
                <strong>正在加载报表详情</strong>
                <p>报表正文已经开始读取，稍后会在这里显示完整内容。</p>
              </div>
            ) : activeReport ? (
              <GeneratedReportDetail item={activeReport} />
            ) : (
              <div className="mobile-home-empty-state">
                <strong>暂时没有可预览的报表</strong>
                <p>先从右侧报表抽屉选择一份结果，再展开全屏查看。</p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
