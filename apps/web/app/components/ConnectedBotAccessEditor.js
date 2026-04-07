'use client';

import { useEffect, useMemo, useState } from 'react';
import { filterConnectedBots } from './ConnectedBotsSummary';

const CHANNEL_LABELS = {
  web: '工作台',
  wecom: '企业微信',
  teams: 'Microsoft Teams',
  qq: 'QQ',
  feishu: '飞书',
};

function formatBotChannels(item) {
  const bindings = Array.isArray(item?.channelBindings) ? item.channelBindings : [];
  return bindings
    .filter((binding) => binding?.enabled !== false && binding?.channel !== 'web')
    .map((binding) => CHANNEL_LABELS[binding.channel] || binding.channel)
    .join(' / ');
}

function buildDraft(item) {
  return {
    systemPrompt: String(item?.systemPrompt || item?.systemPromptSummary || '').trim(),
    libraryAccessLevel: Number.isFinite(Number(item?.libraryAccessLevel))
      ? Math.max(0, Math.floor(Number(item.libraryAccessLevel)))
      : 0,
    visibleLibraryKeys: Array.isArray(item?.visibleLibraryKeys) ? item.visibleLibraryKeys : [],
    isDefault: item?.isDefault === true,
  };
}

function toggleListValue(values, value) {
  const next = new Set(Array.isArray(values) ? values : []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next];
}

function formatLibraryLabel(library) {
  const label = library?.label || library?.name || library?.key || '未命名知识库';
  const permissionLevel = Number.isFinite(Number(library?.permissionLevel))
    ? Math.max(0, Math.floor(Number(library.permissionLevel)))
    : 0;
  return `${label} · L${permissionLevel}`;
}

export default function ConnectedBotAccessEditor({
  items = [],
  libraries = [],
  manageEnabled = false,
  onSave,
}) {
  const connectedBots = filterConnectedBots(items);
  const sortedLibraries = useMemo(() => (
    [...libraries].sort((a, b) => {
      const levelDiff = Number(a?.permissionLevel || 0) - Number(b?.permissionLevel || 0);
      if (levelDiff !== 0) return levelDiff;
      return String(a?.label || a?.key || '').localeCompare(String(b?.label || b?.key || ''), 'zh-CN');
    })
  ), [libraries]);
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const nextDrafts = {};
    for (const item of connectedBots) {
      nextDrafts[item.id] = buildDraft(item);
    }
    setDrafts(nextDrafts);
  }, [items]);

  async function handleSave(item) {
    const draft = drafts[item.id];
    if (!draft || !onSave) return;
    setSavingId(item.id);
    setNotice('');
    setError('');
    try {
      await onSave(item.id, {
        systemPrompt: String(draft.systemPrompt || '').trim(),
        libraryAccessLevel: Math.max(0, Math.floor(Number(draft.libraryAccessLevel || 0))),
        visibleLibraryKeys: Array.isArray(draft.visibleLibraryKeys) ? draft.visibleLibraryKeys : [],
        isDefault: draft.isDefault === true,
      });
      setNotice(`已更新机器人：${item.name || item.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存机器人配置失败。');
    } finally {
      setSavingId('');
    }
  }

  if (!connectedBots.length) return null;

  return (
    <div className="connected-bot-editor">
      {notice ? <div className="bot-config-success">{notice}</div> : null}
      {error ? <div className="bot-config-error">{error}</div> : null}
      <div className="connected-bot-editor-list">
        {connectedBots.map((item) => {
          const draft = drafts[item.id] || buildDraft(item);
          return (
            <article key={item.id} className="connected-bot-editor-card">
              <div className="connected-bot-head">
                <div>
                  <strong>{item.name || item.id}</strong>
                  <div className="connected-bot-meta">
                    {formatBotChannels(item) || '未识别外部渠道'}
                  </div>
                </div>
                <button
                  type="button"
                  className="primary-btn"
                  disabled={!manageEnabled || savingId === item.id}
                  onClick={() => void handleSave(item)}
                >
                  {savingId === item.id ? '保存中...' : '保存'}
                </button>
              </div>

              <div className="connected-bot-editor-grid">
                <label className="bot-field">
                  <span>文档权限等级</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={!manageEnabled}
                    value={draft.libraryAccessLevel}
                    onChange={(event) => setDrafts((prev) => ({
                      ...prev,
                      [item.id]: {
                        ...draft,
                        libraryAccessLevel: Math.max(0, Math.floor(Number(event.target.value || 0))),
                      },
                    }))}
                  />
                </label>

                <label className="bot-toggle bot-toggle-editor">
                  <input
                    type="checkbox"
                    disabled={!manageEnabled}
                    checked={draft.isDefault}
                    onChange={(event) => setDrafts((prev) => ({
                      ...prev,
                      [item.id]: {
                        ...draft,
                        isDefault: event.target.checked,
                      },
                    }))}
                  />
                  <span>设为默认机器人</span>
                </label>

                <label className="bot-field connected-bot-editor-prompt">
                  <span>自然语言约束</span>
                  <textarea
                    rows={3}
                    disabled={!manageEnabled}
                    placeholder="例如：回答更简洁；优先引用合同库；不要主动生成 PPT。"
                    value={draft.systemPrompt}
                    onChange={(event) => setDrafts((prev) => ({
                      ...prev,
                      [item.id]: {
                        ...draft,
                        systemPrompt: event.target.value,
                      },
                    }))}
                  />
                </label>
              </div>

              <div className="bot-chip-group">
                <div className="bot-chip-group-title">指定文档库权限（可选）</div>
                <div className="bot-config-subtle">
                  不选时按权限等级可见；选中后会进一步限定到这些文档库。
                </div>
                {sortedLibraries.length ? (
                  <div className="bot-chip-grid">
                    {sortedLibraries.map((library) => {
                      const libraryKey = library.key;
                      const active = draft.visibleLibraryKeys.includes(libraryKey);
                      return (
                        <label key={libraryKey} className={`bot-chip ${active ? 'active' : ''}`}>
                          <input
                            type="checkbox"
                            disabled={!manageEnabled}
                            checked={active}
                            onChange={() => setDrafts((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...draft,
                                visibleLibraryKeys: toggleListValue(draft.visibleLibraryKeys, libraryKey),
                              },
                            }))}
                          />
                          <span>{formatLibraryLabel(library)}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bot-config-subtle">当前没有可选文档库。</div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
