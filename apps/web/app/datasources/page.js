'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Sidebar from '../components/Sidebar';
import { buildApiUrl } from '../lib/config';
import { appendSystemMemoryEntry } from '../lib/chat-memory';
import DatasourceComposerCard from './datasource-composer-card';
import DatasourceManagedCard from './datasource-managed-card';
import DatasourceRunCard from './datasource-run-card';
import {
  buildCredentialSecret,
  buildDatasourcePayload,
  buildFormFromDefinition,
  buildSidebarSources,
  copyText,
  EMPTY_FORM,
} from './datasource-page-support';

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
    rememberDatasourceFeedback('数据源系统反馈', text, form.name || '数据源工作台');
  }, [form.name, message]);

  useEffect(() => {
    const text = String(error || '').trim();
    if (!text || syncedErrorRef.current === text) return;
    syncedErrorRef.current = text;
    rememberDatasourceFeedback('数据源系统异常', text, form.name || '数据源工作台');
  }, [error, form.name]);

  const definitionMap = useMemo(() => new Map(definitions.map((item) => [item.id, item])), [definitions]);
  const sidebarSources = useMemo(() => buildSidebarSources(managed, legacyData?.items || []), [legacyData, managed]);
  const recentRuns = useMemo(() => runs.slice(0, 10), [runs]);
  const isLocalDirectory = form.kind === 'local_directory';

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleCopyPublicPath(item) {
    const publicPath = String(item?.publicPath || '').trim();
    if (!publicPath || typeof window === 'undefined') return;
    const url = `${window.location.origin}${publicPath}`;

    try {
      const copied = await copyText(url);
      if (!copied) throw new Error('copy_failed');
      setMessage(`已复制外部上传链接：${item.name}`);
      rememberDatasourceFeedback(
        '外部上传链接已复制',
        `${item.name} 的外部上传链接已复制，可直接发给外部用户提交资料。`,
        item.name,
      );
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
    setForm(EMPTY_FORM);
    setError('');
    setMessage('');
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

  async function persistDefinitionWithForm(nextForm = form) {
    const credentialRef = await createOrReuseCredential(nextForm);
    const payload = buildDatasourcePayload({
      currentForm: nextForm,
      libraries,
      currentStatus: nextForm.id ? definitionMap.get(nextForm.id)?.status : undefined,
      credentialRef,
    });
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
      const nextMessage = form.id
        ? `已更新数据源：${json.item?.name || form.name}`
        : `已创建数据源：${json.item?.name || form.name}`;
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
              <DatasourceComposerCard
                form={form}
                isLocalDirectory={isLocalDirectory}
                libraries={libraries}
                credentials={credentials}
                saving={saving}
                onUpdateForm={updateForm}
                onToggleTargetLibrary={toggleTargetLibrary}
                onSave={handleSave}
                onStartNew={() => setForm(EMPTY_FORM)}
              />

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
                      <DatasourceManagedCard
                        key={item.id}
                        item={item}
                        definition={definitionMap.get(item.id)}
                        busyId={busyId}
                        onEdit={setForm}
                        onCopyPublicPath={handleCopyPublicPath}
                        onManagedAction={handleManagedAction}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="report-empty-card">还没有已管理数据源。你可以先通过上面的工作栏整理一条采集需求。</div>
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
                      <DatasourceRunCard key={run.id} run={run} />
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
