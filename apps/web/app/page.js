'use client';

import { useEffect, useRef, useState } from 'react';
import ChatPanel from './components/ChatPanel';
import InsightPanel from './components/InsightPanel';
import Sidebar from './components/Sidebar';
import { buildApiUrl } from './lib/config';
import { normalizeChatResponse, normalizeDatasourceResponse } from './lib/types';
import { initialMessages, scenarios, sourceItems, workbenchCategories } from './lib/mock-data';

const CHAT_STORAGE_KEY = 'aidp-home-chat-v1';
const DEFAULT_UPLOAD_NOTE = '优先解析论文、技术白皮书、需求说明等资料';

function createMessageId(prefix = 'msg') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSummaryText(status, fallbackMessage) {
  if (!status?.summary) return fallbackMessage;
  return `${fallbackMessage} 共 ${status.summary.total} 项，成功 ${status.summary.successCount} 项，失败 ${status.summary.failedCount} 项。`;
}

function buildIngestChatMessage({ title, content, meta, feedback }) {
  return {
    id: createMessageId('ingest'),
    role: 'assistant',
    title,
    content,
    meta,
    ingestFeedback: feedback,
  };
}

function buildCredentialRequestMessage({ url, credentialRequest }) {
  return {
    id: createMessageId('credential'),
    role: 'assistant',
    title: '登录采集需要安全凭据',
    content: '这个站点需要登录后再采集。请在下方安全表单里填写账号密码，系统会单独提交，不会写进聊天记录。',
    meta: url,
    credentialRequest: {
      url,
      origin: credentialRequest?.origin || '',
      maskedUsername: credentialRequest?.maskedUsername || '',
    },
  };
}

function patchMessageById(messages, messageId, updater) {
  return messages.map((message) => (
    message.id === messageId
      ? updater(message)
      : message
  ));
}

function patchMessagesWithIngestItems(messages, refreshedItems, nextMessage) {
  if (!refreshedItems.length) return messages;
  const byId = new Map(refreshedItems.map((item) => [item.id, item]));

  return messages.map((message) => {
    const feedback = message.ingestFeedback;
    if (!feedback?.ingestItems?.some((item) => byId.has(item.id))) return message;

    return {
      ...message,
      ingestFeedback: {
        ...feedback,
        message: nextMessage || feedback.message,
        ingestItems: feedback.ingestItems.map((item) => byId.get(item.id) || item),
      },
    };
  });
}

function findIngestItem(messages, itemId) {
  for (const message of messages) {
    const found = message.ingestFeedback?.ingestItems?.find((item) => item.id === itemId);
    if (found) return found;
  }
  return null;
}

function extractFirstUrl(text) {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : '';
}

function parseConversationAction(text) {
  const url = extractFirstUrl(text);
  if (!url) return null;

  const wantsCapture = /(采集|抓取|入库|capture|crawl)/i.test(text);
  const wantsLogin = /(登录|login)/i.test(text);

  if (wantsLogin) {
    return {
      type: 'login_capture',
      url,
      focus: '正文、结构化要点、更新内容',
      note: text,
    };
  }

  if (wantsCapture) {
    return {
      type: 'capture_public',
      url,
      focus: '正文、结构化要点、更新内容',
      note: text,
    };
  }

  return null;
}

export default function HomePage() {
  const [messages, setMessages] = useState(initialMessages);
  const uploadInputRef = useRef(null);
  const [input, setInput] = useState('');
  const [activeScenario, setActiveScenario] = useState('technical');
  const [panel, setPanel] = useState(scenarios.technical || scenarios.default);
  const [sidebarSources, setSidebarSources] = useState(sourceItems);
  const [isLoading, setIsLoading] = useState(false);
  const [captureTasks, setCaptureTasks] = useState([]);
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

  async function runCaptureAction(action) {
    const response = await fetch(buildApiUrl('/api/web-captures'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: action.url,
        focus: action.focus,
        note: action.note,
        frequency: 'manual',
      }),
    });
    const raw = await response.text();
    let json = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = {};
    }
    if (!response.ok) throw new Error(json?.error || raw || 'create web capture failed');

    const feedback = {
      message: json?.message || '网页采集任务已创建。',
      summary: json?.summary,
      ingestItems: json?.ingestItems || [],
    };

    setSelectedManualLibraries((prev) => {
      const next = { ...prev };
      for (const item of feedback.ingestItems || []) next[item.id] = '';
      return next;
    });

    setMessages((prev) => [
      ...prev,
      buildIngestChatMessage({
        title: action.type === 'login_capture' ? '登录采集已转为正文采集' : '网页采集完成',
        content: action.type === 'login_capture'
          ? buildSummaryText(feedback, '已识别登录采集意图；当前先尝试按公开正文页面抓取并入库。')
          : buildSummaryText(feedback, '网页抓取、正文解析和入库反馈已返回。'),
        meta: action.url,
        feedback,
      }),
    ]);

    await Promise.all([loadCaptureTasks(), loadDatasources(), loadDocumentSnapshot()]);
  }

  async function runLoginCaptureAction(action, credentials) {
    const payload = {
      url: action.url,
      focus: action.focus,
      note: action.note,
      ...(credentials || {}),
    };

    const response = await fetch(buildApiUrl('/api/web-captures/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const raw = await response.text();
    let json = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = {};
    }
    if (!response.ok) throw new Error(json?.error || raw || 'login capture failed');

    if (json?.status === 'credential_required') {
      return {
        needsCredential: true,
        message: buildCredentialRequestMessage({
          url: action.url,
          credentialRequest: json?.credentialRequest,
        }),
      };
    }

    const feedback = {
      message: json?.message || '登录采集已完成，内容已结构化入库。',
      summary: json?.summary,
      ingestItems: json?.ingestItems || [],
    };

    setSelectedManualLibraries((prev) => {
      const next = { ...prev };
      for (const item of feedback.ingestItems || []) next[item.id] = '';
      return next;
    });

    await Promise.all([loadCaptureTasks(), loadDatasources(), loadDocumentSnapshot()]);

    return {
      needsCredential: false,
      message: buildIngestChatMessage({
        title: '登录采集完成',
        content: buildSummaryText(feedback, '登录后的正文内容已抓取、解析并入库。'),
        meta: json?.credentialSummary?.remembered
          ? `${action.url} · 已记住凭据`
          : action.url,
        feedback,
      }),
    };
  }

  async function runDocumentUpload(files) {
    if (!files.length || uploadLoading) return;

    setUploadLoading(true);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      formData.append('note', DEFAULT_UPLOAD_NOTE);

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
      const feedback = {
        message: json?.message || `已上传 ${json?.uploadedCount || files.length} 个文件。`,
        summary: json?.summary,
        ingestItems: json?.ingestItems || [],
      };
      const importantTitles = feedback.ingestItems
        .filter((item) => item.status === 'success')
        .map((item) => item.preview?.title)
        .filter(Boolean)
        .slice(0, 4);

      setSelectedManualLibraries((prev) => {
        const next = { ...prev };
        for (const item of feedback.ingestItems || []) next[item.id] = '';
        return next;
      });

      setMessages((prev) => [
        ...prev,
        buildIngestChatMessage({
          title: '资料上传完成',
          content: importantTitles.length
            ? `本次重点识别标题：${importantTitles.join('、')}${feedback.summary && feedback.summary.total > importantTitles.length ? ` 等 ${feedback.summary.total} 项。` : '。'}`
            : buildSummaryText(feedback, feedback.message),
          meta: feedback.summary
            ? `成功 ${feedback.summary.successCount} 项，失败 ${feedback.summary.failedCount} 项`
            : files.map((file) => file.name).join('，'),
          feedback,
        }),
      ]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文档上传失败';
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId('assistant'),
          role: 'assistant',
          title: '资料上传失败',
          content: errorMessage,
          meta: files.map((file) => file.name).join('，'),
        },
      ]);
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      setUploadLoading(false);
    }
  }

  const submitQuestion = async (value) => {
    const text = value.trim();
    if (!text || isLoading || uploadLoading) return;

    setMessages((prev) => [...prev, { id: createMessageId('user'), role: 'user', content: text }]);
    setInput('');

    const action = parseConversationAction(text);
    if (action) {
      setIsLoading(true);
      try {
        if (action.type === 'login_capture') {
          const result = await runLoginCaptureAction(action);
          setMessages((prev) => [...prev, result.message]);
        } else {
          await runCaptureAction(action);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '网页采集失败';
        setMessages((prev) => [
          ...prev,
          {
            id: createMessageId('assistant'),
            role: 'assistant',
            title: action.type === 'login_capture' ? '登录采集失败' : '网页采集失败',
            content: errorMessage,
            meta: action.url,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(buildApiUrl('/api/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
      });

      if (!response.ok) throw new Error('chat api failed');

      const data = await response.json();
      const normalized = normalizeChatResponse(data, scenarios.default);
      setMessages((prev) => [...prev, { ...normalized.message, id: createMessageId('assistant') }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId('assistant'),
          role: 'assistant',
          content: '当前对话接口暂时不可用，请稍后再试。',
          meta: '来源：chat API / 错误回退',
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

  const saveGroupsForIngestItem = async (itemId, groups) => {
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

      setMessages((prev) => patchMessagesWithIngestItems(prev, json?.ingestItems || [], json?.message));
      await loadDocumentSnapshot();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '保存知识库分组失败';
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId('assistant'),
          role: 'assistant',
          title: '知识库分组更新失败',
          content: errorMessage,
        },
      ]);
      return false;
    } finally {
      setGroupSaving(false);
    }
  };

  const acceptIngestGroupSuggestion = async (itemId) => {
    if (groupSaving) return;
    const current = findIngestItem(messages, itemId);
    const groups = (current?.groupSuggestion?.suggestedGroups || []).map((item) => item.key);
    if (!groups.length) return;
    await saveGroupsForIngestItem(itemId, groups);
  };

  const assignIngestToSelectedLibrary = async (itemId) => {
    if (groupSaving) return;

    const selectedLibraryKey = selectedManualLibraries[itemId];
    if (!selectedLibraryKey) return;

    const current = findIngestItem(messages, itemId);
    const existingGroups = current?.groupSuggestion?.suggestedGroups || [];
    const groups = Array.from(new Set([
      ...existingGroups.map((item) => item.key),
      selectedLibraryKey,
    ]));

    const saved = await saveGroupsForIngestItem(itemId, groups);
    if (saved) {
      setSelectedManualLibraries((prev) => ({ ...prev, [itemId]: '' }));
    }
  };

  const submitCredentialForMessage = async (messageId, credentials) => {
    const currentMessage = messages.find((message) => message.id === messageId);
    const request = currentMessage?.credentialRequest;
    if (!request?.url) return;

    const action = {
      type: 'login_capture',
      url: request.url,
      focus: '正文、结构化要点、更新内容',
      note: `登录采集 ${request.url}`,
    };

    setIsLoading(true);
    setMessages((prev) => patchMessageById(prev, messageId, (message) => ({
      ...message,
      content: '登录信息已安全提交，正在尝试登录并采集。',
      credentialRequest: null,
    })));

    try {
      const result = await runLoginCaptureAction(action, credentials);
      setMessages((prev) => [...prev, result.message]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '登录采集失败';
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId('assistant'),
          role: 'assistant',
          title: '登录采集失败',
          content: errorMessage,
          meta: request.url,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/" />

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>数据智能工作台</h2>
            <p>首页现在只保留一个对话入口：发问题、发链接采集、上传文件入库，反馈都会留在当前会话里。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" onClick={resetConversation}>新建会话</button>
            <button className="primary-btn" disabled>生成日报（待接实）</button>
          </div>
        </header>

        <section className="workbench-toolbar card">
          <div className="workbench-toolbar-label">业务类</div>
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
            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>网页采集任务</h3>
                  <p>已创建的网页采集任务会继续显示在这里，方便查看频次、状态和最近一次摘要。</p>
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
                    <div className="capture-task-note">直接在对话框里发送“采集 + 链接”，系统会尝试抓正文、分类并写入文档库。</div>
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
