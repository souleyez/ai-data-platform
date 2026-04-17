'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import FullIntelligenceModeButton from '../components/FullIntelligenceModeButton';
import Sidebar from '../components/Sidebar';
import WorkspaceDesktopShell from '../components/WorkspaceDesktopShell';
import { buildApiUrl } from '../lib/config';
import { appendSystemMemoryEntry } from '../lib/chat-memory';
import {
  clearStoredDatasetSecretState,
  loadStoredDatasetSecretState,
  resolveStoredDatasetSecretState,
  setActiveDatasetSecretGrant,
  verifyDatasetSecretText,
} from '../lib/dataset-secrets';
import useMobileViewport from '../lib/use-mobile-viewport';
import { createDocumentLibrary } from '../documents/api';
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
  const mobileViewport = useMobileViewport();
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
  const [datasetSecretState, setDatasetSecretState] = useState(() => loadStoredDatasetSecretState());
  const [lockedLibraryPrompt, setLockedLibraryPrompt] = useState(null);
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
    let alive = true;
    resolveStoredDatasetSecretState()
      .then((nextState) => {
        if (alive) setDatasetSecretState(nextState);
      })
      .catch(() => {
        if (alive) setDatasetSecretState(loadStoredDatasetSecretState());
      });
    return () => {
      alive = false;
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
  const isLocalDirectory = form.kind === 'local_directory';
  const selectedLibraries = useMemo(
    () => libraries.filter((item) => form.targetKeys.includes(item.key)),
    [form.targetKeys, libraries],
  );
  const selectedLibraryKeySet = useMemo(() => new Set(form.targetKeys), [form.targetKeys]);
  const filteredManaged = useMemo(() => {
    if (!selectedLibraryKeySet.size) return managed;
    return managed.filter((item) =>
      (item.targetLibraries || []).some((entry) => selectedLibraryKeySet.has(entry.key)),
    );
  }, [managed, selectedLibraryKeySet]);
  const recentRuns = useMemo(() => {
    const scopedRuns = !selectedLibraryKeySet.size
      ? runs
      : runs.filter((run) => (run.libraryKeys || []).some((key) => selectedLibraryKeySet.has(key)));
    return scopedRuns.slice(0, 10);
  }, [runs, selectedLibraryKeySet]);
  const unlockedLibraryKeys = useMemo(
    () => Array.isArray(datasetSecretState?.unlockedLibraryKeys) ? datasetSecretState.unlockedLibraryKeys : [],
    [datasetSecretState],
  );

  useEffect(() => {
    const unlockedSet = new Set(unlockedLibraryKeys);
    setForm((current) => ({
      ...current,
      targetKeys: current.targetKeys.filter((key) => {
        const library = libraries.find((item) => item.key === key);
        return library && (!library.secretProtected || unlockedSet.has(key));
      }),
    }));
  }, [libraries, unlockedLibraryKeys]);

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
    const library = libraries.find((item) => item.key === key);
    if (library?.secretProtected && !unlockedLibraryKeys.includes(key)) {
      setLockedLibraryPrompt(library);
      return;
    }
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

  async function handleCreateLibrary(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed || saving) return false;
    const localSecret = !datasetSecretState?.activeGrant && typeof datasetSecretState?.localSecret === 'string'
      ? String(datasetSecretState.localSecret || '').trim()
      : '';
    try {
      const created = await createDocumentLibrary(trimmed, '', 0, { datasetSecretState });
      let activeLibraryKeys = [];
      let autoVerified = false;
      if (localSecret) {
        try {
          const nextState = await verifyDatasetSecretText(localSecret, datasetSecretState);
          setDatasetSecretState(nextState);
          activeLibraryKeys = Array.isArray(nextState?.activeLibraryKeys) ? nextState.activeLibraryKeys : [];
          autoVerified = true;
        } catch {
          autoVerified = false;
        }
      }
      await load();
      const createdKey = String(created?.item?.key || '').trim();
      if (createdKey) {
        setForm((current) => ({
          ...current,
          targetKeys: [...new Set([
            ...current.targetKeys,
            createdKey,
            ...activeLibraryKeys,
          ])],
        }));
      }
      setMessage(localSecret && !autoVerified
        ? `已新建数据集：${trimmed}，但本地新密钥未能自动转成正式授权，请重新输入一次密钥。`
        : `已新建数据集：${trimmed}`);
      return true;
    } catch {
      setError('新建数据集失败');
      return false;
    }
  }

  async function handleVerifyDatasetSecret(secret) {
    const nextState = await verifyDatasetSecretText(secret, datasetSecretState);
    setDatasetSecretState(nextState);
    if (lockedLibraryPrompt?.key && nextState?.activeLibraryKeys?.includes(lockedLibraryPrompt.key)) {
      updateForm({ targetKeys: nextState.activeLibraryKeys });
    }
    setLockedLibraryPrompt(null);
    return nextState;
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
        `${json.item?.name || form.name} 已保存，目标数据集：${(json.item?.targetLibraries || []).map((entry) => entry.label).join('、') || '未绑定'}`,
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
      clearSession: `/api/datasources/definitions/${encodeURIComponent(item.id)}/clear-session`,
      forceRelogin: `/api/datasources/definitions/${encodeURIComponent(item.id)}/force-relogin`,
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
              : action === 'clearSession'
                ? `已清除缓存会话：${item.name}`
                : action === 'forceRelogin'
                  ? `已强制重登并重新采集：${item.name}`
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

  async function handleDeleteRun(run) {
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(`确认删除运行记录「${run.datasourceName || run.datasourceId} / ${run.id}」吗？这不会删除数据源定义或已入库文档。`);
    if (!confirmed) return;

    try {
      setBusyId(`${run.id}:delete-run`);
      setError('');
      setMessage('');
      const response = await fetch(buildApiUrl(`/api/datasources/runs/${encodeURIComponent(run.id)}`), {
        method: 'DELETE',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || '删除运行记录失败');

      await load();
      const nextMessage = `已删除运行记录：${run.datasourceName || run.datasourceId}`;
      setMessage(nextMessage);
      rememberDatasourceFeedback('数据源运行记录已删除', nextMessage, run.id);
    } catch (deleteError) {
      const nextError = deleteError instanceof Error ? deleteError.message : '删除运行记录失败';
      setError(nextError);
      rememberDatasourceFeedback('数据源运行记录删除失败', nextError, run.id);
    } finally {
      setBusyId('');
    }
  }

  const content = (
    <>
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
        <>
          <section className="documents-grid two-columns datasource-workbench-grid">
            <DatasourceComposerCard
              form={form}
              isLocalDirectory={isLocalDirectory}
              libraries={libraries}
              selectedLibraries={selectedLibraries}
              credentials={credentials}
              saving={saving}
              onUpdateForm={updateForm}
              onToggleTargetLibrary={toggleTargetLibrary}
              onSave={handleSave}
              onStartNew={() => setForm(EMPTY_FORM)}
              showTargetLibrariesSection={mobileViewport}
            />

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>已管理数据源</h3>
                  <p>
                    {selectedLibraries.length
                      ? `当前只显示这些数据集关联的采集源：${selectedLibraries.map((item) => item.label).join('、')}`
                      : '当前显示全部采集源；左侧选择数据集后会自动收口。'}
                  </p>
                </div>
              </div>
              {filteredManaged.length ? (
                <div className="datasource-managed-list">
                  {filteredManaged.map((item) => (
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
                <div className="report-empty-card">
                  {selectedLibraries.length
                    ? '当前所选数据集下还没有已管理采集源。'
                    : '还没有已管理采集源。你可以先通过上面的工作栏整理一条采集需求。'}
                </div>
              )}
            </section>

            <section className="card documents-card">
              <div className="panel-header">
                <div>
                  <h3>最近运行记录</h3>
                  <p>
                    {selectedLibraries.length
                      ? `当前只显示这些数据集相关的最近运行：${selectedLibraries.map((item) => item.label).join('、')}`
                      : '查看执行状态、采集数量和落库结果概览，不在这里展示实际采集正文。'}
                  </p>
                </div>
              </div>
              {recentRuns.length ? (
                <div className="datasource-run-list">
                  {recentRuns.map((run) => (
                    <DatasourceRunCard
                      key={run.id}
                      run={run}
                      deleting={busyId === `${run.id}:delete-run`}
                      onDelete={handleDeleteRun}
                    />
                  ))}
                </div>
              ) : (
                <div className="report-empty-card">
                  {selectedLibraries.length
                    ? '当前所选数据集还没有相关运行记录。'
                    : '还没有运行记录。保存一条数据源后即可触发采集并在这里查看结果。'}
                </div>
              )}
            </section>
          </section>
        </>
      )}
    </>
  );

  if (!mobileViewport) {
    return (
      <WorkspaceDesktopShell
        currentPath="/datasources"
        sourceItems={sidebarSources}
        libraries={libraries}
        totalDocuments={libraries.reduce((total, item) => total + Number(item?.documentCount || 0), 0)}
        selectedKeys={form.targetKeys}
        unlockedKeys={unlockedLibraryKeys}
        datasetSecretState={datasetSecretState}
        onToggleLibrary={toggleTargetLibrary}
        onRequestUnlock={setLockedLibraryPrompt}
        onClearSelection={() => updateForm({ targetKeys: [] })}
        onCreateLibrary={handleCreateLibrary}
        creating={saving}
        railShowClearChip={false}
        railSelectionSummaryLabel={`已选 ${form.targetKeys.length}`}
        fullIntelligenceSlot={(
          <FullIntelligenceModeButton
            compact
            datasetSecretState={datasetSecretState}
            onVerifySecret={handleVerifyDatasetSecret}
            onActivateGrant={(bindingId) => {
              const nextState = setActiveDatasetSecretGrant(datasetSecretState, bindingId);
              setDatasetSecretState(nextState);
              return nextState;
            }}
            onClearCache={() => {
              const nextState = clearStoredDatasetSecretState();
              setDatasetSecretState(nextState);
              return nextState;
            }}
            promptTargetLibrary={lockedLibraryPrompt}
            onPromptHandled={() => setLockedLibraryPrompt(null)}
          />
        )}
      >
        {content}
      </WorkspaceDesktopShell>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar sourceItems={sidebarSources} currentPath="/datasources" />
      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>采集源</h2>
          </div>
          <div className="topbar-actions">
            <button className="ghost-btn" type="button" onClick={resetComposer}>清空工作栏</button>
          </div>
        </header>
        {content}
      </main>
    </div>
  );
}
