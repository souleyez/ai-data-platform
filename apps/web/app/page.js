'use client';

import { useEffect, useRef, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import InsightPanel from './components/InsightPanel';
import Sidebar from './components/Sidebar';
import { buildApiUrl } from './lib/config';
import { normalizeChatResponse, normalizeDatasourceResponse } from './lib/types';
import { initialMessages, scenarios, sourceItems, workbenchCategories } from './lib/mock-data';

const initialCaptureForm = {
  url: '',
  focus: '正文、技术要点、更新内容',
  frequency: 'daily',
  note: '',
};

const CHAT_STORAGE_KEY = 'aidp-home-chat-v1';

const initialUploadForm = {
  files: [],
  note: '优先解析论文、技术白皮书、需求说明等资料',
};

function renderIngestFeedback({
  status,
  onAcceptGroupSuggestion,
  onAssignLibrary,
  selectedManualLibraries,
  onChangeManualLibrary,
  availableLibraries = [],
  fallbackLink = true,
  groupSaving = false,
}) {
  if (!status) return null;

  if (typeof status === 'string') {
    return <div className="page-note" style={{ marginTop: 14 }}>{status}</div>;
  }

  const items = Array.isArray(status.ingestItems) ? status.ingestItems : [];

  return (
    <div className="page-note" style={{ marginTop: 14 }}>
      <div>{status.message}</div>
      {status.summary ? (
        <div style={{ marginTop: 6 }}>
          共 {status.summary.total} 项，成功 {status.summary.successCount} 项，失败 {status.summary.failedCount} 项。
        </div>
      ) : null}

      {items.length ? (
        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                padding: '10px 12px',
                border: '1px solid rgba(148,163,184,0.25)',
                borderRadius: 10,
                background: 'rgba(15,23,42,0.18)',
              }}
            >
              <div style={{ fontSize: 12, color: 'rgba(226,232,240,0.78)' }}>{item.sourceName}</div>

              {item.status === 'success' ? (
                <>
                  <div style={{ marginTop: 6, fontWeight: 700, fontSize: 15 }}>{item.preview?.title || '-'}</div>

                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span className="source-chip">分类：{item.recommendation?.category || item.preview?.docType || '-'}</span>
                    {item.groupSuggestion?.suggestedGroups?.length ? (
                      item.groupSuggestion.suggestedGroups.map((group) => (
                        <span key={group.key} className="source-chip">
                          {item.groupSuggestion?.accepted ? '已加入知识库：' : '推荐知识库：'}{group.label}
                        </span>
                      ))
                    ) : (
                      <span className="source-chip">默认：未分组</span>
                    )}
                  </div>

                  {item.groupSuggestion?.suggestedGroups?.length && !item.groupSuggestion?.accepted ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button
                        className="ghost-btn"
                        type="button"
                        onClick={() => onAcceptGroupSuggestion?.(item.id)}
                        disabled={groupSaving || item.groupSuggestion.accepted}
                      >
                        {item.groupSuggestion.accepted ? '已纳入推荐分组' : '自动纳入推荐分组'}
                      </button>
                      <span style={{ opacity: 0.8 }}>{item.groupSuggestion.basis}</span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, opacity: 0.8 }}>
                      {item.groupSuggestion?.basis || '未命中合适知识库，先保持未分组。'}
                    </div>
                  )}

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                      className="filter-input"
                      style={{ minWidth: 180, maxWidth: 260 }}
                      value={selectedManualLibraries?.[item.id] || ''}
                      onChange={(event) => onChangeManualLibrary?.(item.id, event.target.value)}
                      disabled={groupSaving || !availableLibraries.length}
                    >
                      <option value="">手动加入指定知识库</option>
                      {availableLibraries.map((library) => (
                        <option key={library.key} value={library.key}>{library.label}</option>
                      ))}
                    </select>
                    <button
                      className="ghost-btn"
                      type="button"
                      onClick={() => onAssignLibrary?.(item.id)}
                      disabled={groupSaving || !selectedManualLibraries?.[item.id]}
                    >
                      加入指定库
                    </button>
                    {!availableLibraries.length ? <span style={{ opacity: 0.75 }}>先去文档中心创建知识库分组</span> : null}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 6 }}>处理失败：{item.errorMessage || '未知错误'}</div>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {fallbackLink ? (
        <a href="/documents" style={{ display: 'inline-block', marginTop: 10, fontWeight: 700 }}>立即查看</a>
      ) : null}
    </div>
  );
}

export default function HomePage() {
  const [messages, setMessages] = useState(initialMessages);
  const uploadInputRef = useRef(null);
  const [input, setInput] = useState('');
  const [activeScenario, setActiveScenario] = useState('technical');
  const [panel, setPanel] = useState(scenarios.technical || scenarios.default);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [isLoading, setIsLoading] = useState(false);
  const [captureForm, setCaptureForm] = useState(initialCaptureForm);
  const [captureTasks, setCaptureTasks] = useState([]);
  const [captureStatus, setCaptureStatus] = useState('');
  const [captureLoading, setCaptureLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadLoading, setUploadLoading] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);
  const [documentLibraries, setDocumentLibraries] = useState([]);
  const [selectedManualLibraries, setSelectedManualLibraries] = useState({});
  const [documentSnapshot, setDocumentSnapshot] = useState({ totalFiles: 0, parsed: 0, scanRoot: '' });

  const selectWorkbenchCategory = (categoryKey) => {
    setActiveScenario(categoryKey);
    setPanel(scenarios[categoryKey] || scenarios.default);
  };

  async function loadDatasources() {
    try {
      const response = await fetch(buildApiUrl('/api/datasources'));
      if (!response.ok) throw new Error('load datasources failed');
      const json = await response.json();
      const normalized = normalizeDatasourceResponse(json);
      if (normalized.items.length) setSidebarSources(normalized.items);
    } catch {
      // keep local fallback
    }
  }

  async function loadCaptureTasks() {
    try {
      const response = await fetch(buildApiUrl('/api/web-captures'));
      if (!response.ok) throw new Error('load web captures failed');
      const json = await response.json();
      setCaptureTasks(Array.isArray(json?.items) ? json.items : []);
    } catch {
      setCaptureTasks([]);
    }
  }

  async function loadDocumentSnapshot() {
    try {
      const response = await fetch(buildApiUrl('/api/documents'));
      if (!response.ok) throw new Error('load documents failed');
      const json = await response.json();
      setDocumentLibraries(Array.isArray(json?.libraries) ? json.libraries : []);
      setDocumentSnapshot({
        totalFiles: json?.totalFiles || 0,
        parsed: json?.meta?.parsed || 0,
        scanRoot: json?.scanRoot || '',
      });
    } catch {
      setDocumentLibraries([]);
      setDocumentSnapshot({ totalFiles: 0, parsed: 0, scanRoot: '' });
    }
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) setMessages(parsed);
      }
    } catch {
      // ignore invalid local cache
    }

    loadDatasources();
    loadCaptureTasks();
    loadDocumentSnapshot();
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {
      // ignore persistence failure
    }
  }, [messages]);

  const submitQuestion = async (value) => {
    const text = value.trim();
    if (!text || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch(buildApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });

      if (!response.ok) throw new Error('mock api failed');

      const data = await response.json();
      const normalized = normalizeChatResponse(data, scenarios.default);
      setMessages((prev) => [...prev, normalized.message]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '模拟接口暂时不可用，请稍后重试。',
          meta: '来源：mock API / 错误回退',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const resetConversation = () => {
    setMessages(initialMessages);
    setActiveScenario('technical');
    setPanel(scenarios.technical || scenarios.default);
    setInput('');
    try {
      window.localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore clear failure
    }
  };

  const submitWebCapture = async (event) => {
    event.preventDefault();
    if (!captureForm.url.trim() || captureLoading) return;

    setCaptureLoading(true);
    setCaptureStatus('');

    try {
      const response = await fetch(buildApiUrl('/api/web-captures'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(captureForm),
      });
      const raw = await response.text();
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      if (!response.ok) throw new Error(json?.error || raw || 'create web capture failed');

      const nextStatus = {
        message: json?.message || '网页采集任务已创建。',
        summary: json?.summary,
        ingestItems: json?.ingestItems || [],
      };
      setCaptureStatus(nextStatus);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '网页采集已加入队列',
          content: `${nextStatus.message}${nextStatus.summary ? ` 共 ${nextStatus.summary.total} 项，成功 ${nextStatus.summary.successCount} 项。` : ''}`,
          meta: captureForm.url,
        },
      ]);
      setCaptureForm(initialCaptureForm);
      await Promise.all([loadCaptureTasks(), loadDatasources()]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '网页采集任务创建失败';
      setCaptureStatus(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '网页采集失败',
          content: errorMessage,
          meta: captureForm.url,
        },
      ]);
    } finally {
      setCaptureLoading(false);
    }
  };

  const saveGroupsForUploadItem = async (itemId, groups, successTitle, successContent) => {
    setGroupSaving(true);
    try {
      const response = await fetch(buildApiUrl('/api/documents/groups'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: itemId, groups }] }),
      });
      const raw = await response.text();
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      if (!response.ok) throw new Error(json?.error || raw || 'save groups failed');

      setUploadStatus((prev) => {
        if (!prev || typeof prev === 'string') return prev;
        const refreshed = new Map((json?.ingestItems || []).map((item) => [item.id, item]));
        return {
          ...prev,
          message: json?.message || prev.message,
          ingestItems: (prev.ingestItems || []).map((item) => refreshed.get(item.id) || item),
        };
      });

      if (successTitle && successContent) {
        setMessages((prev) => [...prev, { role: 'assistant', title: successTitle, content: successContent }]);
      }

      await loadDocumentSnapshot();
      return true;
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : '保存知识库分组失败');
      return false;
    } finally {
      setGroupSaving(false);
    }
  };

  const acceptUploadGroupSuggestion = async (itemId) => {
    if (groupSaving) return;
    const current = typeof uploadStatus === 'object'
      ? (uploadStatus.ingestItems || []).find((item) => item.id === itemId)
      : null;
    const groups = (current?.groupSuggestion?.suggestedGroups || []).map((item) => item.key);
    if (!groups.length) return;

    await saveGroupsForUploadItem(
      itemId,
      groups,
      '已纳入推荐分组',
      `${current?.preview?.title || current?.sourceName} 已自动纳入：${(current?.groupSuggestion?.suggestedGroups || []).map((item) => item.label).join('、')}。`,
    );
  };

  const assignUploadToSelectedLibrary = async (itemId) => {
    if (groupSaving) return;

    const selectedLibraryKey = selectedManualLibraries[itemId];
    if (!selectedLibraryKey) return;

    const current = typeof uploadStatus === 'object'
      ? (uploadStatus.ingestItems || []).find((item) => item.id === itemId)
      : null;

    const existingGroups = current?.groupSuggestion?.suggestedGroups || [];
    const groups = Array.from(new Set([
      ...existingGroups.map((item) => item.key),
      selectedLibraryKey,
    ]));

    const selectedLibrary = documentLibraries.find((item) => item.key === selectedLibraryKey);
    const saved = await saveGroupsForUploadItem(
      itemId,
      groups,
      '已加入指定知识库',
      `${current?.preview?.title || current?.sourceName} 已加入指定知识库：${selectedLibrary?.label || selectedLibraryKey}。`,
    );

    if (saved) {
      setSelectedManualLibraries((prev) => ({ ...prev, [itemId]: '' }));
    }
  };

  const submitDocumentUpload = async (event) => {
    event.preventDefault();
    if (!uploadForm.files.length || uploadLoading) return;

    setUploadLoading(true);
    setUploadStatus('');

    try {
      const formData = new FormData();
      uploadForm.files.forEach((file) => formData.append('files', file));
      formData.append('note', uploadForm.note || '');

      const response = await fetch(buildApiUrl('/api/documents/upload'), {
        method: 'POST',
        body: formData,
      });
      const raw = await response.text();
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      if (!response.ok) throw new Error(json?.error || raw || 'document upload failed');

      await Promise.all([loadDatasources(), loadCaptureTasks(), loadDocumentSnapshot()]);
      const nextStatus = {
        message: json?.message || `已上传 ${json?.uploadedCount || uploadForm.files.length} 个文件。`,
        summary: json?.summary,
        ingestItems: json?.ingestItems || [],
      };
      const importantTitles = nextStatus.ingestItems
        .filter((item) => item.status === 'success')
        .map((item) => item.preview?.title)
        .filter(Boolean)
        .slice(0, 4);

      setSelectedManualLibraries({});
      setUploadStatus(nextStatus);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '文档已上传',
          content: importantTitles.length
            ? `本次重点识别标题：${importantTitles.join('；')}${nextStatus.summary && nextStatus.summary.total > importantTitles.length ? ` 等 ${nextStatus.summary.total} 项` : ''}。`
            : nextStatus.message,
          meta: nextStatus.summary
            ? `成功 ${nextStatus.summary.successCount} 项，失败 ${nextStatus.summary.failedCount} 项`
            : uploadForm.files.map((file) => file.name).join('，'),
        },
      ]);
      setUploadForm(initialUploadForm);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文档上传失败';
      setUploadStatus(errorMessage);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '文档上传失败',
          content: errorMessage,
          meta: uploadForm.files.map((file) => file.name).join('，'),
        },
      ]);
    } finally {
      setUploadLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/" />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>企业智能分析助手</h2>
            <p>当前重点已切到真实后端链路与页面骨架联动：聊天、文档、数据源、报表均优先展示真实接口返回。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={resetConversation}>新建会话</button>
            <button className="primary-btn" disabled>生成日报（待接实）</button>
          </div>
        </header>

        <section className="workbench-toolbar card">
          <div className="workbench-toolbar-label">数据分类</div>
          <div className="workbench-toolbar-tabs">
            {workbenchCategories.map((item) => (
              <button
                key={item.key}
                className={`workbench-tab ${activeScenario === item.key ? 'active' : ''}`}
                onClick={() => selectWorkbenchCategory(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="homepage-grid">
          <section className="card documents-card intake-card">
            <div className="intake-summary-bar">
              <span className="source-chip">当前文档总数：{documentSnapshot.totalFiles}</span>
              <span className="source-chip">已解析：{documentSnapshot.parsed}</span>
              {documentSnapshot.scanRoot ? <span className="source-chip">扫描目录：{documentSnapshot.scanRoot}</span> : null}
              <a href="/documents" className="ref-chip">前往文档中心</a>
            </div>

            <section className="documents-grid home-top-grid intake-grid">
              <section className="summary-item intake-pane compact-intake-pane">
                <div className="panel-header compact-pane-header">
                  <div>
                    <h3>指定网页采集</h3>
                  </div>
                </div>

                <form className="capture-form" onSubmit={submitWebCapture}>
                  <input
                    className="filter-input"
                    placeholder="https://example.com/tech-paper"
                    value={captureForm.url}
                    onChange={(event) => setCaptureForm((prev) => ({ ...prev, url: event.target.value }))}
                  />
                  <div className="capture-form-row compact-row">
                    <select
                      className="filter-input"
                      value={captureForm.frequency}
                      onChange={(event) => setCaptureForm((prev) => ({ ...prev, frequency: event.target.value }))}
                    >
                      <option value="manual">手动执行</option>
                      <option value="daily">每日</option>
                      <option value="weekly">每周</option>
                    </select>
                    <button className="primary-btn" type="submit" disabled={captureLoading}>
                      {captureLoading ? '采集中...' : '开始采集并入库'}
                    </button>
                  </div>
                </form>

                {renderIngestFeedback({
                  status: captureStatus,
                  onAcceptGroupSuggestion: null,
                  onAssignLibrary: null,
                  selectedManualLibraries: null,
                  onChangeManualLibrary: null,
                  availableLibraries: [],
                  fallbackLink: false,
                  groupSaving,
                })}
              </section>

              <section className="summary-item intake-pane compact-intake-pane">
                <div className="panel-header compact-pane-header">
                  <div>
                    <h3>文档上传入口</h3>
                  </div>
                </div>

                <form className="capture-form" onSubmit={submitDocumentUpload}>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    multiple
                    onChange={(event) => setUploadForm((prev) => ({ ...prev, files: Array.from(event.target.files || []) }))}
                    style={{ display: 'none' }}
                  />
                  <div
                    className="upload-dropzone minimal-dropzone"
                    role="button"
                    tabIndex={0}
                    onClick={() => uploadInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (uploadLoading) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        uploadInputRef.current?.click();
                      }
                    }}
                    style={{ opacity: uploadLoading ? 0.65 : 1, pointerEvents: uploadLoading ? 'none' : 'auto' }}
                  >
                    <span className="upload-hint">{uploadLoading ? '上传处理中...' : `已选 ${uploadForm.files.length} 个文件`}</span>
                    <span style={{ fontSize: 13, color: '#475569' }}>点击选择文件，支持多选</span>
                  </div>
                  {!!uploadForm.files.length ? (
                    <div className="capture-task-meta">{uploadForm.files.map((file) => file.name).join('，')}</div>
                  ) : null}
                  <button className="primary-btn" type="submit" disabled={!uploadForm.files.length || uploadLoading}>
                    {uploadLoading ? '上传中...' : '上传并加入文档库'}
                  </button>
                  {uploadLoading ? (
                    <div className="page-note" style={{ marginBottom: 0 }}>
                      正在上传并解析资料，请稍候，当前已锁定按钮以避免重复提交。
                    </div>
                  ) : null}
                </form>

                {renderIngestFeedback({
                  status: uploadStatus,
                  onAcceptGroupSuggestion: acceptUploadGroupSuggestion,
                  onAssignLibrary: assignUploadToSelectedLibrary,
                  selectedManualLibraries,
                  onChangeManualLibrary: (itemId, value) => setSelectedManualLibraries((prev) => ({ ...prev, [itemId]: value })),
                  availableLibraries: documentLibraries,
                  fallbackLink: true,
                  groupSaving,
                })}
              </section>
            </section>
          </section>

          <section className="workspace-grid">
            <ChatPanel
              messages={messages}
              input={input}
              isLoading={isLoading}
              onInputChange={setInput}
              onSubmit={submitQuestion}
              onQuickAction={submitQuestion}
            />
            <InsightPanel panel={panel} />
          </section>

          <section className="documents-grid home-bottom-grid">
            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>网页采集任务</h3>
                  <p>已创建的网页采集任务会在这里持续显示，方便回看频次、状态和最近一次摘要。</p>
                </div>
              </div>

              <div className="capture-task-list">
                {captureTasks.length ? captureTasks.slice(0, 6).map((task) => (
                  <div key={task.id} className="summary-item capture-task-item">
                    <div className="summary-key">{task.title || task.url}</div>
                    <div className="capture-task-meta">频次：{task.frequency} · 状态：{task.lastStatus || 'idle'}</div>
                    <div className="capture-task-note">关注：{task.focus}</div>
                    <div className="capture-task-note">总结：{task.lastSummary || '暂无'}</div>
                  </div>
                )) : (
                  <div className="summary-item capture-task-item">
                    <div className="summary-key">还没有网页采集任务</div>
                    <div className="capture-task-note">先在上方填写地址、关注内容和频次，系统会尝试抓取并写入文档库。</div>
                  </div>
                )}
              </div>
            </section>
          </section>
        </section>
      </main>
    </div>
  );
}
