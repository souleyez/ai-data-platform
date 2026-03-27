'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { sourceItems } from '../lib/mock-data';

const EMPTY_FORM = {
  id: '',
  name: '',
  kind: 'web_public',
  authMode: 'none',
  scheduleKind: 'manual',
  maxItemsPerRun: '20',
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
};

const AUTH_LABELS = {
  none: '无需认证',
  credential: '账号密码',
  manual_session: '手动会话',
  database_password: '数据库认证',
  api_token: 'API Token',
};

const STATUS_LABELS = { active: '运行中', paused: '已暂停', draft: '草稿', error: '异常' };
const RUN_STATUS_LABELS = { running: '执行中', success: '成功', partial: '部分完成', failed: '失败' };
const SCHEDULE_LABELS = { manual: '手动', daily: '每日', weekly: '每周' };

function formatDateTime(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
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
  if (Number.isNaN(delta)) return value;
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
    .map((entry) => entry.trim())
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
  return normalizedManaged.length
    ? normalizedManaged
    : sourceItems.concat(
        (legacyItems || []).slice(0, 4).map((item) => ({
          name: item.name,
          status: item.status === 'connected' ? 'success' : item.status === 'warning' ? 'warning' : 'idle',
        })),
      );
}

function buildFormFromDefinition(item) {
  return {
    ...EMPTY_FORM,
    id: item.id || '',
    name: item.name || '',
    kind: item.kind || 'web_public',
    authMode: item.authMode || 'none',
    scheduleKind: item.schedule?.kind || item.schedule || 'manual',
    maxItemsPerRun: String(item.schedule?.maxItemsPerRun || 20),
    targetKeys: toTargetKeyString(item.targetLibraries),
    url: String(item.config?.url || item.config?.baseUrl || ''),
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
  return {
    ...EMPTY_FORM,
    name: draft.name || '',
    kind: draft.kind || 'web_public',
    authMode: draft.authMode || 'none',
    scheduleKind: draft.schedule?.kind || 'manual',
    maxItemsPerRun: String(draft.schedule?.maxItemsPerRun || 20),
    targetKeys: toTargetKeyString(draft.targetLibraries),
    url: String(draft.config?.url || ''),
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

export default function DatasourcesPage() {
  const [legacyData, setLegacyData] = useState(null);
  const [managed, setManaged] = useState([]);
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

  async function load() {
    setError('');
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
    setDefinitions(Array.isArray(definitionsJson.items) ? definitionsJson.items : []);
    setRuns(Array.isArray(runsJson.items) ? runsJson.items : []);
    setLibraries(Array.isArray(overviewJson.libraries) ? overviewJson.libraries : []);
    setCredentials(Array.isArray(credentialsJson.items) ? credentialsJson.items : []);
  }

  useEffect(() => {
    let alive = true;
    async function bootstrap() {
      try {
        setLoading(true);
        await load();
      } catch (loadError) {
        if (!alive) return;
        setError(loadError instanceof Error ? loadError.message : '数据源工作台加载失败');
      } finally {
        if (alive) setLoading(false);
      }
    }

    bootstrap();
    const timer = setInterval(() => {
      bootstrap();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const sidebarSources = useMemo(() => buildSidebarSources(managed, legacyData?.items || []), [legacyData, managed]);
  const presetCatalog = legacyData?.presetCatalog || [];
  const providerMeta = legacyData?.providerMeta || { total: 0, active: 0, paused: 0, errors: 0, latestRunAt: '' };
  const recentRuns = runs.slice(0, 8);
  const definitionMap = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const selectedCredential = credentials.find((item) => item.id === form.credentialId) || null;

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
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
    setForm(EMPTY_FORM);
    setPlanPrompt('');
    setMessage('');
    setError('');
  }

  function applyPreset(preset) {
    const presetLibraries = Array.isArray(preset.suggestedLibraries) ? preset.suggestedLibraries.map((item) => item.key) : [];
    setForm({
      ...EMPTY_FORM,
      name: preset.name,
      kind: preset.kind,
      authMode: preset.authMode,
      scheduleKind: 'weekly',
      maxItemsPerRun: String(preset.config?.maxItemsPerRun || 20),
      targetKeys: presetLibraries,
      url: preset.baseUrl || '',
      focus: preset.focus || '',
      notes: preset.description || '',
      siteHints: preset.name,
    });
    setPlanPrompt(`请围绕 ${preset.name} 建立一个持续采集任务，优先采集 ${preset.focus}`);
    setMessage(`已把 ${preset.name} 预置站点填入工作栏，可继续编辑后保存。`);
  }

  async function createOrReuseCredential(currentForm) {
    if (currentForm.authMode === 'none') return null;
    if (currentForm.credentialId) {
      const existing = credentials.find((item) => item.id === currentForm.credentialId);
      return existing
        ? { id: existing.id, kind: existing.kind, label: existing.label, origin: existing.origin || '', updatedAt: existing.updatedAt }
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
        return { key: library.key, label: library.label, mode: index === 0 ? 'primary' : 'secondary' };
      })
      .filter(Boolean);

    return {
      id: currentForm.id || undefined,
      name: currentForm.name.trim(),
      kind: currentForm.kind,
      status: currentForm.id ? (definitionMap.get(currentForm.id)?.status || 'draft') : 'draft',
      authMode: currentForm.authMode,
      targetLibraries,
      schedule: {
        kind: currentForm.scheduleKind,
        timezone: 'Asia/Shanghai',
        maxItemsPerRun: Number(currentForm.maxItemsPerRun || 20) || 20,
      },
      credentialRef,
      config: {
        url: currentForm.url.trim(),
        focus: currentForm.focus.trim(),
        notes: currentForm.notes.trim(),
        keywords: splitValues(currentForm.keywords),
        siteHints: splitValues(currentForm.siteHints),
      },
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
      setMessage(json?.item?.id ? `${form.id ? '已更新' : '已创建'}数据源：${json.item.name}` : '数据源已保存。');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存数据源失败');
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
      setError('请先输入采集需求，再让模型整理。');
      return;
    }

    try {
      setPlanning(true);
      setError('');
      setMessage('');
      const json = await planOnce();
      setForm(buildFormFromDraft(json.draft || {}));
      setMessage(json?.draft?.explanation || '已根据自然语言需求整理出数据源配置草案。');
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : '采集需求整理失败');
    } finally {
      setPlanning(false);
    }
  }

  async function handlePlanAndSave() {
    if (!planPrompt.trim()) {
      setError('请先输入采集需求，再一键整理并保存。');
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
      setMessage(saved?.item?.name ? `已根据需求创建数据源：${saved.item.name}` : '已根据需求创建数据源。');
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : '整理并保存失败');
    } finally {
      setPlanning(false);
      setSaving(false);
    }
  }

  async function handleManagedAction(item, action) {
    const actionUrls = {
      run: `/api/datasources/definitions/${encodeURIComponent(item.id)}/run`,
      activate: `/api/datasources/definitions/${encodeURIComponent(item.id)}/activate`,
      pause: `/api/datasources/definitions/${encodeURIComponent(item.id)}/pause`,
      delete: `/api/datasources/definitions/${encodeURIComponent(item.id)}`,
    };

    try {
      setBusyId(`${item.id}:${action}`);
      setError('');
      setMessage('');
      const response = await fetch(buildApiUrl(actionUrls[action]), {
        method: action === 'delete' ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'delete' ? undefined : '{}',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || '数据源操作失败');
      const messages = {
        run: '已触发一次采集执行。',
        activate: '数据源已启用。',
        pause: '数据源已暂停。',
        delete: '数据源已删除。',
      };
      setMessage(messages[action]);
      await load();
      if (action === 'delete' && form.id === item.id) setForm(EMPTY_FORM);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '数据源操作失败');
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
      if (form.credentialId === id) {
        updateForm({ credentialId: '', credentialLabel: '', credentialOrigin: '', credentialNotes: '' });
      }
      setMessage('凭据已删除。');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除凭据失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>数据源工作台</h2>
            <p>统一管理公开站点、登录站点、数据库和 ERP 采集。所有采集成果都会落成文档，并进入后台深度解析。</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" type="button" onClick={() => void load()}>刷新状态</button>
            <button className="primary-btn" type="button" onClick={resetComposer}>新建数据源</button>
          </div>
        </header>

        {error ? <div className="datasource-message datasource-error">{error}</div> : null}
        {message ? <div className="datasource-message datasource-success">{message}</div> : null}

        {loading ? (
          <p>正在加载数据源工作台...</p>
        ) : (
          <section className="homepage-grid">
            <section className="documents-grid three-columns">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>运行概览</h3>
                    <p>采集定义、启停状态和最近执行情况一眼可见。</p>
                  </div>
                </div>
                <div className="summary-grid">
                  <StatCard label="已管理数据源" value={String(providerMeta.total || 0)} subtle="统一走数据源总线" />
                  <StatCard label="运行中" value={String(providerMeta.active || 0)} subtle="按计划自动执行" />
                  <StatCard label="已暂停" value={String(providerMeta.paused || 0)} subtle="可随时恢复" />
                  <StatCard label="最近执行" value={providerMeta.latestRunAt ? formatDateTime(providerMeta.latestRunAt) : '暂无'} subtle={formatRelative(providerMeta.latestRunAt)} />
                </div>
              </section>

              <section className="card documents-card datasource-hero-card" style={{ gridColumn: 'span 2' }}>
                <div className="panel-header">
                  <div>
                    <h3>自然语言整理采集需求</h3>
                    <p>先输入采集目标，系统会把需求整理成结构化草案，再由你确认目标知识库、认证方式和执行频率。</p>
                  </div>
                </div>
                <textarea className="datasource-plan-input" rows={4} value={planPrompt} onChange={(event) => setPlanPrompt(event.target.value)} placeholder="例如：每周抓取中国政府采购网里医疗设备相关的招标公告，落到 bids 知识库。" />
                <div className="datasource-inline-actions">
                  <button className="primary-btn" type="button" disabled={planning} onClick={handlePlan}>{planning ? '整理中...' : '让模型整理需求'}</button>
                  <button className="ghost-btn" type="button" disabled={planning || saving} onClick={handlePlanAndSave}>{planning || saving ? '处理中...' : '整理并保存'}</button>
                  <span className="datasource-inline-note">默认优先绑定知识库，并保持文档中心走后台解析，不阻塞页面。</span>
                </div>
              </section>
            </section>

            <section className="documents-grid two-columns datasource-workbench-grid">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>数据源配置工作栏</h3>
                    <p>在一个工作栏里完成网址、认证、目标知识库、执行频率、关键词和站点提示。</p>
                  </div>
                </div>

                <div className="datasource-form-grid">
                  <label className="datasource-field"><span>数据源名称</span><input value={form.name} onChange={(event) => updateForm({ name: event.target.value })} placeholder="例如：华南医疗招标公告" /></label>
                  <label className="datasource-field"><span>采集类型</span><select value={form.kind} onChange={(event) => updateForm({ kind: event.target.value })}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="datasource-field"><span>认证方式</span><select value={form.authMode} onChange={(event) => updateForm({ authMode: event.target.value, credentialId: '' })}>{Object.entries(AUTH_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="datasource-field"><span>执行频率</span><select value={form.scheduleKind} onChange={(event) => updateForm({ scheduleKind: event.target.value })}>{Object.entries(SCHEDULE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="datasource-field datasource-field-span"><span>入口地址 / 连接串</span><input value={form.url} onChange={(event) => updateForm({ url: event.target.value })} placeholder="https://example.com/list 或 postgres://..." /></label>
                  <label className="datasource-field datasource-field-span"><span>采集重点</span><textarea rows={3} value={form.focus} onChange={(event) => updateForm({ focus: event.target.value })} placeholder="描述正文范围、列表页与详情页关系、数据库字段或 ERP 模块。" /></label>
                  <label className="datasource-field"><span>单次采集上限</span><input value={form.maxItemsPerRun} onChange={(event) => updateForm({ maxItemsPerRun: event.target.value })} placeholder="20" /></label>
                  <label className="datasource-field"><span>站点提示</span><input value={form.siteHints} onChange={(event) => updateForm({ siteHints: event.target.value })} placeholder="例如：招标公告、详情页、项目编号" /></label>
                  <label className="datasource-field datasource-field-span"><span>关键词</span><input value={form.keywords} onChange={(event) => updateForm({ keywords: event.target.value })} placeholder="用逗号分隔，例如：医疗设备，监护仪，招标公告" /></label>
                  <label className="datasource-field datasource-field-span"><span>备注</span><textarea rows={3} value={form.notes} onChange={(event) => updateForm({ notes: event.target.value })} placeholder="补充采集边界、账号范围、数据库视图说明等。" /></label>
                </div>

                {form.authMode !== 'none' ? (
                  <div className="datasource-credential-box">
                    <div className="datasource-subtitle">认证信息</div>
                    <p className="datasource-subtle">可以复用已有凭据，也可以直接录入新的凭据后随数据源一起保存。接口不会返回凭据明文。</p>
                    <div className="datasource-form-grid">
                      <label className="datasource-field datasource-field-span">
                        <span>选择已有凭据</span>
                        <select
                          value={form.credentialId}
                          onChange={(event) => {
                            const nextId = event.target.value;
                            const existing = credentials.find((item) => item.id === nextId);
                            updateForm({
                              credentialId: nextId,
                              credentialLabel: existing?.label || '',
                              credentialOrigin: existing?.origin || '',
                              credentialNotes: existing?.notes || '',
                              credentialUsername: '',
                              credentialPassword: '',
                              credentialToken: '',
                              credentialConnectionString: '',
                              credentialCookies: '',
                              credentialHeaders: '',
                            });
                          }}
                        >
                          <option value="">不选，使用下面新录入的凭据</option>
                          {credentials.filter((item) => item.kind === form.authMode).map((item) => <option key={item.id} value={item.id}>{item.label} / {item.secretHints.join('/')}</option>)}
                        </select>
                      </label>
                      <label className="datasource-field"><span>凭据标签</span><input value={form.credentialLabel} onChange={(event) => updateForm({ credentialLabel: event.target.value, credentialId: '' })} placeholder="例如：采购平台账号" /></label>
                      <label className="datasource-field"><span>凭据来源</span><input value={form.credentialOrigin} onChange={(event) => updateForm({ credentialOrigin: event.target.value, credentialId: '' })} placeholder="例如：1Password / 手动录入" /></label>
                      <label className="datasource-field datasource-field-span"><span>凭据备注</span><input value={form.credentialNotes} onChange={(event) => updateForm({ credentialNotes: event.target.value, credentialId: '' })} placeholder="记录用途、归属或风险边界" /></label>
                      {(form.authMode === 'credential' || form.authMode === 'database_password') ? (
                        <>
                          <label className="datasource-field"><span>登录账号</span><input value={form.credentialUsername} onChange={(event) => updateForm({ credentialUsername: event.target.value, credentialId: '' })} placeholder="example_user" /></label>
                          <label className="datasource-field"><span>密码</span><input type="password" value={form.credentialPassword} onChange={(event) => updateForm({ credentialPassword: event.target.value, credentialId: '' })} placeholder="******" /></label>
                        </>
                      ) : null}
                      {form.authMode === 'database_password' ? <label className="datasource-field datasource-field-span"><span>数据库连接串</span><input value={form.credentialConnectionString} onChange={(event) => updateForm({ credentialConnectionString: event.target.value, credentialId: '' })} placeholder="postgres://user:password@host:5432/db" /></label> : null}
                      {form.authMode === 'api_token' ? <label className="datasource-field datasource-field-span"><span>API Token</span><input type="password" value={form.credentialToken} onChange={(event) => updateForm({ credentialToken: event.target.value, credentialId: '' })} placeholder="sk-..." /></label> : null}
                      {form.authMode === 'manual_session' ? (
                        <>
                          <label className="datasource-field datasource-field-span"><span>Cookies</span><textarea rows={3} value={form.credentialCookies} onChange={(event) => updateForm({ credentialCookies: event.target.value, credentialId: '' })} placeholder="session=...; token=..." /></label>
                          <label className="datasource-field datasource-field-span"><span>Headers</span><textarea rows={3} value={form.credentialHeaders} onChange={(event) => updateForm({ credentialHeaders: event.target.value, credentialId: '' })} placeholder={'Authorization: Bearer ...\nX-Requested-With: XMLHttpRequest'} /></label>
                        </>
                      ) : null}
                    </div>
                    {selectedCredential ? <div className="datasource-inline-note">已选凭据：{selectedCredential.label} / {selectedCredential.secretHints.join('/')}</div> : null}
                  </div>
                ) : null}

                <div className="datasource-library-picker">
                  <div className="datasource-subtitle">目标知识库 / 文档库</div>
                  <p className="datasource-subtle">新建数据源时必须绑定至少一个目标知识库。采集结果会直接落库，并继续走后台深度解析。</p>
                  <div className="datasource-library-grid">
                    {libraries.map((library) => {
                      const selected = form.targetKeys.includes(library.key);
                      return (
                        <button key={library.key} type="button" className={`datasource-library-chip ${selected ? 'active' : ''}`} onClick={() => toggleTargetLibrary(library.key)}>
                          <span>{library.label}</span>
                          <small>{library.documentCount || 0} 篇文档</small>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="datasource-inline-actions">
                  <button className="primary-btn" type="button" disabled={saving} onClick={handleSave}>{saving ? '保存中...' : form.id ? '保存更新' : '保存数据源'}</button>
                  <button className="ghost-btn" type="button" disabled={saving} onClick={resetComposer}>清空工作栏</button>
                  <span className="datasource-inline-note">当前数据源已经接到定义、运行记录、知识库绑定主总线，不会影响文档中心打开速度。</span>
                </div>
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>已保存凭据</h3>
                    <p>管理登录账号、数据库连接和会话凭据。列表只显示标签和提示，不返回明文。</p>
                  </div>
                </div>
                <div className="datasource-managed-list">
                  {credentials.length ? credentials.map((item) => (
                    <article key={item.id} className="datasource-managed-card">
                      <div className="datasource-managed-head">
                        <div>
                          <h4>{item.label}</h4>
                          <div className="datasource-managed-meta">
                            <DatasourceTag>{AUTH_LABELS[item.kind] || item.kind}</DatasourceTag>
                            {item.origin ? <DatasourceTag tone="neutral-tag">{item.origin}</DatasourceTag> : null}
                          </div>
                        </div>
                        <button className="ghost-btn" type="button" disabled={busyId === `credential:${item.id}`} onClick={() => void handleDeleteCredential(item.id)}>{busyId === `credential:${item.id}` ? '删除中...' : '删除'}</button>
                      </div>
                      <div className="datasource-managed-info">
                        <span>提示：{(item.secretHints || []).join(' / ') || '无'}</span>
                        <span>更新时间：{formatDateTime(item.updatedAt)}</span>
                      </div>
                      {item.notes ? <p className="datasource-run-summary">{item.notes}</p> : null}
                    </article>
                  )) : (
                    <div className="report-empty-card">
                      <h4>还没有已保存凭据</h4>
                      <p>可以在左侧工作栏里直接录入凭据，保存数据源时会一并写入凭据库。</p>
                    </div>
                  )}
                </div>
              </section>
            </section>

            <section className="documents-grid two-columns datasource-workbench-grid">
              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>预置站点</h3>
                    <p>公开招投标站点和公开学术平台可直接套用，后续再微调配置。</p>
                  </div>
                </div>
                <div className="datasource-preset-list">
                  {presetCatalog.map((preset) => (
                    <article key={preset.id} className="datasource-preset-card">
                      <div className="datasource-preset-meta">
                        <DatasourceTag tone={preset.category === 'bids' ? 'danger' : 'up-tag'}>
                          {preset.category === 'bids' ? '招投标' : '公开学术'}
                        </DatasourceTag>
                        <DatasourceTag>{KIND_LABELS[preset.kind] || preset.kind}</DatasourceTag>
                      </div>
                      <h4>{preset.name}</h4>
                      <p>{preset.description}</p>
                      <div className="datasource-preset-foot">
                        <span>{preset.baseUrl}</span>
                        <button className="ghost-btn" type="button" onClick={() => applyPreset(preset)}>套用到工作栏</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="card documents-card">
                <div className="panel-header">
                  <div>
                    <h3>已管理数据源</h3>
                    <p>查看启停状态、绑定知识库、上次与下次采集，并支持手动执行或编辑。</p>
                  </div>
                </div>
                <div className="datasource-managed-list">
                  {managed.length ? managed.map((item) => (
                    <article key={item.id} className="datasource-managed-card">
                      <div className="datasource-managed-head">
                        <div>
                          <h4>{item.name}</h4>
                          <div className="datasource-managed-meta">
                            <DatasourceTag tone={item.status === 'active' ? 'up-tag' : item.status === 'error' ? 'danger' : 'neutral-tag'}>
                              {STATUS_LABELS[item.status] || item.status}
                            </DatasourceTag>
                            <DatasourceTag>{KIND_LABELS[item.kind] || item.kind}</DatasourceTag>
                          </div>
                        </div>
                        <button className="ghost-btn" type="button" onClick={() => setForm(buildFormFromDefinition(definitionMap.get(item.id) || item))}>编辑</button>
                      </div>
                      <div className="datasource-managed-info">
                        <span>目标库：{(item.targetLibraries || []).map((entry) => entry.label).join('，') || '未绑定'}</span>
                        <span>频率：{SCHEDULE_LABELS[item.schedule] || item.schedule || '手动'}</span>
                        <span>上次：{item.runtime?.lastRunAt ? formatDateTime(item.runtime.lastRunAt) : '暂无'}</span>
                        <span>下次：{item.runtime?.nextRunAt ? formatDateTime(item.runtime.nextRunAt) : '未安排'}</span>
                      </div>
                      <div className="datasource-managed-actions">
                        <button className="primary-btn" type="button" disabled={busyId === `${item.id}:run`} onClick={() => handleManagedAction(item, 'run')}>{busyId === `${item.id}:run` ? '执行中...' : '立即采集'}</button>
                        {item.status === 'active' ? (
                          <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:pause`} onClick={() => handleManagedAction(item, 'pause')}>暂停</button>
                        ) : (
                          <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:activate`} onClick={() => handleManagedAction(item, 'activate')}>启用</button>
                        )}
                        <button className="ghost-btn" type="button" disabled={busyId === `${item.id}:delete`} onClick={() => handleManagedAction(item, 'delete')}>删除</button>
                      </div>
                    </article>
                  )) : (
                    <div className="report-empty-card">
                      <h4>还没有正式纳管的数据源</h4>
                      <p>先用自然语言生成草案，或从预置站点开始，再保存为数据源定义。</p>
                    </div>
                  )}
                </div>
              </section>
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>最近运行记录</h3>
                  <p>采集状态、发现数量、入库数量和异常原因会在这里汇总。</p>
                </div>
              </div>
              <div className="datasource-run-list">
                {recentRuns.length ? recentRuns.map((run) => (
                  <article key={run.id} className="datasource-run-card">
                    <div className="datasource-run-head">
                      <div className="datasource-subtitle">{run.datasourceId}</div>
                      <DatasourceTag tone={run.status === 'success' ? 'up-tag' : run.status === 'failed' ? 'danger' : 'neutral-tag'}>
                        {RUN_STATUS_LABELS[run.status] || run.status}
                      </DatasourceTag>
                    </div>
                    <div className="datasource-managed-info">
                      <span>开始：{formatDateTime(run.startedAt)}</span>
                      <span>结束：{run.finishedAt ? formatDateTime(run.finishedAt) : '进行中'}</span>
                      <span>发现：{run.discoveredCount}</span>
                      <span>采集：{run.capturedCount}</span>
                      <span>入库：{run.ingestedCount}</span>
                    </div>
                    {run.summary ? <p className="datasource-run-summary">{run.summary}</p> : null}
                    {run.errorMessage ? <p className="datasource-run-error">{run.errorMessage}</p> : null}
                  </article>
                )) : (
                  <div className="report-empty-card">
                    <h4>还没有执行记录</h4>
                    <p>启用数据源后，采集状态、下次执行和落库结果会自动在这里沉淀。</p>
                  </div>
                )}
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
