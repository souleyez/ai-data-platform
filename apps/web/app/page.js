'use client';

import { useEffect, useState } from 'react';
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

const initialUploadForm = {
  files: [],
  note: '优先解析论文、技术白皮书、需求说明等资料',
};

export default function HomePage() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [activeScenario, setActiveScenario] = useState('order');
  const [panel, setPanel] = useState(scenarios.order);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [isLoading, setIsLoading] = useState(false);
  const [captureForm, setCaptureForm] = useState(initialCaptureForm);
  const [captureTasks, setCaptureTasks] = useState([]);
  const [captureStatus, setCaptureStatus] = useState('');
  const [captureLoading, setCaptureLoading] = useState(false);
  const [uploadForm, setUploadForm] = useState(initialUploadForm);
  const [uploadStatus, setUploadStatus] = useState('');
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
      setDocumentSnapshot({
        totalFiles: json?.totalFiles || 0,
        parsed: json?.meta?.parsed || 0,
        scanRoot: json?.scanRoot || '',
      });
    } catch {
      setDocumentSnapshot({ totalFiles: 0, parsed: 0, scanRoot: '' });
    }
  }

  useEffect(() => {
    loadDatasources();
    loadCaptureTasks();
    loadDocumentSnapshot();
  }, []);

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
    setActiveScenario('order');
    setPanel(scenarios.order);
    setInput('');
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
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'create web capture failed');

      setCaptureStatus(json?.message || '网页采集任务已创建。');
      setCaptureForm(initialCaptureForm);
      await Promise.all([loadCaptureTasks(), loadDatasources()]);
    } catch (error) {
      setCaptureStatus(error instanceof Error ? error.message : '网页采集任务创建失败');
    } finally {
      setCaptureLoading(false);
    }
  };

  const submitDocumentUpload = async (event) => {
    event.preventDefault();
    if (!uploadForm.files.length) return;

    setUploadStatus('');

    try {
      const formData = new FormData();
      uploadForm.files.forEach((file) => formData.append('files', file));
      formData.append('note', uploadForm.note || '');

      const response = await fetch(buildApiUrl('/api/documents/upload'), {
        method: 'POST',
        body: formData,
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'document upload failed');

      const uploadedCount = json?.uploadedCount || uploadForm.files.length;
      await Promise.all([loadDatasources(), loadCaptureTasks(), loadDocumentSnapshot()]);
      setUploadStatus(`${json?.message || `已上传 ${uploadedCount} 个文件。`} 现在可前往文档中心查看。`);
      setUploadForm(initialUploadForm);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : '文档上传失败');
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

                {captureStatus ? <div className="page-note" style={{ marginTop: 14 }}>{captureStatus}</div> : null}
              </section>

              <section className="summary-item intake-pane compact-intake-pane">
                <div className="panel-header compact-pane-header">
                  <div>
                    <h3>文档上传入口</h3>
                  </div>
                </div>

                <form className="capture-form" onSubmit={submitDocumentUpload}>
                  <label className="upload-dropzone minimal-dropzone">
                    <input
                      type="file"
                      multiple
                      onChange={(event) => setUploadForm((prev) => ({ ...prev, files: Array.from(event.target.files || []) }))}
                      style={{ display: 'none' }}
                    />
                    <span className="upload-hint">已选 {uploadForm.files.length} 个文件</span>
                  </label>
                  <button className="primary-btn" type="submit" disabled={!uploadForm.files.length}>
                    上传并加入文档库
                  </button>
                </form>

                {uploadStatus ? <div className="page-note" style={{ marginTop: 14 }}>{uploadStatus} <a href="/documents" style={{ marginLeft: 8, fontWeight: 700 }}>立即查看</a></div> : null}
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
