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

  useEffect(() => {
    loadDatasources();
    loadCaptureTasks();
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
                  <h3>指定网页采集</h3>
                  <p>输入网址、关注内容和频次；系统会抓取网页、生成总结，并把结果写入文档库。</p>
                </div>
              </div>

              <form className="capture-form" onSubmit={submitWebCapture}>
                <input
                  className="filter-input"
                  placeholder="https://example.com/tech-paper"
                  value={captureForm.url}
                  onChange={(event) => setCaptureForm((prev) => ({ ...prev, url: event.target.value }))}
                />
                <input
                  className="filter-input"
                  placeholder="指定想采集的内容，比如：论文摘要、更新日志、技术参数"
                  value={captureForm.focus}
                  onChange={(event) => setCaptureForm((prev) => ({ ...prev, focus: event.target.value }))}
                />
                <div className="capture-form-row">
                  <select
                    className="filter-input"
                    value={captureForm.frequency}
                    onChange={(event) => setCaptureForm((prev) => ({ ...prev, frequency: event.target.value }))}
                  >
                    <option value="manual">手动执行</option>
                    <option value="daily">每日</option>
                    <option value="weekly">每周</option>
                  </select>
                  <input
                    className="filter-input"
                    placeholder="补充说明（可选）"
                    value={captureForm.note}
                    onChange={(event) => setCaptureForm((prev) => ({ ...prev, note: event.target.value }))}
                  />
                </div>
                <button className="primary-btn" type="submit" disabled={captureLoading}>
                  {captureLoading ? '采集中...' : '开始采集并入库'}
                </button>
              </form>

              {captureStatus ? <div className="page-note" style={{ marginTop: 14 }}>{captureStatus}</div> : null}
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>网页采集任务</h3>
                  <p>优先支持用户指定网站；抓取结果会生成总结并落成文档，供后续检索与问答引用。</p>
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
                    <div className="capture-task-note">先在左侧填写地址、关注内容和频次，系统会立即尝试抓取并写入文档库。</div>
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
