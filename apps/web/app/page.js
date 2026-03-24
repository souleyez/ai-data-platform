'use client';

import ChatPanel from './components/ChatPanel';
import InsightPanel from './components/InsightPanel';
import Sidebar from './components/Sidebar';
import { useHomePageController } from './use-home-page-controller';

function buildTopSummary(documentTotal, documentLibraries) {
  const libraryCount = documentLibraries.length;
  const names = documentLibraries
    .filter((library) => Number(library?.documentCount || 0) > 0)
    .sort((a, b) => Number(b?.documentCount || 0) - Number(a?.documentCount || 0))
    .slice(0, 3)
    .map((library) => library.label || library.name || library.key)
    .filter(Boolean)
    .join('、');

  return `已管理文档 ${documentTotal} 份，知识库 ${libraryCount} 个${names ? `（${names}${libraryCount > 3 ? ' 等' : ''}）` : ''}。直接说明知识库需求，可定制数据报表、静态 PPT、研发计划等。`;
}

export default function HomePage() {
  const {
    documentLibraries,
    documentTotal,
    deleteReport,
    groupSaving,
    input,
    isLoading,
    messages,
    reportCollapsed,
    reportItems,
    selectedReportId,
    selectedManualLibraries,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    setInput,
    setReportCollapsed,
    setSelectedReportId,
    setSelectedManualLibraries,
    submitQuestion,
    runDocumentUpload,
    acceptIngestGroupSuggestion,
    assignIngestToSelectedLibrary,
    submitCredentialForMessage,
  } = useHomePageController();

  const topSummary = buildTopSummary(documentTotal, documentLibraries);

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/" />

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title-row">
            <h2>AI 知识库</h2>
            <span className="topbar-inline-note">{topSummary}</span>
          </div>
        </header>

        <section className="homepage-grid">
          <section className={`workspace-grid ${reportCollapsed ? 'workspace-grid-expanded' : ''}`}>
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
            />
            <InsightPanel
              collapsed={reportCollapsed}
              onToggleCollapsed={() => setReportCollapsed((prev) => !prev)}
              reportItems={reportItems}
              selectedReportId={selectedReportId}
              onSelectReport={setSelectedReportId}
              onDeleteReport={deleteReport}
            />
          </section>
        </section>
      </main>
    </div>
  );
}
