'use client';

import { useEffect, useMemo, useState } from 'react';
import { createDocumentLibrary } from './documents/api';
import InsightPanel from './components/InsightPanel';
import ChatPanel from './components/ChatPanel';
import FullIntelligenceModeButton from './components/FullIntelligenceModeButton';
import HomeDatasetRail from './components/HomeDatasetRail';
import HomeMobileShell from './components/HomeMobileShell';
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

export default function HomePageClient({
  initialDocumentsSnapshot = null,
  initialViewportMode = 'desktop',
}) {
  const [mobileViewport, setMobileViewport] = useState(initialViewportMode === 'mobile');
  const [secretPromptTarget, setSecretPromptTarget] = useState(null);
  const {
    acceptIngestGroupSuggestion,
    activateDatasetSecret,
    assignIngestToSelectedLibrary,
    clearDatasetSecretCache,
    confirmTemplateOption,
    datasetSecretState,
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
    chatDebugAvailable,
    chatDebugDetailsEnabled,
    submitCredentialForMessage,
    submitQuestion,
    systemConstraints,
    deleteReport,
    updateReportItem,
    uploadInputRef,
    uploadLoading,
    setChatDebugDetailsEnabled,
    verifyDatasetSecret,
  } = useHomePageController({
    initialDocumentsSnapshot,
  });
  const [libraryCreateBusy, setLibraryCreateBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateViewport = () => setMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener('change', updateViewport);
    return () => mediaQuery.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.localStorage.removeItem('aidp_theme_mode_v1');
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  const orderedLibraries = useMemo(
    () => sortLibrariesForRail(documentLibraries),
    [documentLibraries],
  );
  const allLibraryKeys = useMemo(
    () => orderedLibraries.map((item) => item?.key).filter(Boolean),
    [orderedLibraries],
  );
  const unlockedLibraryKeys = useMemo(
    () => (Array.isArray(datasetSecretState?.unlockedLibraryKeys) ? datasetSecretState.unlockedLibraryKeys : []),
    [datasetSecretState],
  );
  const selectedLibraries = useMemo(() => {
    if (!preferredLibraries.length) return [];
    const selectedSet = new Set(preferredLibraries);
    return orderedLibraries.filter((item) => selectedSet.has(item.key));
  }, [orderedLibraries, preferredLibraries]);
  const allSelected = !selectedLibraries.length || (Boolean(allLibraryKeys.length) && selectedLibraries.length === allLibraryKeys.length);
  const selectionSummaryLabel = selectedLibraries.length
    ? (selectedLibraries.length === 1
      ? `当前范围 ${selectedLibraries[0]?.label || selectedLibraries[0]?.name || selectedLibraries[0]?.key || '数据集'}`
      : `当前范围 ${selectedLibraries.length} 个数据集`)
    : `当前范围 全部数据集`;

  useEffect(() => {
    const unlockedSet = new Set(unlockedLibraryKeys);
    setPreferredLibraries((current) => current.filter((key) => {
      const library = orderedLibraries.find((item) => item?.key === key);
      return library && (!library.secretProtected || unlockedSet.has(key));
    }));
  }, [orderedLibraries, setPreferredLibraries, unlockedLibraryKeys]);

  async function handleCreateLibrary(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || libraryCreateBusy) return false;
    try {
      setLibraryCreateBusy(true);
      const created = await createDocumentLibrary(trimmed, '', 0, { datasetSecretState });
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

  async function handleVerifyDatasetSecret(secret) {
    const nextState = await verifyDatasetSecret(secret);
    if (secretPromptTarget?.key && nextState?.activeLibraryKeys?.includes(secretPromptTarget.key)) {
      setPreferredLibraries(nextState.activeLibraryKeys);
    }
    setSecretPromptTarget(null);
    return nextState;
  }

  function handleTogglePreferredLibrary(libraryKey) {
    const library = orderedLibraries.find((item) => item?.key === libraryKey) || null;
    if (library?.secretProtected && !unlockedLibraryKeys.includes(library.key)) {
      setSecretPromptTarget(library);
      return;
    }
    setPreferredLibraries((current) => (
      current.includes(libraryKey)
        ? current.filter((item) => item !== libraryKey)
        : [...current, libraryKey]
    ));
  }

  if (mobileViewport) {
    return (
      <HomeMobileShell
        documentLibraries={documentLibraries}
        documentTotal={documentTotal}
        preferredLibraries={preferredLibraries}
        unlockedLibraryKeys={unlockedLibraryKeys}
        datasetSecretState={datasetSecretState}
        onToggleLibrary={handleTogglePreferredLibrary}
        onRequestUnlockLibrary={setSecretPromptTarget}
        onClearLibraries={() => setPreferredLibraries([])}
        onCreateLibrary={handleCreateLibrary}
        creatingLibrary={libraryCreateBusy}
        datasetSecretSlot={(
          <FullIntelligenceModeButton
            compact
            datasetSecretState={datasetSecretState}
            onVerifySecret={handleVerifyDatasetSecret}
            onActivateGrant={activateDatasetSecret}
            onClearCache={clearDatasetSecretCache}
            promptTargetLibrary={secretPromptTarget}
            onPromptHandled={() => setSecretPromptTarget(null)}
          />
        )}
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
        reportItems={reportItems}
        selectedReportId={selectedReportId}
        selectedReportItem={selectedReportItem}
        reportDetailLoading={reportDetailLoading}
        onSelectReport={setSelectedReportId}
        onPrepareReportPreview={() => setReportCollapsed(false)}
      />
    );
  }

  return (
    <div className="home-shell">
      <main className="home-main-panel">
        <HomeWorkspaceToolbar
          currentPath="/"
          sourceItems={sidebarSources}
          fullIntelligenceSlot={(
            <FullIntelligenceModeButton
              compact
              datasetSecretState={datasetSecretState}
              onVerifySecret={handleVerifyDatasetSecret}
              onActivateGrant={activateDatasetSecret}
              onClearCache={clearDatasetSecretCache}
              promptTargetLibrary={secretPromptTarget}
              onPromptHandled={() => setSecretPromptTarget(null)}
            />
          )}
        />

        <section className={`home-desktop-grid ${reportCollapsed ? 'home-desktop-grid-compact' : 'home-desktop-grid-expanded'}`}>
          <HomeDatasetRail
            libraries={orderedLibraries}
            totalDocuments={documentTotal}
            selectedKeys={preferredLibraries}
            unlockedKeys={unlockedLibraryKeys}
            datasetSecretState={datasetSecretState}
            onToggleLibrary={handleTogglePreferredLibrary}
            onRequestUnlock={setSecretPromptTarget}
            onClearSelection={() => setPreferredLibraries([])}
            onCreateLibrary={handleCreateLibrary}
            creating={libraryCreateBusy}
            clearChipActive={allSelected}
            clearChipLabel={`全部数据集 ${documentTotal}`}
            selectionSummaryLabel={selectionSummaryLabel}
          />

          <section className="home-chat-stage">
            <ChatPanel
              compact
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
              chatDebugAvailable={chatDebugAvailable}
              chatDebugDetailsEnabled={chatDebugDetailsEnabled}
              onToggleChatDebugDetails={() => setChatDebugDetailsEnabled((prev) => !prev)}
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
