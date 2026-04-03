'use client';

import ChatPanel from './components/ChatPanel';
import FullIntelligenceModeButton from './components/FullIntelligenceModeButton';
import InsightPanel from './components/InsightPanel';
import Sidebar from './components/Sidebar';
import { useHomePageController } from './use-home-page-controller';

function buildTopSummary(documentTotal, documentLibraries) {
  const libraries = Array.isArray(documentLibraries) ? documentLibraries : [];
  const nonEmptyLibraries = libraries
    .filter((library) => Number(library?.documentCount || 0) > 0)
    .sort((a, b) => Number(b?.documentCount || 0) - Number(a?.documentCount || 0));

  const visibleNames = nonEmptyLibraries
    .slice(0, 3)
    .map((library) => library.label || library.name || library.key)
    .filter(Boolean)
    .join('、');

  const prefix = `已管理文档 ${documentTotal} 份，知识库 ${libraries.length} 个`;
  if (!visibleNames) {
    return `${prefix}。普通对话默认只做供料，不再强行编排；只有命中库内资料模板输出时，才会先让你确认两种执行方式。`;
  }

  return `${prefix}，当前重点包括 ${visibleNames}${libraries.length > 3 ? ' 等' : ''}。普通对话默认只做供料，不再强行编排；只有命中库内资料模板输出时，才会先让你确认两种执行方式。`;
}

export default function HomePageClient({ initialModelState }) {
  const {
    acceptIngestGroupSuggestion,
    assignIngestToSelectedLibrary,
    confirmTemplateOption,
    deleteReport,
    documentLibraries,
    documentTotal,
    groupSaving,
    input,
    isLoading,
    messages,
    reportCollapsed,
    reportItems,
    reviseReport,
    runDocumentUpload,
    selectedManualLibraries,
    selectedReportId,
    setInput,
    setReportCollapsed,
    setSelectedManualLibraries,
    setSelectedReportId,
    setSystemConstraints,
    sidebarSources,
    submitCredentialForMessage,
    submitQuestion,
    systemConstraints,
    uploadInputRef,
    uploadLoading,
  } = useHomePageController();

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/" initialModelState={initialModelState} />

      <main className="main-panel main-panel-home">
        <header className="topbar">
          <div className="topbar-title-row">
            <h2>智能助手</h2>
            <span className="topbar-inline-note">{buildTopSummary(documentTotal, documentLibraries)}</span>
          </div>
          <div className="topbar-actions">
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
              collapsed={reportCollapsed}
              onToggleCollapsed={() => setReportCollapsed((prev) => !prev)}
              reportItems={reportItems}
              selectedReportId={selectedReportId}
              onSelectReport={setSelectedReportId}
              onDeleteReport={deleteReport}
              onReviseReport={reviseReport}
            />
          </section>
        </section>
      </main>
    </div>
  );
}
