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

function renderIngestFeedback(status, onChangeClassification, onConfirmClassification, onAcceptCategorySuggestion, fallbackLink = true) {
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
            <div key={item.id} style={{ padding: '10px 12px', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 10, background: 'rgba(15,23,42,0.18)' }}>
              <div style={{ fontWeight: 700 }}>{item.sourceName}</div>
              {item.status === 'success' ? (
                <>
                  <div style={{ marginTop: 6 }}>识别标题：{item.preview?.title || '-'}</div>
                  <div style={{ marginTop: 4 }}>预解析：{item.preview?.summary || '-'}</div>
                  <div style={{ marginTop: 4 }}>推荐分类：{item.recommendation?.category || item.preview?.docType || '-'}</div>
                  <div style={{ marginTop: 4 }}>推荐理由：{item.recommendation?.reason || '-'}</div>
                  {item.categorySuggestion ? (
                    <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 10, background: 'rgba(59,130,246,0.08)', color: '#1e3a8a' }}>
                      <div style={{ fontWeight: 700 }}>项目分类建议：{item.categorySuggestion.suggestedName}</div>
                      <div style={{ marginTop: 4 }}>{item.categorySuggestion.basis}</div>
                      {item.categorySuggestion.action === 'consider_new_category' ? (
                        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button className="ghost-btn" type="button" onClick={() => onAcceptCategorySuggestion?.(item.id)} disabled={item.categorySuggestion.accepted}>
                            {item.categorySuggestion.accepted ? '已加入项目分类' : '接纳为项目分类'}
                          </button>
                          <span style={{ opacity: 0.8 }}>归属大类：{item.categorySuggestion.parentCategoryKey}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {item.classification ? (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        className="filter-input"
                        style={{ minWidth: 140, maxWidth: 220 }}
                        value={item.classification.selectedKey}
                        onChange={(event) => onChangeClassification?.(item.id, event.target.value)}
                      >
                        {item.classification.options?.map((option) => (
                          <option key={option.key} value={option.key}>{option.label}</option>
                        ))}
                      </select>
                      <button className="ghost-btn" type="button" onClick={() => onConfirmClassification?.(item.id)}>
                        {item.classification.confirmed ? '重新确认' : '确认归类'}
                      </button>
                      <span style={{ opacity: 0.8 }}>
                        当前分类：{item.classification.selectedLabel}{item.classification.confirmed ? '（已确认）' : '（待确认）'}
                      </span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div style={{ marginTop: 6 }}>处理失败：{item.errorMessage || '未知错误'}</div>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {fallbackLink ? <a href="/documents" style={{ display: 'inline-block', marginTop: 10, fontWeight: 700 }}>立即查看</a> : null}
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
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [suggestionSaving, setSuggestionSaving] = useState(false);
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
    try {
      const raw = window.localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) {
          setMessages(parsed);
        }
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

  const updateUploadClassificationSelection = (itemId, bizCategory) => {
    setUploadStatus((prev) => {
      if (!prev || typeof prev === 'string') return prev;
      return {
        ...prev,
        ingestItems: (prev.ingestItems || []).map((item) => {
          if (item.id !== itemId || !item.classification) return item;
          const matched = (item.classification.options || []).find((option) => option.key === bizCategory);
          return {
            ...item,
            classification: {
              ...item.classification,
              selectedKey: bizCategory,
              selectedLabel: matched?.label || item.classification.selectedLabel,
              confirmed: false,
            },
          };
        }),
      };
    });
  };

  const confirmUploadClassification = async (itemId) => {
    if (classificationSaving) return;
    const current = typeof uploadStatus === 'object'
      ? (uploadStatus.ingestItems || []).find((item) => item.id === itemId)
      : null;
    const bizCategory = current?.classification?.selectedKey;
    if (!bizCategory) return;

    setClassificationSaving(true);
    try {
      const response = await fetch(buildApiUrl('/api/documents/classify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: itemId, bizCategory }] }),
      });
      const raw = await response.text();
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      if (!response.ok) throw new Error(json?.error || raw || 'classification confirm failed');

      setUploadStatus((prev) => {
        if (!prev || typeof prev === 'string') return prev;
        const refreshed = new Map((json?.ingestItems || []).map((item) => [item.id, item]));
        return {
          ...prev,
          message: json?.message || prev.message,
          ingestItems: (prev.ingestItems || []).map((item) => refreshed.get(item.id) || item),
        };
      });
      const confirmedItem = (json?.ingestItems || [])[0];
      if (confirmedItem?.classification) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            title: '分类已确认',
            content: `${confirmedItem.sourceName} 当前分类已确认为 ${confirmedItem.classification.selectedLabel}。系统推荐仍保留为 ${confirmedItem.recommendation?.category || '未识别'}。`,
            meta: confirmedItem.preview?.title || confirmedItem.sourceName,
          },
        ]);
      }
      await loadDocumentSnapshot();
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : '分类确认失败');
    } finally {
      setClassificationSaving(false);
    }
  };

  const acceptUploadCategorySuggestion = async (itemId) => {
    if (suggestionSaving) return;
    const current = typeof uploadStatus === 'object'
      ? (uploadStatus.ingestItems || []).find((item) => item.id === itemId)
      : null;
    const suggestion = current?.categorySuggestion;
    if (!suggestion?.suggestedName) return;

    setSuggestionSaving(true);
    try {
      const response = await fetch(buildApiUrl('/api/documents/category-suggestions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: itemId, suggestedName: suggestion.suggestedName, parentCategoryKey: suggestion.parentCategoryKey }] }),
      });
      const raw = await response.text();
      let json = {};
      try {
        json = raw ? JSON.parse(raw) : {};
      } catch {
        json = {};
      }
      if (!response.ok) throw new Error(json?.error || raw || 'accept category suggestion failed');

      setUploadStatus((prev) => {
        if (!prev || typeof prev === 'string') return prev;
        return {
          ...prev,
          message: json?.message || prev.message,
          ingestItems: (prev.ingestItems || []).map((item) => item.id === itemId
            ? {
                ...item,
                categorySuggestion: item.categorySuggestion
                  ? { ...item.categorySuggestion, accepted: true }
                  : item.categorySuggestion,
              }
            : item),
        };
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '已接纳新增分类建议',
          content: `已将“${suggestion.suggestedName}”加入项目分类，归属大类为 ${suggestion.parentCategoryKey}。`,
          meta: current?.sourceName || suggestion.suggestedName,
        },
      ]);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : '接纳分类建议失败');
    } finally {
      setSuggestionSaving(false);
    }
  };

  const updateUploadGroupDraft = (itemId, value) => {
    setUploadGroupDrafts((prev) => ({ ...prev, [itemId]: value }));
    setUploadStatus((prev) => {
      if (!prev || typeof prev === 'string') return prev;
      return {
        ...prev,
        ingestItems: (prev.ingestItems || []).map((item) => item.id === itemId ? { ...item, groupDraft: value } : item),
      };
    });
  };

  const acceptUploadGroupSuggestion = async (itemId) => {
    if (groupSaving) return;
    const current = typeof uploadStatus === 'object'
      ? (uploadStatus.ingestItems || []).find((item) => item.id === itemId)
      : null;
    const groups = current?.groupSuggestion?.suggestedGroups || [];
    if (!groups.length) return;

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
      if (!response.ok) throw new Error(json?.error || raw || 'accept group suggestion failed');

      setUploadStatus((prev) => {
        if (!prev || typeof prev === 'string') return prev;
        const refreshed = new Map((json?.ingestItems || []).map((item) => [item.id, item]));
        return {
          ...prev,
          message: json?.message || prev.message,
          ingestItems: (prev.ingestItems || []).map((item) => refreshed.get(item.id) || item),
        };
      });
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '已接纳分组建议',
          content: `${current?.sourceName || '该资料'} 已加入分组：${groups.join('、')}。`,
          meta: current?.preview?.title || current?.sourceName,
        },
      ]);
      await loadDocumentSnapshot();
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : '接纳分组建议失败');
    } finally {
      setGroupSaving(false);
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
      setUploadStatus(nextStatus);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          title: '文档已上传并进入解析',
          content: `${nextStatus.message}${nextStatus.summary ? ` 共 ${nextStatus.summary.total} 项，成功 ${nextStatus.summary.successCount} 项，失败 ${nextStatus.summary.failedCount} 项。` : ''}`,
          meta: uploadForm.files.map((file) => file.name).join('，'),
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

                {renderIngestFeedback(captureStatus, null, null, null, false)}
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
                  <div className="upload-dropzone minimal-dropzone" role="button" tabIndex={0} onClick={() => uploadInputRef.current?.click()} onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      uploadInputRef.current?.click();
                    }
                  }}>
                    <span className="upload-hint">已选 {uploadForm.files.length} 个文件</span>
                    <span style={{ fontSize: 13, color: '#475569' }}>点击选择文件，支持多选</span>
                  </div>
                  {!!uploadForm.files.length ? (
                    <div className="capture-task-meta">{uploadForm.files.map((file) => file.name).join('，')}</div>
                  ) : null}
                  <button className="primary-btn" type="submit" disabled={!uploadForm.files.length}>
                    上传并加入文档库
                  </button>
                </form>

                {renderIngestFeedback(uploadStatus, updateUploadClassificationSelection, confirmUploadClassification, acceptUploadCategorySuggestion, true)}
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
