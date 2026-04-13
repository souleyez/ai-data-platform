'use client';

import { useEffect, useMemo, useState } from 'react';
import { createDocumentLibrary } from './documents/api';
import InsightPanel from './components/InsightPanel';
import ChatPanel from './components/ChatPanel';
import FullIntelligenceModeButton from './components/FullIntelligenceModeButton';
import Sidebar from './components/Sidebar';
import HomeDatasetRail from './components/HomeDatasetRail';
import HomeWorkspaceToolbar from './components/HomeWorkspaceToolbar';
import { useHomePageController } from './use-home-page-controller';

function sortLibrariesForRail(libraries = []) {
  function getAuditScore(library) {
    return Number(
      library?.auditQualityScore
      ?? library?.qualityScore
      ?? library?.referenceCount
      ?? library?.citationCount
      ?? ((Number(library?.answerReferenceCount || 0) * 2) + Number(library?.reportReferenceCount || 0))
      ?? 0,
    ) || 0;
  }

  return [...libraries].sort((a, b) => {
    const auditDiff = getAuditScore(b) - getAuditScore(a);
    if (auditDiff !== 0) return auditDiff;
    const countDiff = Number(b?.documentCount || 0) - Number(a?.documentCount || 0);
    if (countDiff !== 0) return countDiff;
    return String(a?.label || a?.name || a?.key || '').localeCompare(String(b?.label || b?.name || b?.key || ''), 'zh-CN');
  });
}

export default function HomePageClient({ initialModelState }) {
  const [mobileViewport, setMobileViewport] = useState(false);
  const {
    acceptIngestGroupSuggestion,
    assignIngestToSelectedLibrary,
    confirmTemplateOption,
    documentLibraries,
    documentTotal,
    groupSaving,
    input,
    isLoading,
    messages,
    preferredLibraries,
    reportCollapsed,
    reportItems,
    reportDetailLoading,
    refreshHomeData,
    runDocumentUpload,
    selectedManualLibraries,
    selectedReportItem,
    selectedReportId,
    setReportCollapsed,
    setInput,
    setPreferredLibraries,
    setSelectedManualLibraries,
    setSelectedReportId,
    setSystemConstraints,
    sidebarSources,
    submitCredentialForMessage,
    submitQuestion,
    systemConstraints,
    deleteReport,
    updateReportItem,
    uploadInputRef,
    uploadLoading,
  } = useHomePageController();
  const [libraryCreateBusy, setLibraryCreateBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateViewport = () => setMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  const orderedLibraries = useMemo(
    () => sortLibrariesForRail(documentLibraries),
    [documentLibraries],
  );
  const allLibraryKeys = useMemo(
    () => orderedLibraries.map((item) => item?.key).filter(Boolean),
    [orderedLibraries],
  );
  const selectedLibraries = useMemo(() => {
    if (!preferredLibraries.length) return [];
    const selectedSet = new Set(preferredLibraries);
    return orderedLibraries.filter((item) => selectedSet.has(item.key));
  }, [orderedLibraries, preferredLibraries]);
  const allSelected = !selectedLibraries.length || (Boolean(allLibraryKeys.length) && selectedLibraries.length === allLibraryKeys.length);
  const preferredDocumentTotal = useMemo(
    () => selectedLibraries.reduce((sum, library) => sum + Number(library?.documentCount || 0), 0),
    [selectedLibraries],
  );
  const scopeLabel = useMemo(() => {
    if (!selectedLibraries.length || allSelected) return '全部数据集';
    if (selectedLibraries.length === 1) {
      return selectedLibraries[0]?.label || selectedLibraries[0]?.name || selectedLibraries[0]?.key || '当前数据集';
    }
    return `${selectedLibraries.length} 个数据集`;
  }, [allSelected, selectedLibraries]);
  const scopeMeta = useMemo(() => {
    if (!selectedLibraries.length || allSelected) return `${documentTotal} 份文档`;
    return `${preferredDocumentTotal} 份文档`;
  }, [allSelected, documentTotal, preferredDocumentTotal, selectedLibraries.length]);

  async function handleCreateLibrary(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || libraryCreateBusy) return false;
    try {
      setLibraryCreateBusy(true);
      const created = await createDocumentLibrary(trimmed, '');
      await refreshHomeData?.();
      if (created?.item?.key) {
        setPreferredLibraries((current) => {
          if (current.includes(created.item.key)) return current;
          return [...current, created.item.key];
        });
      }
      return true;
    } catch {
      return false;
    } finally {
      setLibraryCreateBusy(false);
    }
  }

  function handleTogglePreferredLibrary(libraryKey) {
    setPreferredLibraries((current) => (
      current.includes(libraryKey)
        ? current.filter((item) => item !== libraryKey)
        : [...current, libraryKey]
    ));
  }

  if (mobileViewport) {
    return (
      <div className={`app-shell ${mobileViewport ? 'app-shell-mobile-home' : ''}`}>
        <Sidebar sourceItems={sidebarSources} currentPath="/" initialModelState={initialModelState} />

        <main className="main-panel main-panel-home">
          <header className="topbar">
            <div className="topbar-title-row">
              <h2>智能助手</h2>
            </div>
            <div className="topbar-actions topbar-actions-bots">
              <FullIntelligenceModeButton
                systemConstraints={systemConstraints}
                onSystemConstraintsChange={setSystemConstraints}
              />
            </div>
          </header>

          <section className="homepage-grid homepage-grid-tight">
            <section className={`workspace-grid homepage-workspace ${reportCollapsed ? 'workspace-grid-compact' : 'workspace-grid-expanded'}`}>
              <ChatPanel
                messages={messages}
                input={input}
                isLoading={isLoading}
                onInputChange={setInput}
                onSubmit={submitQuestion}
                uploadInputRef={uploadInputRef}
                uploadLoading={uploadLoading}
                onUploadFilesSelected={runDocumentUpload}
                availableLibraries={documentLibraries}
                selectedManualLibraries={selectedManualLibraries}
                onChangeManualLibrary={(itemId, value) =>
                  setSelectedManualLibraries((prev) => ({ ...prev, [itemId]: value }))
                }
                onAcceptGroupSuggestion={acceptIngestGroupSuggestion}
                onAssignLibrary={assignIngestToSelectedLibrary}
                groupSaving={groupSaving}
                onSubmitCredential={submitCredentialForMessage}
                onConfirmTemplateOption={confirmTemplateOption}
              />
              <InsightPanel
                mobileViewport={mobileViewport}
                collapsed={reportCollapsed}
                onToggleCollapsed={() => setReportCollapsed((prev) => !prev)}
                reportItems={reportItems}
                activeReportItem={selectedReportItem}
                reportDetailLoading={reportDetailLoading}
                selectedReportId={selectedReportId}
                onSelectReport={setSelectedReportId}
                onDeleteReport={deleteReport}
                onItemChange={updateReportItem}
              />
            </section>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="home-shell">
      <main className="home-main-panel">
        <HomeWorkspaceToolbar
          currentPath="/"
          sourceItems={sidebarSources}
          initialModelState={initialModelState}
          fullIntelligenceSlot={(
            <FullIntelligenceModeButton
              compact
              systemConstraints={systemConstraints}
              onSystemConstraintsChange={setSystemConstraints}
            />
          )}
        />

        <section className={`home-desktop-grid ${reportCollapsed ? 'home-desktop-grid-compact' : 'home-desktop-grid-expanded'}`}>
          <HomeDatasetRail
            libraries={orderedLibraries}
            totalDocuments={documentTotal}
            selectedKeys={preferredLibraries}
            onToggleLibrary={handleTogglePreferredLibrary}
            onClearSelection={() => setPreferredLibraries([])}
            onCreateLibrary={handleCreateLibrary}
            creating={libraryCreateBusy}
            clearChipActive={allSelected}
            clearChipLabel={`全部数据集 ${documentTotal}`}
            selectionSummaryLabel={`默认范围 ${scopeLabel}`}
          />

          <section className="home-chat-stage">
            <ChatPanel
              compact
              scopeLabel={scopeLabel}
              scopeMeta={scopeMeta}
              messages={messages}
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSubmit={submitQuestion}
              uploadInputRef={uploadInputRef}
              uploadLoading={uploadLoading}
              onUploadFilesSelected={runDocumentUpload}
              availableLibraries={documentLibraries}
              selectedManualLibraries={selectedManualLibraries}
              onChangeManualLibrary={(itemId, value) =>
                setSelectedManualLibraries((prev) => ({ ...prev, [itemId]: value }))
              }
              onAcceptGroupSuggestion={acceptIngestGroupSuggestion}
              onAssignLibrary={assignIngestToSelectedLibrary}
              groupSaving={groupSaving}
              onSubmitCredential={submitCredentialForMessage}
              onConfirmTemplateOption={confirmTemplateOption}
            />
          </section>

          <InsightPanel
            mobileViewport={false}
            collapsed={reportCollapsed}
            onToggleCollapsed={() => setReportCollapsed((prev) => !prev)}
            reportItems={reportItems}
            activeReportItem={selectedReportItem}
            reportDetailLoading={reportDetailLoading}
            selectedReportId={selectedReportId}
            onSelectReport={setSelectedReportId}
            onDeleteReport={deleteReport}
            onItemChange={updateReportItem}
          />
        </section>
      </main>
    </div>
  );
}
