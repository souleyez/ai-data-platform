'use client';

import { useMemo, useRef, useState } from 'react';
import { orderLibrariesWithSelectedFirst } from '../lib/home-dataset-rail-order.mjs';
import { buildMobileDatasetSummary } from '../lib/home-mobile-shell-support.mjs';
import ChatPanel from './ChatPanel';
import HomeDatasetRail from './HomeDatasetRail';

function shouldIgnoreSwipeTarget(target) {
  return target instanceof HTMLElement
    && Boolean(target.closest('button, input, textarea, select, a, label, [data-mobile-home-no-swipe="true"]'));
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
}) {
  const [drawerSide, setDrawerSide] = useState(null);
  const [drawerPreview, setDrawerPreview] = useState(null);
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

  const leftDrawerProgress = drawerSide === 'libraries'
    ? 1
    : (drawerPreview?.side === 'libraries' ? drawerPreview.progress : 0);
  const backdropOpacity = leftDrawerProgress;

  function closeTransientPanels() {
    setDrawerSide(null);
    setDrawerPreview(null);
  }

  function handleTouchStart(event) {
    if (drawerSide) return;
    const touch = event.touches?.[0];
    if (!touch || shouldIgnoreSwipeTarget(event.target)) return;
    gestureRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }

  function handleTouchMove(event) {
    if (!gestureRef.current.active || drawerSide) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - gestureRef.current.startX;
    const deltaY = touch.clientY - gestureRef.current.startY;
    if (deltaX <= 0 || Math.abs(deltaX) < 18 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;

    const progress = Math.max(0, Math.min(1, Math.abs(deltaX) / Math.max(window.innerWidth || 1, 1)));
    setDrawerPreview({ side: 'libraries', progress });
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
    </div>
  );
}
