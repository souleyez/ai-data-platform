'use client';

import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { formatGeneratedReportTime } from '../lib/generated-reports';
import { orderLibrariesWithSelectedFirst } from '../lib/home-dataset-rail-order.mjs';
import { buildMobileDatasetSummary } from '../lib/home-mobile-shell-support.mjs';
import ChatPanel from './ChatPanel';
import HomeDatasetRail from './HomeDatasetRail';

const GeneratedReportDetail = dynamic(() => import('./GeneratedReportDetail'));
const DRAWER_GESTURE_TRIGGER_PX = 12;
const DRAWER_GESTURE_DIRECTION_RATIO = 1.05;
const DRAWER_OPEN_COMMIT_PROGRESS = 0.34;
const DRAWER_CLOSE_COMMIT_PROGRESS = 0.76;
const SURFACE_MAIN = 'main';
const SURFACE_LIBRARIES = 'libraries';
const SURFACE_REPORTS = 'reports';
const SURFACE_REPORT_PREVIEW = 'report-preview';

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
  unlockedLibraryKeys = [],
  datasetSecretState = null,
  onToggleLibrary,
  onRequestUnlockLibrary,
  onClearLibraries,
  onCreateLibrary,
  creatingLibrary = false,
  datasetSecretSlot = null,
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
  const shellRef = useRef(null);
  const [surface, setSurface] = useState(SURFACE_MAIN);
  const [drawerPreview, setDrawerPreview] = useState(null);
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
  const drawerSide = surface === SURFACE_LIBRARIES
    ? SURFACE_LIBRARIES
    : (surface === SURFACE_REPORTS ? SURFACE_REPORTS : null);
  const reportPreviewOpen = surface === SURFACE_REPORT_PREVIEW;

  const leftDrawerProgress = drawerSide === 'libraries'
    ? (drawerPreview?.side === 'libraries' ? drawerPreview.progress : 1)
    : (drawerPreview?.side === 'libraries' ? drawerPreview.progress : 0);
  const rightDrawerProgress = drawerSide === 'reports'
    ? (drawerPreview?.side === 'reports' ? drawerPreview.progress : 1)
    : (drawerPreview?.side === 'reports' ? drawerPreview.progress : 0);
  const backdropOpacity = Math.max(leftDrawerProgress, rightDrawerProgress);
  const leftDrawerVisible = leftDrawerProgress > 0.001;
  const rightDrawerVisible = rightDrawerProgress > 0.001;

  function resetGestureState() {
    gestureRef.current = {
      active: false,
      startX: 0,
      startY: 0,
    };
  }

  function closeAllSurfaces(nextSurface = SURFACE_MAIN) {
    resetGestureState();
    setDrawerPreview(null);
    setSurface(nextSurface);
  }

  useEffect(() => {
    if (reportItems.length) return;
    closeAllSurfaces();
  }, [reportItems.length]);

  useLayoutEffect(() => {
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

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const shell = shellRef.current;
    if (!(shell instanceof HTMLElement)) return undefined;

    function syncViewportHeight() {
      const viewportHeight = Math.round(window.visualViewport?.height || window.innerHeight || 0);
      if (!viewportHeight) return;
      shell.style.setProperty('--mobile-home-viewport-height', `${viewportHeight}px`);
    }

    syncViewportHeight();
    const rafId = window.requestAnimationFrame(syncViewportHeight);
    const settleTimeout = window.setTimeout(syncViewportHeight, 120);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('resize', syncViewportHeight);
    window.addEventListener('resize', syncViewportHeight);
    window.addEventListener('orientationchange', syncViewportHeight);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(settleTimeout);
      visualViewport?.removeEventListener('resize', syncViewportHeight);
      window.removeEventListener('resize', syncViewportHeight);
      window.removeEventListener('orientationchange', syncViewportHeight);
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
    closeAllSurfaces();
  }

  function openReportPreview(reportId) {
    if (reportId) {
      onSelectReport?.(reportId);
    }
    onPrepareReportPreview?.();
    closeAllSurfaces(SURFACE_REPORT_PREVIEW);
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
    if (surface !== SURFACE_MAIN) return;
    if (shouldIgnoreSwipeTarget(event.target)) return;
    startGesture(event);
  }

  function handleTouchMove(event) {
    if (!gestureRef.current.active || surface !== SURFACE_MAIN) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;
    if (Math.abs(deltaX) < DRAWER_GESTURE_TRIGGER_PX || Math.abs(deltaX) <= Math.abs(deltaY) * DRAWER_GESTURE_DIRECTION_RATIO) return;

    const side = deltaX > 0 ? 'libraries' : 'reports';
    if (side === 'reports' && !reportItems.length) return;

    const progress = Math.max(0, Math.min(1, Math.abs(deltaX) / Math.max(window.innerWidth || 1, 1)));
    setDrawerPreview({ side, progress });
    event.preventDefault();
  }

  function handleTouchEnd() {
    if (!gestureRef.current.active) return;
    gestureRef.current.active = false;
    if (drawerPreview?.progress >= DRAWER_OPEN_COMMIT_PROGRESS && drawerPreview?.side) {
      setSurface(drawerPreview.side === SURFACE_LIBRARIES ? SURFACE_LIBRARIES : SURFACE_REPORTS);
    }
    setDrawerPreview(null);
  }

  function handleDrawerTouchStart(side, event) {
    if (surface !== side || shouldIgnoreDrawerSwipeTarget(event.target)) return;
    startGesture(event);
  }

  function handleDrawerTouchMove(side, event) {
    if (!gestureRef.current.active || surface !== side) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;
    if (Math.abs(deltaX) < DRAWER_GESTURE_TRIGGER_PX || Math.abs(deltaX) <= Math.abs(deltaY) * DRAWER_GESTURE_DIRECTION_RATIO) return;

    if (side === 'libraries' && deltaX >= 0) return;
    if (side === 'reports' && deltaX <= 0) return;

    const progress = Math.max(0, 1 - Math.min(1, Math.abs(deltaX) / Math.max(window.innerWidth || 1, 1)));
    setDrawerPreview({ side, progress });
    event.preventDefault();
  }

  function handleDrawerTouchEnd(side) {
    if (!gestureRef.current.active || surface !== side) return;
    gestureRef.current.active = false;
    if (drawerPreview?.side === side && drawerPreview.progress <= DRAWER_CLOSE_COMMIT_PROGRESS) {
      closeAllSurfaces();
      return;
    }
    setDrawerPreview(null);
  }

  return (
    <div ref={shellRef} className={`mobile-home-shell mobile-home-shell-surface-${surface}`.trim()}>
      <header className="mobile-home-topbar" data-mobile-home-no-swipe="true">
        <strong className="mobile-home-topbar-brand">AI智能助手</strong>
        {datasetSecretSlot ? (
          <div className="mobile-home-topbar-actions">
            {datasetSecretSlot}
          </div>
        ) : null}
      </header>

      <div
        className={`mobile-home-stage ${surface !== SURFACE_MAIN ? 'is-obscured' : ''}`.trim()}
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
          showVoiceAction
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
        className={`mobile-home-drawer mobile-home-drawer-left ${leftDrawerVisible ? 'is-visible' : ''} ${drawerSide === SURFACE_LIBRARIES ? 'is-open' : ''}`.trim()}
        data-mobile-home-no-swipe="true"
        aria-hidden={!leftDrawerVisible}
        style={{ transform: `translate3d(${(-100 + leftDrawerProgress * 100).toFixed(3)}%, 0, 0)` }}
        onTouchStart={(event) => handleDrawerTouchStart('libraries', event)}
        onTouchMove={(event) => handleDrawerTouchMove('libraries', event)}
        onTouchEnd={() => handleDrawerTouchEnd('libraries')}
        onTouchCancel={() => handleDrawerTouchEnd('libraries')}
      >
        <div className="mobile-home-drawer-swipe-hint mobile-home-drawer-swipe-hint-left" aria-hidden="true" />
        <div className="mobile-home-drawer-head">
          <div>
            <strong>数据集</strong>
            <span>{selectionSummary.meta}</span>
          </div>
          <button type="button" className="ghost-btn compact-inline-btn" onClick={() => closeAllSurfaces()}>
            收起
          </button>
        </div>
        <HomeDatasetRail
          libraries={orderedLibraries}
          totalDocuments={documentTotal}
          selectedKeys={preferredLibraries}
          unlockedKeys={unlockedLibraryKeys}
          datasetSecretState={datasetSecretState}
          onToggleLibrary={onToggleLibrary}
          onRequestUnlock={onRequestUnlockLibrary}
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
        className={`mobile-home-drawer mobile-home-drawer-right ${rightDrawerVisible ? 'is-visible' : ''} ${drawerSide === SURFACE_REPORTS ? 'is-open' : ''}`.trim()}
        data-mobile-home-no-swipe="true"
        aria-hidden={!rightDrawerVisible}
        style={{ transform: `translate3d(${(100 - rightDrawerProgress * 100).toFixed(3)}%, 0, 0)` }}
        onTouchStart={(event) => handleDrawerTouchStart('reports', event)}
        onTouchMove={(event) => handleDrawerTouchMove('reports', event)}
        onTouchEnd={() => handleDrawerTouchEnd('reports')}
        onTouchCancel={() => handleDrawerTouchEnd('reports')}
      >
        <div className="mobile-home-drawer-swipe-hint mobile-home-drawer-swipe-hint-right" aria-hidden="true" />
        <div className="mobile-home-drawer-head">
          <div>
            <strong>已出报表</strong>
            <span>{reportItems.length ? `${reportItems.length} 份结果` : '暂无已出报表'}</span>
          </div>
          <button type="button" className="ghost-btn compact-inline-btn" onClick={() => closeAllSurfaces()}>
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
              <button type="button" className="ghost-btn compact-inline-btn" onClick={() => closeAllSurfaces()}>
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
