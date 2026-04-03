'use client';

import { useEffect, useMemo, useState } from 'react';

const CHANNEL_OPTIONS = [
  { key: 'web', label: 'Web' },
  { key: 'wecom', label: '企业微信' },
  { key: 'teams', label: 'Microsoft Teams' },
];

function createEmptyDraft() {
  return {
    name: '',
    description: '',
    systemPrompt: '',
    enabled: true,
    isDefault: false,
    includeUngrouped: true,
    includeFailedParseDocuments: false,
    visibleLibraryKeys: [],
    channels: {
      web: true,
      wecom: false,
      teams: false,
    },
  };
}

function createDraftFromBot(bot) {
  const draft = createEmptyDraft();
  const bindings = Array.isArray(bot?.channelBindings) ? bot.channelBindings : [];
  for (const option of CHANNEL_OPTIONS) {
    const binding = bindings.find((item) => item?.channel === option.key);
    draft.channels[option.key] = binding ? binding.enabled !== false : option.key === 'web';
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
    visibleLibraryKeys: Array.isArray(draft?.visibleLibraryKeys) ? draft.visibleLibraryKeys : [],
    channelBindings: CHANNEL_OPTIONS.map((option) => ({
      channel: option.key,
      enabled: Boolean(draft?.channels?.[option.key]),
    })),
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

  useEffect(() => {
    const next = {};
    for (const item of items) {
      next[item.id] = createDraftFromBot(item);
    }
    setDrafts(next);
  }, [items]);

  const hasLibraries = useMemo(() => Array.isArray(libraries) && libraries.length > 0, [libraries]);

  function updateDraft(botId, updater) {
    setDrafts((prev) => ({
      ...prev,
      [botId]: updater(prev[botId] || createEmptyDraft()),
    }));
  }

  function updateCreateDraft(updater) {
    setCreateDraft((prev) => updater(prev));
  }

  async function handleSave(botId) {
    const draft = drafts[botId];
    if (!draft) return;
    setSavingId(botId);
    setError('');
    setNotice('');
    try {
      const item = await onUpdate?.(botId, serializeDraft(draft));
      setNotice(`已保存 Bot：${item?.name || botId}`);
    } catch (saveError) {
      setError(normalizeError(saveError, '保存 Bot 失败。'));
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
      setNotice(`已创建 Bot：${item?.name || '新 Bot'}`);
    } catch (createError) {
      setError(normalizeError(createError, '创建 Bot 失败。'));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="bot-config-card">
      <div className="bot-config-head">
        <div>
          <strong>Bot 配置</strong>
          <div className="bot-config-subtle">
            这里只在全智能模式密钥验证通过后开放，用于配置 Web、企业微信、Microsoft Teams 的 Bot 视图。
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bot-config-empty">正在读取 Bot 配置...</div>
      ) : !manageEnabled ? (
        <div className="bot-config-empty">
          当前还没有拿到全智能模式管理权限，请先完成密钥验证。
        </div>
      ) : (
        <>
          {notice ? <div className="bot-config-success">{notice}</div> : null}
          {error ? <div className="bot-config-error">{error}</div> : null}

          <div className="bot-config-section">
            <div className="bot-config-section-title">现有 Bot</div>
            <div className="bot-config-list">
              {items.map((item) => {
                const draft = drafts[item.id] || createDraftFromBot(item);
                return (
                  <div key={item.id} className="bot-card">
                    <div className="bot-card-head">
                      <div>
                        <strong>{item.name}</strong>
                        <div className="bot-config-subtle">ID：{item.id}</div>
                      </div>
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => handleSave(item.id)}
                        disabled={savingId === item.id}
                      >
                        {savingId === item.id ? '保存中...' : '保存'}
                      </button>
                    </div>

                    <div className="bot-field-grid">
                      <label className="bot-field">
                        <span>名称</span>
                        <input
                          value={draft.name}
                          onChange={(event) => updateDraft(item.id, (prev) => ({ ...prev, name: event.target.value }))}
                        />
                      </label>
                      <label className="bot-field">
                        <span>描述</span>
                        <input
                          value={draft.description}
                          onChange={(event) => updateDraft(item.id, (prev) => ({ ...prev, description: event.target.value }))}
                        />
                      </label>
                      <label className="bot-field bot-field-span">
                        <span>职责说明</span>
                        <textarea
                          rows={3}
                          value={draft.systemPrompt}
                          onChange={(event) => updateDraft(item.id, (prev) => ({ ...prev, systemPrompt: event.target.value }))}
                        />
                      </label>
                    </div>

                    <div className="bot-toggle-row">
                      <label className="bot-toggle">
                        <input
                          type="checkbox"
                          checked={draft.enabled}
                          onChange={(event) => updateDraft(item.id, (prev) => ({ ...prev, enabled: event.target.checked }))}
                        />
                        <span>启用</span>
                      </label>
                      <label className="bot-toggle">
                        <input
                          type="checkbox"
                          checked={draft.isDefault}
                          onChange={(event) => updateDraft(item.id, (prev) => ({ ...prev, isDefault: event.target.checked }))}
                        />
                        <span>默认 Bot</span>
                      </label>
                      <label className="bot-toggle">
                        <input
                          type="checkbox"
                          checked={draft.includeUngrouped}
                          onChange={(event) => updateDraft(item.id, (prev) => ({ ...prev, includeUngrouped: event.target.checked }))}
                        />
                        <span>允许未分组文档</span>
                      </label>
                      <label className="bot-toggle">
                        <input
                          type="checkbox"
                          checked={draft.includeFailedParseDocuments}
                          onChange={(event) => updateDraft(item.id, (prev) => ({ ...prev, includeFailedParseDocuments: event.target.checked }))}
                        />
                        <span>允许失败文档</span>
                      </label>
                    </div>

                    <div className="bot-chip-group">
                      <div className="bot-chip-group-title">渠道绑定</div>
                      <div className="bot-chip-grid">
                        {CHANNEL_OPTIONS.map((option) => (
                          <label key={option.key} className={`bot-chip ${draft.channels[option.key] ? 'active' : ''}`}>
                            <input
                              type="checkbox"
                              checked={draft.channels[option.key]}
                              onChange={(event) => updateDraft(item.id, (prev) => ({
                                ...prev,
                                channels: {
                                  ...prev.channels,
                                  [option.key]: event.target.checked,
                                },
                              }))}
                            />
                            <span>{option.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="bot-chip-group">
                      <div className="bot-chip-group-title">可见知识库</div>
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
                                  onChange={() => updateDraft(item.id, (prev) => ({
                                    ...prev,
                                    visibleLibraryKeys: toggleListValue(prev.visibleLibraryKeys, libraryKey),
                                  }))}
                                />
                                <span>{library.label || library.name || library.key}</span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="bot-config-subtle">当前还没有可选知识库。</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bot-config-section">
            <div className="bot-config-section-title">新增 Bot</div>
            <div className="bot-card">
              <div className="bot-field-grid">
                <label className="bot-field">
                  <span>名称</span>
                  <input
                    value={createDraft.name}
                    onChange={(event) => updateCreateDraft((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="例如：企业微信助手"
                  />
                </label>
                <label className="bot-field">
                  <span>描述</span>
                  <input
                    value={createDraft.description}
                    onChange={(event) => updateCreateDraft((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="例如：面向企业微信渠道的合同助手"
                  />
                </label>
                <label className="bot-field bot-field-span">
                  <span>职责说明</span>
                  <textarea
                    rows={3}
                    value={createDraft.systemPrompt}
                    onChange={(event) => updateCreateDraft((prev) => ({ ...prev, systemPrompt: event.target.value }))}
                    placeholder="描述这个 Bot 的职责、边界和偏好。"
                  />
                </label>
              </div>

              <div className="bot-toggle-row">
                <label className="bot-toggle">
                  <input
                    type="checkbox"
                    checked={createDraft.enabled}
                    onChange={(event) => updateCreateDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
                  />
                  <span>启用</span>
                </label>
                <label className="bot-toggle">
                  <input
                    type="checkbox"
                    checked={createDraft.isDefault}
                    onChange={(event) => updateCreateDraft((prev) => ({ ...prev, isDefault: event.target.checked }))}
                  />
                  <span>设为默认 Bot</span>
                </label>
                <label className="bot-toggle">
                  <input
                    type="checkbox"
                    checked={createDraft.includeUngrouped}
                    onChange={(event) => updateCreateDraft((prev) => ({ ...prev, includeUngrouped: event.target.checked }))}
                  />
                  <span>允许未分组文档</span>
                </label>
                <label className="bot-toggle">
                  <input
                    type="checkbox"
                    checked={createDraft.includeFailedParseDocuments}
                    onChange={(event) => updateCreateDraft((prev) => ({ ...prev, includeFailedParseDocuments: event.target.checked }))}
                  />
                  <span>允许失败文档</span>
                </label>
              </div>

              <div className="bot-chip-group">
                <div className="bot-chip-group-title">渠道绑定</div>
                <div className="bot-chip-grid">
                  {CHANNEL_OPTIONS.map((option) => (
                    <label key={option.key} className={`bot-chip ${createDraft.channels[option.key] ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={createDraft.channels[option.key]}
                        onChange={(event) => updateCreateDraft((prev) => ({
                          ...prev,
                          channels: {
                            ...prev.channels,
                            [option.key]: event.target.checked,
                          },
                        }))}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bot-chip-group">
                <div className="bot-chip-group-title">可见知识库</div>
                {hasLibraries ? (
                  <div className="bot-chip-grid">
                    {libraries.map((library) => {
                      const libraryKey = library.key;
                      const active = createDraft.visibleLibraryKeys.includes(libraryKey);
                      return (
                        <label key={libraryKey} className={`bot-chip ${active ? 'active' : ''}`}>
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={() => updateCreateDraft((prev) => ({
                              ...prev,
                              visibleLibraryKeys: toggleListValue(prev.visibleLibraryKeys, libraryKey),
                            }))}
                          />
                          <span>{library.label || library.name || library.key}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bot-config-subtle">当前还没有可选知识库。</div>
                )}
              </div>

              <div className="bot-config-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  {creating ? '创建中...' : '创建 Bot'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
