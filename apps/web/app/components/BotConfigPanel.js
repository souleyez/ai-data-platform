'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  createChannelDirectorySource,
  fetchChannelDirectorySources,
  syncChannelDirectorySource,
  updateChannelDirectorySource,
} from '../home-api';
import ExternalDirectorySourceCard from './ExternalDirectorySourceCard';
import ExternalUserAccessPanel from './ExternalUserAccessPanel';

const CHANNEL_OPTIONS = [
  { key: 'web', label: 'Web' },
  { key: 'wecom', label: '企业微信' },
  { key: 'teams', label: 'Microsoft Teams' },
  { key: 'qq', label: 'QQ' },
  { key: 'feishu', label: '飞书' },
];

function createEmptyChannelDraft(channel, enabled = false) {
  return {
    channel,
    enabled,
    routeKey: '',
    tenantId: '',
    externalBotId: '',
    directorySourceId: '',
  };
}

function createEmptyDraft() {
  return {
    name: '',
    description: '',
    systemPrompt: '',
    enabled: true,
    isDefault: false,
    includeUngrouped: true,
    includeFailedParseDocuments: false,
    libraryAccessLevel: 0,
    visibleLibraryKeys: [],
    channels: Object.fromEntries(CHANNEL_OPTIONS.map((option) => [
      option.key,
      createEmptyChannelDraft(option.key, option.key === 'web'),
    ])),
  };
}

function createDraftFromBot(bot) {
  const draft = createEmptyDraft();
  const bindings = Array.isArray(bot?.channelBindings) ? bot.channelBindings : [];

  for (const option of CHANNEL_OPTIONS) {
    const binding = bindings.find((item) => item?.channel === option.key);
    draft.channels[option.key] = {
      ...createEmptyChannelDraft(option.key, option.key === 'web'),
      enabled: binding ? binding.enabled !== false : option.key === 'web',
      routeKey: String(binding?.routeKey || ''),
      tenantId: String(binding?.tenantId || ''),
      externalBotId: String(binding?.externalBotId || ''),
      directorySourceId: String(binding?.directorySourceId || ''),
    };
  }

  return {
    ...draft,
    name: String(bot?.name || ''),
    description: String(bot?.description || ''),
    systemPrompt: String(bot?.systemPrompt || ''),
    enabled: bot?.enabled !== false,
    isDefault: bot?.isDefault === true,
    includeUngrouped: bot?.includeUngrouped !== false,
    includeFailedParseDocuments: bot?.includeFailedParseDocuments === true,
    libraryAccessLevel: Number.isFinite(Number(bot?.libraryAccessLevel))
      ? Math.max(0, Math.floor(Number(bot.libraryAccessLevel)))
      : 0,
    visibleLibraryKeys: Array.isArray(bot?.visibleLibraryKeys) ? bot.visibleLibraryKeys : [],
  };
}

function serializeDraft(draft) {
  return {
    name: String(draft?.name || '').trim(),
    description: String(draft?.description || '').trim(),
    systemPrompt: String(draft?.systemPrompt || '').trim(),
    enabled: draft?.enabled !== false,
    isDefault: draft?.isDefault === true,
    includeUngrouped: draft?.includeUngrouped !== false,
    includeFailedParseDocuments: draft?.includeFailedParseDocuments === true,
    libraryAccessLevel: Math.max(0, Math.floor(Number(draft?.libraryAccessLevel || 0))),
    visibleLibraryKeys: Array.isArray(draft?.visibleLibraryKeys) ? draft.visibleLibraryKeys : [],
    channelBindings: CHANNEL_OPTIONS.map((option) => {
      const binding = draft?.channels?.[option.key] || createEmptyChannelDraft(option.key);
      return {
        channel: option.key,
        enabled: Boolean(binding.enabled),
        routeKey: String(binding.routeKey || '').trim() || undefined,
        tenantId: String(binding.tenantId || '').trim() || undefined,
        externalBotId: String(binding.externalBotId || '').trim() || undefined,
        directorySourceId: String(binding.directorySourceId || '').trim() || undefined,
      };
    }),
  };
}

function toggleListValue(values, value) {
  const next = new Set(Array.isArray(values) ? values : []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next];
}

function normalizeError(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatLibraryLabel(library) {
  const label = library?.label || library?.name || library?.key || '未命名知识库';
  const permissionLevel = Number.isFinite(Number(library?.permissionLevel))
    ? Math.max(0, Math.floor(Number(library.permissionLevel)))
    : 0;
  return `${label} · L${permissionLevel}`;
}

function ChannelBindingEditor({ value, onChange }) {
  return (
    <div className="bot-binding-grid">
      <label className="bot-toggle bot-toggle-wide">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(event) => onChange({ ...value, enabled: event.target.checked })}
        />
        <span>启用该渠道</span>
      </label>
      <label className="bot-field">
        <span>routeKey</span>
        <input
          value={value.routeKey}
          onChange={(event) => onChange({ ...value, routeKey: event.target.value })}
          placeholder="用于第三方回调或路由键"
        />
      </label>
      <label className="bot-field">
        <span>tenantId</span>
        <input
          value={value.tenantId}
          onChange={(event) => onChange({ ...value, tenantId: event.target.value })}
          placeholder="多租户渠道可填"
        />
      </label>
      <label className="bot-field">
        <span>externalBotId</span>
        <input
          value={value.externalBotId}
          onChange={(event) => onChange({ ...value, externalBotId: event.target.value })}
          placeholder="第三方机器人 ID"
        />
      </label>
    </div>
  );
}

function BotEditorCard({
  botId,
  title,
  draft,
  libraries,
  manageEnabled,
  directorySources = [],
  expandedAccessPanel = '',
  onChange,
  onCreateSource,
  onUpdateSource,
  onSyncSource,
  onToggleAccessPanel,
  actionLabel,
  actionPending,
  onSubmit,
}) {
  const hasLibraries = Array.isArray(libraries) && libraries.length > 0;

  return (
    <div className="bot-card">
      <div className="bot-card-head">
        <div>
          <strong>{title}</strong>
          <div className="bot-config-subtle">
            机器人权限规则：机器人等级 N 可访问知识库权限等级大于等于 N 的库。0 可看全部，1 不能看 0 级库。
          </div>
        </div>
        <button
          type="button"
          className="primary-btn"
          onClick={onSubmit}
          disabled={actionPending}
        >
          {actionPending ? '保存中...' : actionLabel}
        </button>
      </div>

      <div className="bot-field-grid">
        <label className="bot-field">
          <span>机器人名称</span>
          <input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} />
        </label>
        <label className="bot-field">
          <span>说明</span>
          <input value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} />
        </label>
        <label className="bot-field">
          <span>知识库权限等级</span>
          <input
            type="number"
            min="0"
            step="1"
            value={draft.libraryAccessLevel}
            onChange={(event) => onChange({
              ...draft,
              libraryAccessLevel: Math.max(0, Math.floor(Number(event.target.value || 0))),
            })}
          />
        </label>
        <div className="bot-field bot-field-readonly">
          <span>执行态</span>
          <div className="bot-config-subtle">
            当前固定为全智能执行态，文档权限仍只按下方知识库规则生效。
          </div>
        </div>
        <div className="bot-field bot-field-readonly">
          <span>权限解释</span>
          <div className="bot-config-subtle">
            当前等级 L{draft.libraryAccessLevel}，可访问权限等级 ≥ {draft.libraryAccessLevel} 的知识库。
          </div>
        </div>
        <label className="bot-field bot-field-span">
          <span>自然语言约束</span>
          <textarea
            rows={4}
            value={draft.systemPrompt}
            onChange={(event) => onChange({ ...draft, systemPrompt: event.target.value })}
            placeholder="例如：只回答合同相关事项；回答尽量简短；不要主动生成 PPT。"
          />
        </label>
      </div>

      <div className="bot-toggle-row">
        <label className="bot-toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => onChange({ ...draft, enabled: event.target.checked })}
          />
          <span>启用</span>
        </label>
        <label className="bot-toggle">
          <input
            type="checkbox"
            checked={draft.isDefault}
            onChange={(event) => onChange({ ...draft, isDefault: event.target.checked })}
          />
          <span>默认机器人</span>
        </label>
        <label className="bot-toggle">
          <input
            type="checkbox"
            checked={draft.includeUngrouped}
            onChange={(event) => onChange({ ...draft, includeUngrouped: event.target.checked })}
          />
          <span>可看未分组文档</span>
        </label>
        <label className="bot-toggle">
          <input
            type="checkbox"
            checked={draft.includeFailedParseDocuments}
            onChange={(event) => onChange({ ...draft, includeFailedParseDocuments: event.target.checked })}
          />
          <span>可看解析失败文档</span>
        </label>
      </div>

      <div className="bot-chip-group">
        <div className="bot-chip-group-title">第三方渠道与机器人绑定</div>
        <div className="bot-channel-stack">
          {CHANNEL_OPTIONS.map((option) => (
            <div key={option.key} className="bot-channel-card">
              <div className="bot-channel-title">{option.label}</div>
              <ChannelBindingEditor
                value={draft.channels[option.key]}
                onChange={(nextChannel) => onChange({
                  ...draft,
                  channels: {
                    ...draft.channels,
                    [option.key]: nextChannel,
                  },
                })}
              />
            </div>
          ))}
        </div>
      </div>

      {botId ? CHANNEL_OPTIONS
        .filter((option) => option.key !== 'web')
        .map((option) => {
          const channelDraft = draft.channels[option.key] || createEmptyChannelDraft(option.key);
          const panelKey = `${botId}:${option.key}`;
          const activeSource = directorySources.find((source) => source?.id === channelDraft.directorySourceId) || null;
          return (
            <div key={panelKey}>
              <ExternalDirectorySourceCard
                botId={botId}
                channelLabel={option.label}
                binding={channelDraft}
                source={activeSource}
                existingSources={directorySources}
                manageEnabled={manageEnabled}
                onBindingChange={(nextBinding) => onChange({
                  ...draft,
                  channels: {
                    ...draft.channels,
                    [option.key]: nextBinding,
                  },
                })}
                onCreateSource={onCreateSource}
                onUpdateSource={onUpdateSource}
                onSyncSource={onSyncSource}
                onOpenAccessPanel={() => onToggleAccessPanel?.(panelKey)}
              />
              {expandedAccessPanel === panelKey && channelDraft.directorySourceId ? (
                <ExternalUserAccessPanel
                  botId={botId}
                  sourceId={channelDraft.directorySourceId}
                  libraries={libraries}
                  manageEnabled={manageEnabled}
                />
              ) : null}
            </div>
          );
        })
        : (
          <div className="bot-config-subtle">
            机器人创建后，才可以继续配置外部用户映射与用户/组文档权限。
          </div>
        )}

      <div className="bot-chip-group">
        <div className="bot-chip-group-title">额外限定知识库（可选）</div>
        {hasLibraries ? (
          <div className="bot-chip-grid">
            {libraries.map((library) => {
              const libraryKey = library.key;
              const active = draft.visibleLibraryKeys.includes(libraryKey);
              return (
                <label key={libraryKey} className={`bot-chip ${active ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => onChange({
                      ...draft,
                      visibleLibraryKeys: toggleListValue(draft.visibleLibraryKeys, libraryKey),
                    })}
                  />
                  <span>{formatLibraryLabel(library)}</span>
                </label>
              );
            })}
          </div>
        ) : (
          <div className="bot-config-subtle">当前没有可选知识库。</div>
        )}
      </div>
    </div>
  );
}

export default function BotConfigPanel({
  items = [],
  libraries = [],
  manageEnabled = false,
  loading = false,
  onCreate,
  onUpdate,
}) {
  const [drafts, setDrafts] = useState({});
  const [createDraft, setCreateDraft] = useState(() => createEmptyDraft());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [creating, setCreating] = useState(false);
  const [sourcesByBot, setSourcesByBot] = useState({});
  const [expandedAccessPanel, setExpandedAccessPanel] = useState('');

  useEffect(() => {
    const next = {};
    for (const item of items) {
      next[item.id] = createDraftFromBot(item);
    }
    setDrafts(next);
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    async function loadSources() {
      if (!manageEnabled || !items.length) {
        if (!cancelled) setSourcesByBot({});
        return;
      }
      const nextEntries = await Promise.all(items.map(async (item) => {
        try {
          const payload = await fetchChannelDirectorySources(item.id);
          return [item.id, Array.isArray(payload?.items) ? payload.items : []];
        } catch {
          return [item.id, []];
        }
      }));
      if (!cancelled) {
        setSourcesByBot(Object.fromEntries(nextEntries));
      }
    }
    void loadSources();
    return () => {
      cancelled = true;
    };
  }, [items, manageEnabled]);

  const sortedLibraries = useMemo(() => (
    [...libraries].sort((a, b) => {
      const levelDiff = Number(a?.permissionLevel || 0) - Number(b?.permissionLevel || 0);
      if (levelDiff !== 0) return levelDiff;
      return String(a?.label || a?.key || '').localeCompare(String(b?.label || b?.key || ''), 'zh-CN');
    })
  ), [libraries]);

  async function handleSave(botId) {
    const draft = drafts[botId];
    if (!draft) return;
    setSavingId(botId);
    setError('');
    setNotice('');
    try {
      const item = await onUpdate?.(botId, serializeDraft(draft));
      setNotice(`已保存机器人：${item?.name || botId}`);
    } catch (saveError) {
      setError(normalizeError(saveError, '保存机器人失败。'));
    } finally {
      setSavingId('');
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError('');
    setNotice('');
    try {
      const item = await onCreate?.(serializeDraft(createDraft));
      setCreateDraft(createEmptyDraft());
      setNotice(`已创建机器人：${item?.name || '新机器人'}`);
    } catch (createError) {
      setError(normalizeError(createError, '创建机器人失败。'));
    } finally {
      setCreating(false);
    }
  }

  async function reloadSources(botId) {
    try {
      const payload = await fetchChannelDirectorySources(botId);
      setSourcesByBot((prev) => ({
        ...prev,
        [botId]: Array.isArray(payload?.items) ? payload.items : [],
      }));
    } catch {
      setSourcesByBot((prev) => ({
        ...prev,
        [botId]: [],
      }));
    }
  }

  async function handleCreateSource(botId, payload) {
    const result = await createChannelDirectorySource(botId, payload);
    await reloadSources(botId);
    return result?.item || result;
  }

  async function handleUpdateSource(botId, sourceId, payload) {
    const result = await updateChannelDirectorySource(botId, sourceId, payload);
    await reloadSources(botId);
    return result?.item || result;
  }

  async function handleSyncSource(botId, sourceId) {
    const result = await syncChannelDirectorySource(botId, sourceId);
    await reloadSources(botId);
    return result;
  }

  return (
    <div className="bot-config-card">
      <div className="bot-config-head">
        <div>
          <strong>机器人配置</strong>
          <div className="bot-config-subtle">
            报表中心负责机器人治理。支持多个机器人并行，支持不同第三方渠道同时挂多个机器人。
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bot-config-empty">正在读取机器人配置...</div>
      ) : !manageEnabled ? (
        <div className="bot-config-empty">
          当前没有机器人管理权限，请先确认当前账号可管理机器人配置。
        </div>
      ) : (
        <>
          {notice ? <div className="bot-config-success">{notice}</div> : null}
          {error ? <div className="bot-config-error">{error}</div> : null}

          <div className="bot-config-section">
            <div className="bot-config-section-title">现有机器人</div>
            <div className="bot-config-list">
              {items.map((item) => (
                <BotEditorCard
                  key={item.id}
                  botId={item.id}
                  title={`${item.name} · ${item.id}`}
                  draft={drafts[item.id] || createDraftFromBot(item)}
                  libraries={sortedLibraries}
                  manageEnabled={manageEnabled}
                  directorySources={Array.isArray(sourcesByBot[item.id]) ? sourcesByBot[item.id] : []}
                  expandedAccessPanel={expandedAccessPanel}
                  onChange={(nextDraft) => setDrafts((prev) => ({ ...prev, [item.id]: nextDraft }))}
                  onCreateSource={(payload) => handleCreateSource(item.id, payload)}
                  onUpdateSource={(sourceId, payload) => handleUpdateSource(item.id, sourceId, payload)}
                  onSyncSource={(sourceId) => handleSyncSource(item.id, sourceId)}
                  onToggleAccessPanel={(panelKey) => setExpandedAccessPanel((prev) => (prev === panelKey ? '' : panelKey))}
                  actionLabel="保存"
                  actionPending={savingId === item.id}
                  onSubmit={() => handleSave(item.id)}
                />
              ))}
            </div>
          </div>

          <div className="bot-config-section">
            <div className="bot-config-section-title">新增机器人</div>
            <BotEditorCard
              title="新机器人"
              draft={createDraft}
              libraries={sortedLibraries}
              manageEnabled={manageEnabled}
              onChange={setCreateDraft}
              actionLabel="创建"
              actionPending={creating}
              onSubmit={handleCreate}
            />
          </div>
        </>
      )}
    </div>
  );
}
