'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatGeneratedReportTime } from '../lib/generated-reports';
import { orderLibrariesWithSelectedFirst } from '../lib/home-dataset-rail-order.mjs';
import { buildMobileDatasetSummary } from '../lib/home-mobile-shell-support.mjs';
import ChatPanel from './ChatPanel';
import HomeDatasetRail from './HomeDatasetRail';

const GeneratedReportDetail = dynamic(() => import('./GeneratedReportDetail'));

function shouldIgnoreSwipeTarget(target) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, input, textarea, select, a, label, [data-mobile-home-no-swipe="true"]'));
}

function shouldIgnoreDrawerSwipeTarget(target) {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

function formatReportStatus(status) {
  if (status === 'processing') return '生成中';
  if (status === 'failed') return '生成失败';
  return '已完成';
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
  const composerGestureRef = useRef({
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
  const activeReportItem = useMemo(() => (
    selectedReportItem
      || reportItems.find((item) => item.id === selectedReportId)
      || reportItems[0]
      || null
  ), [reportItems, selectedReportId, selectedReportItem]);

  const leftDrawerProgress = drawerSide === 'libraries'
    ? (drawerPreview?.side === 'libraries' ? drawerPreview.progress : 1)
    : (drawerPreview?.side === 'libraries' ? drawerPreview.progress : 0);
  const rightDrawerProgress = drawerSide === 'reports'
    ? (drawerPreview?.side === 'reports' ? drawerPreview.progress : 1)
    : (drawerPreview?.side === 'reports' ? drawerPreview.progress : 0);
  const backdropOpacity = Math.max(leftDrawerProgress, rightDrawerProgress);

  useEffect(() => {
    if (reportItems.length) return;
    setReportPreviewOpen(false);
    setDrawerSide((current) => (current === 'reports' ? null : current));
    setDrawerPreview((current) => (current?.side === 'reports' ? null : current));
  }, [reportItems.length]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const { documentElement, body } = document;
    const prevHtmlOverflow = documentElement.style.overflow;
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';

    return () => {
      documentElement.style.overflow = prevHtmlOverflow;
      documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const composer = document.querySelector('.chat-panel-mobile-home .chat-composer-wrap');
    if (!(composer instanceof HTMLElement)) return undefined;

    function handleComposerTouchStart(event) {
      const touch = event.touches?.[0];
      if (!touch) return;
      composerGestureRef.current = {
        active: true,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    }

    function handleComposerTouchMove(event) {
      if (!composerGestureRef.current.active) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      const deltaX = touch.clientX - composerGestureRef.current.startX;
      const deltaY = touch.clientY - composerGestureRef.current.startY;
      if (Math.abs(deltaX) < 6 && Math.abs(deltaY) < 6) return;
      event.preventDefault();
    }

    function handleComposerTouchEnd() {
      composerGestureRef.current.active = false;
    }

    composer.addEventListener('touchstart', handleComposerTouchStart, { passive: true });
    composer.addEventListener('touchmove', handleComposerTouchMove, { passive: false });
    composer.addEventListener('touchend', handleComposerTouchEnd, { passive: true });
    composer.addEventListener('touchcancel', handleComposerTouchEnd, { passive: true });

    return () => {
      composer.removeEventListener('touchstart', handleComposerTouchStart);
      composer.removeEventListener('touchmove', handleComposerTouchMove);
      composer.removeEventListener('touchend', handleComposerTouchEnd);
      composer.removeEventListener('touchcancel', handleComposerTouchEnd);
    };
  }, []);

  function closeTransientPanels() {
    setDrawerSide(null);
    setDrawerPreview(null);
  }

  function openReportPreview(reportId) {
    if (reportId) {
      onSelectReport?.(reportId);
    }
    onPrepareReportPreview?.();
    setDrawerSide(null);
    setDrawerPreview(null);
    setReportPreviewOpen(true);
  }

  function startGesture(event) {
    const touch = event.touches?.[0];
    if (!touch) return false;
    gestureRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
    };
    return true;
  }

  function handleTouchStart(event) {
    if (drawerSide) return;
    if (shouldIgnoreSwipeTarget(event.target)) return;
    startGesture(event);
  }

  function handleTouchMove(event) {
    if (!gestureRef.current.active || drawerSide) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;
    if (Math.abs(deltaX) < 18 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;

    const side = deltaX > 0 ? 'libraries' : 'reports';
    if (side === 'reports' && !reportItems.length) return;

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

  function handleDrawerTouchStart(side, event) {
    if (drawerSide !== side || shouldIgnoreDrawerSwipeTarget(event.target)) return;
    startGesture(event);
  }

  function handleDrawerTouchMove(side, event) {
    if (!gestureRef.current.active || drawerSide !== side) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;
    if (Math.abs(deltaX) < 18 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;

    if (side === 'libraries' && deltaX >= 0) return;
    if (side === 'reports' && deltaX <= 0) return;

    const progress = Math.max(0, 1 - Math.min(1, Math.abs(deltaX) / Math.max(window.innerWidth || 1, 1)));
    setDrawerPreview({ side, progress });
    event.preventDefault();
  }

  function handleDrawerTouchEnd(side) {
    if (!gestureRef.current.active || drawerSide !== side) return;
    gestureRef.current.active = false;
    if (drawerPreview?.side === side && drawerPreview.progress <= 0.5) {
      setDrawerSide(null);
      setDrawerPreview(null);
      return;
    }
    setDrawerPreview(null);
  }

  return (
    <div className="mobile-home-shell">
      <header className="mobile-home-topbar" data-mobile-home-no-swipe="true">
        <strong className="mobile-home-topbar-brand">AI智能助手</strong>
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
        onTouchStart={(event) => handleDrawerTouchStart('libraries', event)}
        onTouchMove={(event) => handleDrawerTouchMove('libraries', event)}
        onTouchEnd={() => handleDrawerTouchEnd('libraries')}
        onTouchCancel={() => handleDrawerTouchEnd('libraries')}
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
        onTouchStart={(event) => handleDrawerTouchStart('reports', event)}
        onTouchMove={(event) => handleDrawerTouchMove('reports', event)}
        onTouchEnd={() => handleDrawerTouchEnd('reports')}
        onTouchCancel={() => handleDrawerTouchEnd('reports')}
      >
        <div className="mobile-home-drawer-head">
          <div>
            <strong>已出报表</strong>
            <span>{reportItems.length ? `${reportItems.length} 份结果` : '暂无已出报表'}</span>
          </div>
          <button type="button" className="ghost-btn compact-inline-btn" onClick={() => setDrawerSide(null)}>
            收起
          </button>
        </div>
        {reportItems.length ? (
          <div className="mobile-home-report-list">
            {reportItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`mobile-home-report-item ${item.id === activeReportItem?.id ? 'active' : ''}`.trim()}
                onClick={() => openReportPreview(item.id)}
              >
                <span className="mobile-home-report-item-title">{item.title || '已出报表'}</span>
                <span className="mobile-home-report-item-meta">
                  {formatGeneratedReportTime(item.createdAt)} · {formatReportStatus(item.status)}
                </span>
                <span className="mobile-home-report-item-subtitle">
                  {item.templateLabel || item.kind || '报表'}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="mobile-home-empty-state">
            <strong>还没有已出报表</strong>
            <p>向左滑会在这里查看已经生成的结果，选中后可全屏展开。</p>
          </div>
        )}
      </aside>

      {reportPreviewOpen ? (
        <section className="mobile-home-report-preview" data-mobile-home-no-swipe="true">
          <div className="mobile-home-report-preview-head">
            <div className="mobile-home-report-preview-copy">
              <strong>{activeReportItem?.title || '报表详情'}</strong>
              <span>
                {activeReportItem
                  ? `${formatGeneratedReportTime(activeReportItem.createdAt)} · ${formatReportStatus(activeReportItem.status)}`
                  : '正在准备报表详情'}
              </span>
            </div>
            <div className="mobile-home-report-preview-actions">
              <button type="button" className="ghost-btn compact-inline-btn" onClick={() => setReportPreviewOpen(false)}>
                关闭
              </button>
            </div>
          </div>
          <div className="mobile-home-report-preview-body">
            {reportDetailLoading || !activeReportItem ? (
              <div className="mobile-home-empty-state">
                <strong>正在加载报表详情</strong>
                <p>结果列表已经可用，当前报表内容正在按需展开。</p>
              </div>
            ) : (
              <GeneratedReportDetail item={activeReportItem} />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
