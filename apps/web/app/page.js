'use client';

import ChatPanel from './components/ChatPanel';
import CaptureTasksPanel from './components/CaptureTasksPanel';
import InsightPanel from './components/InsightPanel';
import Sidebar from './components/Sidebar';
import WorkbenchToolbar from './components/WorkbenchToolbar';
import { workbenchCategories } from './lib/mock-data';
import { useHomePageController } from './use-home-page-controller';

export default function HomePage() {
  const {
    activeScenario,
    captureTasks,
    documentLibraries,
    documentSnapshot,
    groupSaving,
    input,
    isLoading,
    messages,
    panel,
    selectedManualLibraries,
    sidebarSources,
    uploadInputRef,
    uploadLoading,
    setInput,
    setSelectedManualLibraries,
    selectWorkbenchCategory,
    submitQuestion,
    resetConversation,
    runDocumentUpload,
    acceptIngestGroupSuggestion,
    assignIngestToSelectedLibrary,
    submitCredentialForMessage,
  } = useHomePageController();

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/" />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>AI 知识库</h2>
            <p>首页保留统一对话入口：发问题、发链接采集、上传文件入库，反馈都会留在当前会话里。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={resetConversation}>新建会话</button>
            <button className="primary-btn" disabled>生成日报（预留）</button>
          </div>
        </header>

        <WorkbenchToolbar
          categories={workbenchCategories}
          activeKey={activeScenario}
          onSelect={selectWorkbenchCategory}
        />

        <section className="homepage-grid">
          <section className="workspace-grid">
            <ChatPanel
              messages={messages}
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSubmit={submitQuestion}
              onQuickAction={submitQuestion}
              documentSnapshot={documentSnapshot}
              uploadInputRef={uploadInputRef}
              uploadLoading={uploadLoading}
              onUploadFilesSelected={runDocumentUpload}
              availableLibraries={documentLibraries}
              selectedManualLibraries={selectedManualLibraries}
              onChangeManualLibrary={(itemId, value) => setSelectedManualLibraries((prev) => ({ ...prev, [itemId]: value }))}
              onAcceptGroupSuggestion={acceptIngestGroupSuggestion}
              onAssignLibrary={assignIngestToSelectedLibrary}
              groupSaving={groupSaving}
              onSubmitCredential={submitCredentialForMessage}
            />
            <InsightPanel panel={panel} />
          </section>

          <section className="documents-grid home-bottom-grid">
            <CaptureTasksPanel captureTasks={captureTasks} />
          </section>
        </section>
      </main>
    </div>
  );
}
