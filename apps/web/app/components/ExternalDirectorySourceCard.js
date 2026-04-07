'use client';

import { useEffect, useMemo, useState } from 'react';

function normalizeError(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function createSourceDraft(source, fallbackId) {
  return {
    id: String(source?.id || fallbackId || '').trim(),
    requestUrl: String(source?.request?.url || '').trim(),
    requestMethod: String(source?.request?.method || 'GET').trim().toUpperCase() === 'POST' ? 'POST' : 'GET',
    requestHeadersText: Array.isArray(source?.request?.headers)
      ? source.request.headers.map((item) => `${item.key}: ${item.value}`).join('\n')
      : '',
    usersPath: String(source?.responseMapping?.usersPath || 'users').trim(),
    groupsPath: String(source?.responseMapping?.groupsPath || 'groups').trim(),
    membershipsPath: String(source?.responseMapping?.membershipsPath || 'memberships').trim(),
    userIdField: String(source?.fieldMapping?.userIdField || 'id').trim(),
    userNameField: String(source?.fieldMapping?.userNameField || 'name').trim(),
    groupIdField: String(source?.fieldMapping?.groupIdField || 'id').trim(),
    groupNameField: String(source?.fieldMapping?.groupNameField || 'name').trim(),
    membershipUserIdField: String(source?.fieldMapping?.membershipUserIdField || 'userId').trim(),
    membershipGroupIdField: String(source?.fieldMapping?.membershipGroupIdField || 'groupId').trim(),
    syncMode: String(source?.sync?.mode || 'manual').trim().toLowerCase() === 'interval' ? 'interval' : 'manual',
    syncIntervalMinutes: Number.isFinite(Number(source?.sync?.intervalMinutes))
      ? Math.max(5, Math.floor(Number(source.sync.intervalMinutes)))
      : 60,
  };
}

function parseHeaders(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const divider = line.indexOf(':');
      if (divider <= 0) return null;
      return {
        key: line.slice(0, divider).trim(),
        value: line.slice(divider + 1).trim(),
        secret: /token|authorization|secret|key/i.test(line.slice(0, divider).trim()),
      };
    })
    .filter(Boolean);
}

function buildPayload(draft, channel, binding) {
  return {
    id: String(draft.id || '').trim(),
    channel,
    routeKey: String(binding?.routeKey || '').trim(),
    tenantId: String(binding?.tenantId || '').trim(),
    externalBotId: String(binding?.externalBotId || '').trim(),
    request: {
      url: String(draft.requestUrl || '').trim(),
      method: draft.requestMethod === 'POST' ? 'POST' : 'GET',
      headers: parseHeaders(draft.requestHeadersText),
    },
    responseMapping: {
      usersPath: String(draft.usersPath || 'users').trim(),
      groupsPath: String(draft.groupsPath || 'groups').trim(),
      membershipsPath: String(draft.membershipsPath || 'memberships').trim(),
    },
    fieldMapping: {
      userIdField: String(draft.userIdField || 'id').trim(),
      userNameField: String(draft.userNameField || 'name').trim(),
      groupIdField: String(draft.groupIdField || 'id').trim(),
      groupNameField: String(draft.groupNameField || 'name').trim(),
      membershipUserIdField: String(draft.membershipUserIdField || 'userId').trim(),
      membershipGroupIdField: String(draft.membershipGroupIdField || 'groupId').trim(),
    },
    sync: {
      mode: draft.syncMode === 'interval' ? 'interval' : 'manual',
      intervalMinutes: draft.syncMode === 'interval'
        ? Math.max(5, Math.floor(Number(draft.syncIntervalMinutes || 60)))
        : undefined,
    },
  };
}

function formatStatus(source) {
  const status = source?.syncStatus?.status || source?.lastSyncStatus || 'idle';
  if (status === 'success') return '最近同步成功';
  if (status === 'error') return '最近同步失败';
  if (status === 'running') return '同步中';
  return '尚未同步';
}

export default function ExternalDirectorySourceCard({
  botId,
  channelLabel,
  binding,
  source,
  existingSources = [],
  manageEnabled = false,
  onBindingChange,
  onCreateSource,
  onUpdateSource,
  onSyncSource,
  onOpenAccessPanel,
}) {
  const [draft, setDraft] = useState(() => createSourceDraft(source, binding?.directorySourceId || `${botId}-${binding?.channel || 'channel'}-directory`));
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(createSourceDraft(source, binding?.directorySourceId || `${botId}-${binding?.channel || 'channel'}-directory`));
  }, [botId, binding?.channel, binding?.directorySourceId, source]);

  const mappingEnabled = Boolean(binding?.directorySourceId);
  const sourceOptions = useMemo(
    () => existingSources.filter((item) => item?.channel === binding?.channel),
    [binding?.channel, existingSources],
  );

  async function handleSaveSource() {
    if (!manageEnabled) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = buildPayload(draft, binding?.channel, binding);
      const item = source?.id
        ? await onUpdateSource?.(source.id, payload)
        : await onCreateSource?.(payload);
      if (item?.id) {
        onBindingChange?.({
          ...binding,
          directorySourceId: item.id,
        });
      }
      setNotice(item?.id ? `已保存目录源：${item.id}` : '目录源已保存。');
    } catch (saveError) {
      setError(normalizeError(saveError, '保存目录源失败。'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    if (!manageEnabled || !source?.id) return;
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      await onSyncSource?.(source.id);
      setNotice('目录同步已完成。');
    } catch (syncError) {
      setError(normalizeError(syncError, '同步目录源失败。'));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="bot-chip-group">
      <div className="bot-chip-group-title">{channelLabel} · 外部用户映射</div>
      <div className="bot-config-subtle">
        机器人仍保留自身文档权限上限。外部用户映射会在此基础上继续收窄到用户/组可见库。
      </div>

      {notice ? <div className="bot-config-success">{notice}</div> : null}
      {error ? <div className="bot-config-error">{error}</div> : null}

      <div className="bot-toggle-row">
        <label className="bot-toggle">
          <input
            type="checkbox"
            checked={mappingEnabled}
            disabled={!manageEnabled}
            onChange={(event) => onBindingChange?.({
              ...binding,
              directorySourceId: event.target.checked
                ? (binding?.directorySourceId || sourceOptions[0]?.id || draft.id || `${botId}-${binding?.channel}-directory`)
                : '',
            })}
          />
          <span>启用外部用户映射</span>
        </label>
      </div>

      {mappingEnabled ? (
        <>
          <div className="bot-field-grid">
            <label className="bot-field">
              <span>目录源</span>
              <select
                value={binding?.directorySourceId || ''}
                disabled={!manageEnabled}
                onChange={(event) => onBindingChange?.({
                  ...binding,
                  directorySourceId: event.target.value,
                })}
              >
                <option value="">新建目录源</option>
                {sourceOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.id}</option>
                ))}
              </select>
            </label>
            <div className="bot-field bot-field-readonly">
              <span>同步状态</span>
              <div className="bot-config-subtle">
                {formatStatus(source)}
                {source?.syncStatus?.lastSyncAt ? ` · ${source.syncStatus.lastSyncAt}` : ''}
              </div>
            </div>
            <label className="bot-field">
              <span>目录源 ID</span>
              <input
                value={draft.id}
                disabled={!manageEnabled || Boolean(source?.id)}
                onChange={(event) => setDraft((prev) => ({ ...prev, id: event.target.value }))}
                placeholder="例如 wecom-corp-directory"
              />
            </label>
            <label className="bot-field">
              <span>请求方法</span>
              <select
                value={draft.requestMethod}
                disabled={!manageEnabled}
                onChange={(event) => setDraft((prev) => ({ ...prev, requestMethod: event.target.value }))}
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
              </select>
            </label>
            <label className="bot-field bot-field-span">
              <span>目录接口 URL</span>
              <input
                value={draft.requestUrl}
                disabled={!manageEnabled}
                onChange={(event) => setDraft((prev) => ({ ...prev, requestUrl: event.target.value }))}
                placeholder="https://example.com/api/directory"
              />
            </label>
            <label className="bot-field bot-field-span">
              <span>请求头（每行 Key: Value）</span>
              <textarea
                rows={3}
                disabled={!manageEnabled}
                value={draft.requestHeadersText}
                onChange={(event) => setDraft((prev) => ({ ...prev, requestHeadersText: event.target.value }))}
                placeholder="Authorization: Bearer xxx"
              />
            </label>
          </div>

          <div className="bot-field-grid">
            <label className="bot-field">
              <span>usersPath</span>
              <input value={draft.usersPath} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, usersPath: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>groupsPath</span>
              <input value={draft.groupsPath} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, groupsPath: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>membershipsPath</span>
              <input value={draft.membershipsPath} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, membershipsPath: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>userIdField</span>
              <input value={draft.userIdField} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, userIdField: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>userNameField</span>
              <input value={draft.userNameField} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, userNameField: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>groupIdField</span>
              <input value={draft.groupIdField} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, groupIdField: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>groupNameField</span>
              <input value={draft.groupNameField} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, groupNameField: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>membershipUserIdField</span>
              <input value={draft.membershipUserIdField} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, membershipUserIdField: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>membershipGroupIdField</span>
              <input value={draft.membershipGroupIdField} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, membershipGroupIdField: event.target.value }))} />
            </label>
            <label className="bot-field">
              <span>同步模式</span>
              <select value={draft.syncMode} disabled={!manageEnabled} onChange={(event) => setDraft((prev) => ({ ...prev, syncMode: event.target.value }))}>
                <option value="manual">手动</option>
                <option value="interval">定时</option>
              </select>
            </label>
            {draft.syncMode === 'interval' ? (
              <label className="bot-field">
                <span>间隔分钟</span>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={draft.syncIntervalMinutes}
                  disabled={!manageEnabled}
                  onChange={(event) => setDraft((prev) => ({ ...prev, syncIntervalMinutes: event.target.value }))}
                />
              </label>
            ) : null}
          </div>

          <div className="report-template-actions">
            <button type="button" className="ghost-btn" disabled={!manageEnabled || saving} onClick={() => void handleSaveSource()}>
              {saving ? '保存中...' : (source?.id ? '保存目录源' : '创建目录源')}
            </button>
            <button type="button" className="ghost-btn" disabled={!manageEnabled || syncing || !source?.id} onClick={() => void handleSync()}>
              {syncing ? '同步中...' : '立即同步'}
            </button>
            <button type="button" className="ghost-btn" disabled={!manageEnabled || !source?.id} onClick={() => onOpenAccessPanel?.()}>
              管理用户/组权限
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
