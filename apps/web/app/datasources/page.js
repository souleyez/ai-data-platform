'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { appendSystemMemoryEntry } from '../lib/chat-memory';
import { sourceItems } from '../lib/mock-data';

const EMPTY_FORM = {
  id: '',
  name: '',
  kind: 'web_public',
  authMode: 'none',
  scheduleKind: 'manual',
  maxItemsPerRun: '20',
  runAfterSave: false,
  targetKeys: [],
  url: '',
  focus: '',
  notes: '',
  keywords: '',
  siteHints: '',
  credentialId: '',
  credentialLabel: '',
  credentialOrigin: '',
  credentialNotes: '',
  credentialUsername: '',
  credentialPassword: '',
  credentialToken: '',
  credentialConnectionString: '',
  credentialCookies: '',
  credentialHeaders: '',
};

const KIND_LABELS = {
  web_public: '公开网页',
  web_login: '登录网页',
  web_discovery: '关联发现',
  database: '数据库',
  erp: 'ERP后台',
  upload_public: '外部资料上传',
  local_directory: '本机目录',
};

const AUTH_LABELS = {
  none: '无需认证',
  credential: '账号密码',
  manual_session: '手动会话',
  database_password: '数据库认证',
  api_token: 'API Token',
};

const STATUS_LABELS = {
  active: '运行中',
  paused: '已暂停',
  draft: '草稿',
  error: '异常',
};

const RUN_STATUS_LABELS = {
  running: '执行中',
  success: '成功',
  partial: '部分完成',
  failed: '失败',
};

const SCHEDULE_LABELS = {
  manual: '手动',
  daily: '每日',
  weekly: '每周',
};

function formatDateTime(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatRelative(value) {
  if (!value) return '暂无';
  const delta = Date.now() - new Date(value).getTime();
  if (Number.isNaN(delta)) return String(value);
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  return `${days} 天前`;
}

function splitValues(value) {
  return String(value || '')
    .split(/[,\n，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseHeaders(value) {
  const lines = String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return Object.fromEntries(
    lines
      .map((line) => line.split(':'))
      .filter((parts) => parts.length >= 2)
      .map(([key, ...rest]) => [key.trim(), rest.join(':').trim()])
      .filter(([key, entry]) => key && entry),
  );
}

function toTargetKeyString(items) {
  return (items || []).map((item) => item.key).filter(Boolean);
}

function buildSidebarSources(managedItems, legacyItems) {
  const normalizedManaged = (managedItems || []).map((item) => ({
    name: item.name,
    status: item.status === 'active' ? 'success' : item.status === 'error' ? 'warning' : 'idle',
  }));
  if (normalizedManaged.length) return normalizedManaged;
  return sourceItems.concat(
    (legacyItems || []).slice(0, 4).map((item) => ({
      name: item.name,
      status: item.status === 'connected' ? 'success' : item.status === 'warning' ? 'warning' : 'idle',
    })),
  );
}

function buildFormFromDefinition(item) {
  const kind = item.kind || 'web_public';
  return {
    ...EMPTY_FORM,
    id: item.id || '',
    name: item.name || '',
    kind,
    authMode: kind === 'local_directory' ? 'none' : (item.authMode || 'none'),
    scheduleKind: item.schedule?.kind || 'manual',
    maxItemsPerRun: String(item.schedule?.maxItemsPerRun || 20),
    targetKeys: toTargetKeyString(item.targetLibraries),
    url: String(kind === 'local_directory' ? (item.config?.path || item.config?.url || '') : (item.config?.url || item.config?.baseUrl || '')),
    focus: String(item.config?.focus || ''),
    notes: String(item.notes || item.config?.notes || ''),
    keywords: Array.isArray(item.config?.keywords) ? item.config.keywords.join('，') : '',
    siteHints: Array.isArray(item.config?.siteHints) ? item.config.siteHints.join('，') : '',
    credentialId: String(item.credentialRef?.id || ''),
    credentialLabel: String(item.credentialRef?.label || ''),
    credentialOrigin: String(item.credentialRef?.origin || ''),
  };
}

function buildFormFromDraft(draft) {
  const kind = draft.kind || 'web_public';
  return {
    ...EMPTY_FORM,
    name: draft.name || '',
    kind,
    authMode: kind === 'local_directory' ? 'none' : (draft.authMode || 'none'),
    scheduleKind: draft.schedule?.kind || 'manual',
    maxItemsPerRun: String(draft.schedule?.maxItemsPerRun || 20),
    targetKeys: toTargetKeyString(draft.targetLibraries),
    url: String(kind === 'local_directory' ? (draft.config?.path || draft.config?.url || '') : (draft.config?.url || '')),
    focus: String(draft.config?.focus || ''),
    notes: String(draft.notes || draft.config?.notes || ''),
    keywords: Array.isArray(draft.config?.keywords) ? draft.config.keywords.join('，') : '',
    siteHints: Array.isArray(draft.config?.siteHints) ? draft.config.siteHints.join('，') : '',
  };
}

function buildCredentialSecret(form) {
  return {
    username: form.credentialUsername.trim(),
    password: form.credentialPassword.trim(),
    token: form.credentialToken.trim(),
    connectionString: form.credentialConnectionString.trim(),
    cookies: form.credentialCookies.trim(),
    headers: parseHeaders(form.credentialHeaders),
  };
}

function hasCredentialSecret(secret) {
  return Boolean(
    secret.username ||
      secret.password ||
      secret.token ||
      secret.connectionString ||
      secret.cookies ||
      (secret.headers && Object.keys(secret.headers).length),
  );
}

function rememberDatasourceFeedback(title, content, meta = '') {
  const combined = [title, content, meta].filter(Boolean).join('\n');
  const isFailure =
    /失败|异常|不可用|错误|超时/.test(combined) ||
    /failed|error|unavailable|timeout/i.test(combined);

  appendSystemMemoryEntry({
    title,
    content,
    meta,
    memoryContent: [title, content, meta ? `相关对象：${meta}` : ''].filter(Boolean).join('。'),
    messageType: isFailure ? 'system_failure' : 'system_feedback',
  });
}

function legacyCopyText(value) {
  if (typeof document === 'undefined') return false;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

async function copyText(value) {
  const text = String(value || '').trim();
  if (!text) return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy copy
    }
  }

  return legacyCopyText(text);
}

function StatCard({ label, value, subtle }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {subtle ? <div className="stat-trend neutral">{subtle}</div> : null}
    </div>
  );
}

function DatasourceTag({ children, tone = 'neutral-tag' }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}

function RequiredLabel({ children }) {
  return (
    <span>
      {children}
      <span style={{ color: '#b42318', marginLeft: 4 }}>*</span>
    </span>
  );
}

function buildRunResultItems(run) {
  if (run?.documentSummaries?.length) return run.documentSummaries;
  if (run?.documentLabels?.length) {
    return run.documentLabels.map((label, index) => ({
      id: `${run.id || 'run'}-label-${index}`,
      label,
      summary: '',
    }));
  }
  return [];
}

export default function DatasourcesPage() {
  const [legacyData, setLegacyData] = useState(null);
  const [managed, setManaged] = useState([]);
  const [managedMeta, setManagedMeta] = useState({ total: 0, active: 0, paused: 0, errors: 0, latestRunAt: '' });
  const [definitions, setDefinitions] = useState([]);
  const [runs, setRuns] = useState([]);
  const [libraries, setLibraries] = useState([]);
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [planPrompt, setPlanPrompt] = useState('');
  const [planning, setPlanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const syncedMessageRef = useRef('');
  const syncedErrorRef = useRef('');

  async function load() {
    const [legacyResponse, managedResponse, definitionsResponse, runsResponse, overviewResponse, credentialsResponse] = await Promise.all([
      fetch(buildApiUrl('/api/datasources'), { cache: 'no-store' }),
      fetch(buildApiUrl('/api/datasources/managed'), { cache: 'no-store' }),
      fetch(buildApiUrl('/api/datasources/definitions'), { cache: 'no-store' }),
      fetch(buildApiUrl('/api/datasources/runs'), { cache: 'no-store' }),
      fetch(buildApiUrl('/api/documents-overview'), { cache: 'no-store' }),
      fetch(buildApiUrl('/api/datasources/credentials'), { cache: 'no-store' }),
    ]);

    if (!legacyResponse.ok || !managedResponse.ok || !definitionsResponse.ok || !runsResponse.ok || !overviewResponse.ok || !credentialsResponse.ok) {
      throw new Error('数据源工作台加载失败');
    }

    const [legacyJson, managedJson, definitionsJson, runsJson, overviewJson, credentialsJson] = await Promise.all([
      legacyResponse.json(),
      managedResponse.json(),
      definitionsResponse.json(),
      runsResponse.json(),
      overviewResponse.json(),
      credentialsResponse.json(),
    ]);

    setLegacyData(legacyJson);
    setManaged(Array.isArray(managedJson.items) ? managedJson.items : []);
    setManagedMeta(managedJson.meta || { total: 0, active: 0, paused: 0, errors: 0, latestRunAt: '' });
    setDefinitions(Array.isArray(definitionsJson.items) ? definitionsJson.items : []);
    setRuns(Array.isArray(runsJson.items) ? runsJson.items : []);
    setLibraries(Array.isArray(overviewJson.libraries) ? overviewJson.libraries : []);
    setCredentials(Array.isArray(credentialsJson.items) ? credentialsJson.items : []);
  }

  useEffect(() => {
    let alive = true;
    async function bootstrap(showLoading) {
      try {
        if (alive) setError('');
        if (alive && showLoading) setLoading(true);
        await load();
      } catch (loadError) {
        if (!alive) return;
        setError(loadError instanceof Error ? loadError.message : '数据源工作台加载失败');
      } finally {
        if (alive && showLoading) setLoading(false);
      }
    }

    bootstrap(true);
    const timer = setInterval(() => {
      bootstrap(false);
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const text = String(message || '').trim();
    if (!text || syncedMessageRef.current === text) return;
    syncedMessageRef.current = text;
    rememberDatasourceFeedback('数据源系统反馈', text, form.name || planPrompt || '数据源工作台');
  }, [form.name, message, planPrompt]);

  useEffect(() => {
    const text = String(error || '').trim();
    if (!text || syncedErrorRef.current === text) return;
    syncedErrorRef.current = text;
    rememberDatasourceFeedback('数据源系统异常', text, form.name || planPrompt || '数据源工作台');
  }, [error, form.name, planPrompt]);

  const definitionMap = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const presetCatalog = legacyData?.presetCatalog || [];
  const sidebarSources = useMemo(() => buildSidebarSources(managed, legacyData?.items || []), [legacyData, managed]);
  const recentRuns = useMemo(() => runs.slice(0, 10), [runs]);
  const isLocalDirectory = form.kind === 'local_directory';

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleCopyPublicPath(item) {
    const publicPath = String(item?.publicPath || '').trim();
    if (!publicPath) return;
    const url = `${window.location.origin}${publicPath}`;
    try {
      const copied = await copyText(url);
      if (!copied) {
        throw new Error('copy_failed');
      }
      setMessage(`已复制外部上传链接：${item.name}`);
      rememberDatasourceFeedback('外部上传链接已复制', `${item.name} 的外部上传链接已复制，可直接发给外部用户提交资料。`, item.name);
    } catch {
      setError('复制外部上传链接失败，请手动复制。');
    }
  }

  function toggleTargetLibrary(key) {
    setForm((current) => ({
      ...current,
      targetKeys: current.targetKeys.includes(key)
        ? current.targetKeys.filter((item) => item !== key)
        : [...current.targetKeys, key],
    }));
  }

  function resetComposer() {
    setPlanPrompt('');
    setForm(EMPTY_FORM);
    setError('');
    setMessage('');
  }

  function applyPreset(preset) {
    const presetLibraries = Array.isArray(preset.suggestedLibraries) ? preset.suggestedLibraries.map((item) => item.key) : [];
    setForm({
      ...EMPTY_FORM,
      name: preset.name,
      kind: preset.kind,
      authMode: preset.authMode || 'none',
      scheduleKind: 'weekly',
      maxItemsPerRun: String(preset.config?.maxItemsPerRun || 20),
      targetKeys: presetLibraries,
      url: preset.baseUrl || '',
      focus: preset.focus || '',
      notes: preset.description || '',
      siteHints: preset.name || '',
    });
    setPlanPrompt(`请围绕 ${preset.name} 建立持续采集任务，重点采集 ${preset.focus || preset.name}，并优先落到对应知识库。`);
    setMessage(`已将 ${preset.name} 的预置配置填入工作栏，你可以直接保存，也可以继续补充采集范围与认证信息。`);
  }

  async function createOrReuseCredential(currentForm) {
    if (currentForm.authMode === 'none') return null;

    if (currentForm.credentialId) {
      const existing = credentials.find((item) => item.id === currentForm.credentialId);
      return existing
        ? {
            id: existing.id,
            kind: existing.kind,
            label: existing.label,
            origin: existing.origin || '',
            updatedAt: existing.updatedAt,
          }
        : null;
    }

    const secret = buildCredentialSecret(currentForm);
    const shouldSave = hasCredentialSecret(secret) || currentForm.credentialLabel.trim() || currentForm.credentialOrigin.trim();
    if (!shouldSave) return null;

    const response = await fetch(buildApiUrl('/api/datasources/credentials'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: currentForm.credentialLabel.trim() || `${currentForm.name.trim() || '数据源'}凭据`,
        kind: currentForm.authMode,
        origin: currentForm.credentialOrigin.trim() || 'manual',
        notes: currentForm.credentialNotes.trim(),
        secret,
      }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error || '保存凭据失败');
    const item = json?.item;
    if (!item?.id) throw new Error('保存凭据失败');
    return { id: item.id, kind: item.kind, label: item.label, origin: item.origin || '', updatedAt: item.updatedAt };
  }

  function buildDatasourcePayload(currentForm, credentialRef) {
    const libraryMap = new Map((libraries || []).map((item) => [item.key, item]));
    const targetLibraries = (currentForm.targetKeys || [])
      .map((key, index) => {
        const library = libraryMap.get(key);
        if (!library) return null;
        return {
          key: library.key,
          label: library.label,
          mode: index === 0 ? 'primary' : 'secondary',
        };
      })
      .filter(Boolean);

    const baseConfig = currentForm.kind === 'local_directory'
      ? {
          path: currentForm.url.trim(),
          notes: currentForm.notes.trim(),
        }
      : {
          url: currentForm.url.trim(),
          focus: currentForm.focus.trim(),
          notes: currentForm.notes.trim(),
          keywords: splitValues(currentForm.keywords),
          siteHints: splitValues(currentForm.siteHints),
        };

    return {
      id: currentForm.id || undefined,
      name: currentForm.name.trim(),
      kind: currentForm.kind,
      status: currentForm.id ? definitionMap.get(currentForm.id)?.status || 'draft' : 'draft',
      authMode: currentForm.kind === 'local_directory' ? 'none' : currentForm.authMode,
      targetLibraries,
      schedule: {
        kind: currentForm.scheduleKind,
        timezone: 'Asia/Shanghai',
        maxItemsPerRun: Number(currentForm.maxItemsPerRun || 20) || 20,
      },
      credentialRef,
      config: baseConfig,
      notes: currentForm.notes.trim(),
    };
  }

  async function persistDefinitionWithForm(nextForm = form) {
    const credentialRef = await createOrReuseCredential(nextForm);
    const payload = buildDatasourcePayload(nextForm, credentialRef);
    if (!payload.name) throw new Error('请填写数据源名称');
    if (!payload.targetLibraries.length) throw new Error('请至少选择一个目标知识库');

    const isEditing = Boolean(nextForm.id);
    const url = isEditing
      ? buildApiUrl(`/api/datasources/definitions/${encodeURIComponent(nextForm.id)}`)
      : buildApiUrl('/api/datasources/definitions');
    const method = isEditing ? 'PATCH' : 'POST';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error || '保存数据源失败');

    await load();
    if (json?.item) setForm(buildFormFromDefinition(json.item));
    return json;
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError('');
      setMessage('');
      const json = await persistDefinitionWithForm(form);
      const nextMessage = form.id ? `已更新数据源：${json.item?.name || form.name}` : `已创建数据源：${json.item?.name || form.name}`;
      setMessage(nextMessage);
      rememberDatasourceFeedback(
        form.id ? '数据源已更新' : '数据源已创建',
        `${json.item?.name || form.name} 已保存，目标知识库：${(json.item?.targetLibraries || []).map((entry) => entry.label).join('、') || '未绑定'}`,
        json.item?.kind || form.kind,
      );
      if (form.kind === 'local_directory' && form.runAfterSave && json?.item?.id) {
        await handleManagedAction(json.item, 'run');
      }
    } catch (saveError) {
      const nextError = saveError instanceof Error ? saveError.message : '保存数据源失败';
      setError(nextError);
      rememberDatasourceFeedback('数据源保存失败', nextError, form.name || form.url || '');
    } finally {
      setSaving(false);
    }
  }

  async function planOnce() {
    const response = await fetch(buildApiUrl('/api/datasources/plan'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: planPrompt }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error || '采集需求整理失败');
    return json;
  }

  async function handlePlan() {
    if (!planPrompt.trim()) {
      setError('请先输入采集需求。');
      return;
    }
    try {
      setPlanning(true);
      setError('');
      setMessage('');
      const json = await planOnce();
      setForm(buildFormFromDraft(json.draft || {}));
      const nextMessage = json?.draft?.explanation || '已整理出一份数据源草案，你可以继续修改后保存。';
      setMessage(nextMessage);
      rememberDatasourceFeedback('采集需求已整理', nextMessage, planPrompt);
    } catch (planError) {
      const nextError = planError instanceof Error ? planError.message : '采集需求整理失败';
      setError(nextError);
      rememberDatasourceFeedback('采集需求整理失败', nextError, planPrompt);
    } finally {
      setPlanning(false);
    }
  }

  async function handlePlanAndSave() {
    if (!planPrompt.trim()) {
      setError('请先输入采集需求。');
      return;
    }

    try {
      setPlanning(true);
      setSaving(true);
      setError('');
      setMessage('');
      const json = await planOnce();
      const nextForm = buildFormFromDraft(json.draft || {});
      const saved = await persistDefinitionWithForm(nextForm);
      const nextMessage = `已整理并保存数据源：${saved?.item?.name || nextForm.name || '未命名数据源'}`;
      setMessage(nextMessage);
      rememberDatasourceFeedback(
        '采集需求已整理并保存',
        `${saved?.item?.name || nextForm.name || '未命名数据源'} 已保存到数据源工作台，目标知识库：${(saved?.item?.targetLibraries || []).map((entry) => entry.label).join('、') || '未绑定'}`,
        saved?.item?.kind || nextForm.kind,
      );
    } catch (planError) {
      const nextError = planError instanceof Error ? planError.message : '采集需求整理失败';
      setError(nextError);
      rememberDatasourceFeedback('采集需求整理或保存失败', nextError, planPrompt);
    } finally {
      setPlanning(false);
      setSaving(false);
    }
  }

  async function handleManagedAction(item, action) {
    const urlMap = {
      run: `/api/datasources/definitions/${encodeURIComponent(item.id)}/run`,
      activate: `/api/datasources/definitions/${encodeURIComponent(item.id)}/activate`,
      pause: `/api/datasources/definitions/${encodeURIComponent(item.id)}/pause`,
      delete: `/api/datasources/definitions/${encodeURIComponent(item.id)}`,
    };

    try {
      setBusyId(`${item.id}:${action}`);
      setError('');
      setMessage('');
      const response = await fetch(buildApiUrl(urlMap[action]), {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'delete' ? undefined : '{}',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || '数据源操作失败');
      await load();

      const nextMessage =
        action === 'run'
          ? `已触发采集：${item.name}`
          : action === 'activate'
            ? `已启用数据源：${item.name}`
            : action === 'pause'
              ? `已暂停数据源：${item.name}`
              : `已删除数据源：${item.name}`;
      setMessage(nextMessage);
      rememberDatasourceFeedback('数据源状态更新', nextMessage, item.name);
      if (action === 'delete') resetComposer();
    } catch (actionError) {
      const nextError = actionError instanceof Error ? actionError.message : '数据源操作失败';
      setError(nextError);
      rememberDatasourceFeedback('数据源操作失败', nextError, item.name);
    } finally {
      setBusyId('');
    }
  }

  async function handleDeleteCredential(id) {
    try {
      setBusyId(`credential:${id}`);
      setError('');
      setMessage('');
      const response = await fetch(buildApiUrl(`/api/datasources/credentials/${encodeURIComponent(id)}`), {
        method: 'DELETE',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || '删除凭据失败');
      await load();
      setMessage(`已删除凭据：${json?.item?.label || id}`);
      rememberDatasourceFeedback('数据源凭据已删除', `${json?.item?.label || id} 已从凭据库移除。`, id);
      if (form.credentialId === id) {
        updateForm({
          credentialId: '',
          credentialLabel: '',
          credentialOrigin: '',
        });
      }
    } catch (deleteError) {
      const nextError = deleteError instanceof Error ? deleteError.message : '删除凭据失败';
      setError(nextError);
      rememberDatasourceFeedback('数据源凭据删除失败', nextError, id);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <div className="topbar">
          <div>
            <div className="topbar-title-row">
              <h2>数据源工作台</h2>
              <span className="topbar-inline-note">
                统一管理公开网页、登录网页、数据库和 ERP 采集任务，结果自动落到指定知识库并走后台深度解析。
              </span>
            </div>
            <p>先用自然语言整理采集需求，再确认目标知识库、认证信息和执行频率。采集状态、运行记录和最近入库成果会持续沉淀在这里。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" type="button" onClick={resetComposer}>清空工作栏</button>
          </div>
        </div>

        {message ? <div className="datasource-message datasource-success">{message}</div> : null}
        {error ? <div className="datasource-message datasource-error">{error}</div> : null}

        {loading ? (
          <section className="card documents-card">
            <div className="loading-bubble">
              <span className="loading-dot"></span>
              <span className="loading-dot"></span>
              <span className="loading-dot"></span>
            </div>
          </section>
        ) : (
          <section className="documents-layout">
            <section className="documents-grid two-columns datasource-workbench-grid">
              {false ? <section className="card documents-card datasource-hero-card">
                <div className="panel-header">
                  <div>
                    <h3>自然语言整理采集需求</h3>
                    <p>直接输入采集目标、站点、认证方式、目标知识库和采集频率，系统会先整理出草案，再由你修改后保存。</p>
                  </div>
                  <DatasourceTag>{managedMeta.active || 0} 个运行中</DatasourceTag>
                </div>
                <textarea
                  className="datasource-plan-input"
                  rows={5}
                  value={planPrompt}
                  onChange={(event) => setPlanPrompt(event.target.value)}
                  placeholder="例如：每周抓取中国政府采购网里和医疗设备相关的招标公告，落到 bids 知识库。"
                />
                <div className="datasource-inline-actions">
                  <button className="primary-btn" type="button" disabled={planning} onClick={handlePlan}>
                    {planning ? '整理中...' : '整理草案'}
                  </button>
                  <button className="ghost-btn" type="button" disabled={planning || saving} onClick={handlePlanAndSave}>
                    {planning || saving ? '处理中...' : '整理并保存'}
                  </button>
                  <span className="datasource-inline-note">整理结果会自动回填到下面的配置工作栏，不会影响文档中心打开速度。</span>
                </div>
              </section> : null}

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>{form.id ? '编辑数据源' : '新建数据源'}</h3>
                    <p>在一个工作栏里完成数据源配置、知识库绑定、认证和采集频率设置。</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {form.id ? <DatasourceTag tone="success-tag">编辑中</DatasourceTag> : null}
                    <button className="primary-btn" type="button" disabled={saving} onClick={handleSave}>
                      {saving ? '保存中...' : form.id ? '保存更新' : '创建数据源'}
                    </button>
                  </div>
                </div>

                <div className="datasource-form-grid">
                  <label className="datasource-field">
                    <RequiredLabel>数据源名称</RequiredLabel>
                    <input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="例如：政府采购医疗设备公告" />
                  </label>
                  <label className="datasource-field">
                    <RequiredLabel>数据源类型</RequiredLabel>
                    <select
                      value={form.kind}
                      onChange={(event) => {
                        const nextKind = event.target.value;
                        updateForm({
                          kind: nextKind,
                          authMode: nextKind === 'local_directory' ? 'none' : form.authMode,
                        });
                      }}
                    >
                      {Object.entries(KIND_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  {!isLocalDirectory ? (
                    <label className="datasource-field">
                      <span>认证方式</span>
                      <select value={form.authMode} onChange={(event) => updateForm({ authMode: event.target.value })}>
                        {Object.entries(AUTH_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label className="datasource-field">
                    <span>采集频率</span>
                    <select value={form.scheduleKind} onChange={(event) => updateForm({ scheduleKind: event.target.value })}>
                      {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="datasource-field datasource-field-span">
                    <span>{isLocalDirectory ? '目录路径' : '入口地址 / 连接地址'}</span>
                    <input
                      value={form.url}
                      onChange={(event) => updateForm({ url: event.target.value })}
                      placeholder={isLocalDirectory ? '例如：C:\\data\\knowledge' : 'https://example.com 或 postgres://...'}
                    />
                  </label>
                  {!isLocalDirectory ? (
                    <label className="datasource-field datasource-field-span">
                      <span>采集重点</span>
                      <input value={form.focus} onChange={(event) => updateForm({ focus: event.target.value })} placeholder="例如：招标公告、订单、客诉、IOT 方案、论文全文" />
                    </label>
                  ) : null}
                  {!isLocalDirectory ? (
                    <label className="datasource-field datasource-field-span">
                      <span>关键词</span>
                      <input value={form.keywords} onChange={(event) => updateForm({ keywords: event.target.value })} placeholder="用逗号分隔，例如：医疗设备，体外诊断" />
                    </label>
                  ) : null}
                  {!isLocalDirectory ? (
                    <label className="datasource-field datasource-field-span">
                      <span>站点提示 / 表名 / 模块提示</span>
                      <input value={form.siteHints} onChange={(event) => updateForm({ siteHints: event.target.value })} placeholder="例如：listing-detail，orders，complaints，inventory" />
                    </label>
                  ) : null}
                  <label className="datasource-field">
                    <span>每次最大条数</span>
                    <input value={form.maxItemsPerRun} onChange={(event) => updateForm({ maxItemsPerRun: event.target.value })} />
                  </label>
                  {isLocalDirectory ? (
                    <label className="datasource-field">
                      <span>保存后立即运行</span>
                      <div className="datasource-inline-checkbox">
                        <input
                          type="checkbox"
                          checked={Boolean(form.runAfterSave)}
                          onChange={(event) => updateForm({ runAfterSave: event.target.checked })}
                        />
                        <span>保存后立即执行一次扫描</span>
                      </div>
                    </label>
                  ) : null}
                  <label className="datasource-field datasource-field-span">
                    <span>备注</span>
                    <textarea rows={3} value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} placeholder="补充抓取范围、排除规则、更新时间要求等。" />
                  </label>
                </div>

                <div className="panel-header" style={{ marginTop: 20 }}>
                  <div>
                    <h3><RequiredLabel>目标知识库</RequiredLabel></h3>
                    <p>采集结果会直接进入选中的知识库，并自动进入日常后台深度解析线。</p>
                  </div>
                </div>
                <div className="datasource-library-grid">
                  {libraries.map((library) => {
                    const selected = form.targetKeys.includes(library.key);
                    return (
                      <button
                        key={library.key}
                        type="button"
                        className={`datasource-library-chip ${selected ? 'active' : ''}`}
                        onClick={() => toggleTargetLibrary(library.key)}
                      >
                        <span>{library.label}</span>
                        <span>{library.documentCount || 0} 份</span>
                      </button>
                    );
                  })}
                </div>

                {!isLocalDirectory ? (
                  <>
                    <div className="panel-header" style={{ marginTop: 20 }}>
                      <div>
                        <h3>认证与凭据</h3>
                        <p>可直接引用已保存凭据，也可以在这里录入新凭据。页面只显示元信息，不回显敏感内容。</p>
                      </div>
                    </div>
                    <div className="datasource-form-grid">
                      <label className="datasource-field">
                        <span>已保存凭据</span>
                        <select value={form.credentialId} onChange={(event) => updateForm({ credentialId: event.target.value })}>
                          <option value="">不使用已保存凭据</option>
                          {credentials.map((credential) => (
                            <option key={credential.id} value={credential.id}>{credential.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="datasource-field">
                        <span>新凭据名称</span>
                        <input value={form.credentialLabel} onChange={(event) => updateForm({ credentialLabel: event.target.value })} placeholder="例如：政府采购登录账号" />
                      </label>
                      <label className="datasource-field">
                        <span>凭据来源</span>
                        <input value={form.credentialOrigin} onChange={(event) => updateForm({ credentialOrigin: event.target.value })} placeholder="例如：manual / browser / db" />
                      </label>
                      <label className="datasource-field datasource-field-span">
                        <span>凭据备注</span>
                        <input value={form.credentialNotes} onChange={(event) => updateForm({ credentialNotes: event.target.value })} placeholder="例如：只读账号，仅用于订单与客诉采集" />
                      </label>
                      <label className="datasource-field">
                        <span>用户名</span>
                        <input value={form.credentialUsername} onChange={(event) => updateForm({ credentialUsername: event.target.value })} />
                      </label>
                      <label className="datasource-field">
                        <span>密码</span>
                        <input type="password" value={form.credentialPassword} onChange={(event) => updateForm({ credentialPassword: event.target.value })} />
                      </label>
                      <label className="datasource-field">
                        <span>API Token</span>
                        <input value={form.credentialToken} onChange={(event) => updateForm({ credentialToken: event.target.value })} />
                      </label>
                      <label className="datasource-field">
                        <span>数据库连接串</span>
                        <input value={form.credentialConnectionString} onChange={(event) => updateForm({ credentialConnectionString: event.target.value })} />
                      </label>
                      <label className="datasource-field datasource-field-span">
                        <span>Cookies</span>
                        <textarea rows={3} value={form.credentialCookies} onChange={(event) => updateForm({ credentialCookies: event.target.value })} />
                      </label>
                      <label className="datasource-field datasource-field-span">
                        <span>Headers</span>
                        <textarea rows={3} value={form.credentialHeaders} onChange={(event) => updateForm({ credentialHeaders: event.target.value })} placeholder="一行一个 Header，例如：Authorization: Bearer xxx" />
                      </label>
                    </div>
                  </>
                ) : null}

                <div className="datasource-inline-actions" style={{ marginTop: 20 }}>
                  <button className="primary-btn" type="button" disabled={saving} onClick={handleSave}>
                    {saving ? '保存中...' : form.id ? '保存更新' : '创建数据源'}
                  </button>
                  {form.id ? (
                    <button className="ghost-btn" type="button" onClick={() => setForm(EMPTY_FORM)}>
                      新建另一条
                    </button>
                  ) : null}
                  <span className="datasource-inline-note">
                    当前会优先保留文档中心性能，采集与深度解析继续走后台任务。
                  </span>
                </div>
              </section>

              {false ? <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>已保存凭据</h3>
                    <p>只显示元信息和密钥提示，方便复用而不暴露敏感内容。</p>
                  </div>
                </div>
                {credentials.length ? (
                  <div className="datasource-managed-list">
                    {credentials.map((credential) => (
                      <article key={credential.id} className="datasource-managed-card">
                        <div className="datasource-managed-head">
                          <div className="datasource-managed-info">
                            <strong>{credential.label}</strong>
                            <div className="datasource-managed-meta">
                              <span>{AUTH_LABELS[credential.kind] || credential.kind}</span>
                              <span>{credential.origin || 'manual'}</span>
                              <span>更新于 {formatDateTime(credential.updatedAt)}</span>
                            </div>
                            <div className="datasource-managed-meta">
                              <span>密钥内容：{credential.secretHints?.join(' / ') || '无'}</span>
                            </div>
                          </div>
                          <div className="datasource-managed-actions">
                            <button
                              className="ghost-btn"
                              type="button"
                              disabled={busyId === `credential:${credential.id}`}
                              onClick={() => updateForm({
                                credentialId: credential.id,
                                credentialLabel: credential.label,
                                credentialOrigin: credential.origin || '',
                              })}
                            >
                              选用
                            </button>
                            <button
                              className="ghost-btn"
                              type="button"
                              disabled={busyId === `credential:${credential.id}`}
                              onClick={() => handleDeleteCredential(credential.id)}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="report-empty-card">还没有保存凭据。你可以在工作栏里录入认证信息并保存。</div>
                )}
                {form.credentialId ? (
                  <div className="datasource-inline-note" style={{ marginTop: 12 }}>
                    当前已选凭据：{credentials.find((item) => item.id === form.credentialId)?.label || form.credentialId}
                  </div>
                ) : null}
              </section> : null}

              {false ? <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>预置站点</h3>
                    <p>快速套用公开招投标和国际公开学术站点，减少手工配置成本。</p>
                  </div>
                </div>
                <div className="datasource-preset-list">
                  {presetCatalog.map((preset) => (
                    <article key={preset.id} className="datasource-preset-card">
                      <div className="datasource-managed-head">
                        <div className="datasource-managed-info">
                          <strong>{preset.name}</strong>
                          <div className="datasource-preset-meta">
                            <span>{KIND_LABELS[preset.kind] || preset.kind}</span>
                            <span>{preset.authority}</span>
                            <span>{preset.baseUrl}</span>
                          </div>
                          <p>{preset.description}</p>
                        </div>
                        <button className="ghost-btn" type="button" onClick={() => applyPreset(preset)}>套用</button>
                      </div>
                      <div className="datasource-preset-foot">
                        <span>重点：{preset.focus}</span>
                        <span>推荐知识库：{(preset.suggestedLibraries || []).map((item) => item.label).join('、') || '未指定'}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section> : null}

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>已管理数据源</h3>
                    <p>在同一列表里查看状态、知识库归属、最近运行和直接操作。</p>
                  </div>
                </div>
                {managed.length ? (
                  <div className="datasource-managed-list">
                    {managed.map((item) => (
                      <article key={item.id} className="datasource-managed-card">
                        <div className="datasource-managed-head">
                          <div className="datasource-managed-info">
                            <strong>{item.name}</strong>
                            <div className="datasource-managed-meta">
                              <span>{KIND_LABELS[item.kind] || item.kind}</span>
                              <span>{STATUS_LABELS[item.status] || item.status}</span>
                              <span>{item.scheduleLabel || SCHEDULE_LABELS[item.schedule?.kind] || '手动'}</span>
                            </div>
                            <div className="datasource-managed-meta">
                              <span>知识库：{(item.targetLibraries || []).map((entry) => entry.label).join('、') || '未绑定'}</span>
                              <span>最近：{formatRelative(item.lastRunAt)}</span>
                            </div>
                            {item.lastSummary ? <p>{item.lastSummary}</p> : null}
                          </div>
                          <div className="datasource-managed-actions">
                            <button className="ghost-btn" type="button" onClick={() => setForm(buildFormFromDefinition(definitionMap.get(item.id) || item))}>编辑</button>
                            {item.publicPath ? (
                              <button className="ghost-btn" type="button" onClick={() => handleCopyPublicPath(item)}>复制外链</button>
                            ) : (
                              <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:run`} onClick={() => handleManagedAction(item, 'run')}>立即采集</button>
                            )}
                            {item.status === 'active' ? (
                              <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:pause`} onClick={() => handleManagedAction(item, 'pause')}>暂停</button>
                            ) : (
                              <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:activate`} onClick={() => handleManagedAction(item, 'activate')}>启用</button>
                            )}
                            <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:delete`} onClick={() => handleManagedAction(item, 'delete')}>删除</button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="report-empty-card">还没有已管理数据源。你可以先通过上面的自然语言描述整理一条采集需求。</div>
                )}
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>最近运行记录</h3>
                    <p>查看执行状态、采集数量、落库结果和最近入库成果摘要。</p>
                  </div>
                </div>
                {recentRuns.length ? (
                  <div className="datasource-run-list">
                    {recentRuns.map((run) => (
                      <article key={run.id} className="datasource-run-card">
                        <div className="datasource-run-head">
                          <strong>{run.datasourceName || run.datasourceId}</strong>
                          <DatasourceTag tone={run.status === 'success' ? 'success-tag' : run.status === 'failed' ? 'danger-tag' : 'neutral-tag'}>
                            {RUN_STATUS_LABELS[run.status] || run.status}
                          </DatasourceTag>
                        </div>
                        <div className="datasource-managed-meta">
                          <span>开始：{formatDateTime(run.startedAt)}</span>
                          <span>结束：{formatDateTime(run.finishedAt)}</span>
                          <span>知识库：{(run.libraryLabels || []).join('、') || '未绑定'}</span>
                        </div>
                        <div className="datasource-managed-meta">
                          <span>发现 {run.discoveredCount || 0}</span>
                          <span>采集 {run.capturedCount || 0}</span>
                          <span>入库 {run.ingestedCount || 0}</span>
                        </div>
                        {run.summary ? <div className="datasource-run-summary">{run.summary}</div> : null}
                        {buildRunResultItems(run).length ? (
                          <div className="capture-result-list">
                            {buildRunResultItems(run).map((doc) => (
                              <div key={doc.id} className="capture-result-item">
                                <strong>{doc.label}</strong>
                                {doc.summary ? <p>{doc.summary}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                        {run.errorMessage ? <div className="datasource-run-error">{run.errorMessage}</div> : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="report-empty-card">还没有运行记录。保存一条数据源后即可触发采集并在这里查看结果。</div>
                )}
              </section>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
