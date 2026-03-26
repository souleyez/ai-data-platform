'use client';

import ChatPanel from './components/ChatPanel';
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

  const libraryCount = libraries.length;
  const prefix = `已管理文档 ${documentTotal} 份，知识库 ${libraryCount} 个`;
  if (!visibleNames) {
    return `${prefix}。日常问题可直接对话，需要基于知识库生成内容时，请使用“按知识库输出”。`;
  }

  return `${prefix}，当前重点包括 ${visibleNames}${libraryCount > 3 ? ' 等' : ''}。日常问题可直接对话，需要基于知识库生成内容时，请使用“按知识库输出”。`;
}

export default function HomePageClient({ initialModelState }) {
  const {
    canPrepareKnowledgeOutput,
    deleteReport,
    documentLibraries,
    documentTotal,
    groupSaving,
    input,
    isLoading,
    knowledgeOutputDraft,
    knowledgeOutputLoading,
    knowledgeOutputPlan,
    messages,
    reportCollapsed,
    reportItems,
    selectedManualLibraries,
    selectedReportId,
    setInput,
    setKnowledgeOutputDraft,
    setKnowledgeOutputPlan,
    setReportCollapsed,
    setSelectedManualLibraries,
    setSelectedReportId,
    sidebarSources,
    submitKnowledgeOutputConfirm,
    submitKnowledgeOutputPlan,
    submitQuestion,
    uploadInputRef,
    uploadLoading,
    runDocumentUpload,
    acceptIngestGroupSuggestion,
    assignIngestToSelectedLibrary,
    submitCredentialForMessage,
  } = useHomePageController();

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/" initialModelState={initialModelState} />

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title-row">
            <h2>AI智能服务</h2>
            <span className="topbar-inline-note">{buildTopSummary(documentTotal, documentLibraries)}</span>
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
              onPrepareKnowledgeOutput={submitKnowledgeOutputPlan}
              onConfirmKnowledgeOutput={submitKnowledgeOutputConfirm}
              knowledgeOutputDraft={knowledgeOutputDraft}
              knowledgeOutputLoading={knowledgeOutputLoading}
              knowledgeOutputPlan={knowledgeOutputPlan}
              onKnowledgeOutputDraftChange={setKnowledgeOutputDraft}
              onCancelKnowledgeOutput={() => {
                setKnowledgeOutputDraft('');
                setKnowledgeOutputPlan(null);
              }}
              canPrepareKnowledgeOutput={canPrepareKnowledgeOutput}
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
