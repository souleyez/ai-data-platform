'use client';

import { useEffect, useState } from 'react';
import {
  fetchChannelDirectorySubjectDetail,
  patchChannelDirectoryPolicies,
  previewChannelDirectoryAccess,
  searchChannelDirectorySubjects,
} from '../home-api';
import ExternalSubjectLibraryEditor from './ExternalSubjectLibraryEditor';

function normalizeError(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export default function ExternalUserAccessPanel({
  botId,
  sourceId,
  libraries = [],
  manageEnabled = false,
}) {
  const [query, setQuery] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [subject, setSubject] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function loadSubjects(options = {}) {
    if (!botId || !sourceId) return;
    setLoading(true);
    setError('');
    try {
      const payload = await searchChannelDirectorySubjects(botId, sourceId, {
        query: options.query ?? query,
        type: options.type ?? subjectType,
      });
      setItems(Array.isArray(payload?.items) ? payload.items : []);
    } catch (loadError) {
      setError(normalizeError(loadError, '读取外部用户目录失败。'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSubjectDetail(nextSubjectType, nextSubjectId) {
    if (!botId || !sourceId || !nextSubjectType || !nextSubjectId) return;
    setError('');
    try {
      const [detailPayload, previewPayload] = await Promise.all([
        fetchChannelDirectorySubjectDetail(botId, sourceId, nextSubjectType, nextSubjectId),
        previewChannelDirectoryAccess(botId, sourceId, { senderId: nextSubjectId }),
      ]);
      setSubject(detailPayload?.item || null);
      setPreview(previewPayload?.item || null);
      setSelectedKey(`${nextSubjectType}:${nextSubjectId}`);
    } catch (loadError) {
      setError(normalizeError(loadError, '读取外部用户权限详情失败。'));
    }
  }

  useEffect(() => {
    setItems([]);
    setSelectedKey('');
    setSubject(null);
    setPreview(null);
    if (botId && sourceId) {
      void loadSubjects({ query: '', type: '' });
    }
  }, [botId, sourceId]);

  async function handleSaveLibraries(visibleLibraryKeys) {
    if (!botId || !sourceId || !subject) return;
    setSaving(true);
    setNotice('');
    setError('');
    try {
      await patchChannelDirectoryPolicies(botId, sourceId, {
        updatedBy: 'web-panel',
        items: [{
          subjectType: subject.subjectType,
          subjectId: subject.subjectId,
          visibleLibraryKeys,
        }],
      });
      await loadSubjectDetail(subject.subjectType, subject.subjectId);
      await loadSubjects();
      setNotice('外部用户文档权限已保存。');
    } catch (saveError) {
      setError(normalizeError(saveError, '保存外部用户文档权限失败。'));
    } finally {
      setSaving(false);
    }
  }

  if (!sourceId) return null;

  return (
    <div className="bot-chip-group">
      <div className="bot-chip-group-title">外部用户 / 用户组文档权限</div>
      <div className="bot-config-subtle">
        搜索外部目录中的用户或用户组，并配置它们在当前机器人下可访问的文档库。
      </div>
      {notice ? <div className="bot-config-success">{notice}</div> : null}
      {error ? <div className="bot-config-error">{error}</div> : null}

      <div className="bot-field-grid">
        <label className="bot-field">
          <span>搜索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入用户姓名、ID 或用户组名称" />
        </label>
        <label className="bot-field">
          <span>类型</span>
          <select value={subjectType} onChange={(event) => setSubjectType(event.target.value)}>
            <option value="">全部</option>
            <option value="user">用户</option>
            <option value="group">用户组</option>
          </select>
        </label>
        <div className="bot-field bot-field-readonly">
          <span>操作</span>
          <div className="report-template-actions">
            <button type="button" className="ghost-btn" disabled={!manageEnabled || loading} onClick={() => void loadSubjects()}>
              {loading ? '搜索中...' : '刷新目录'}
            </button>
          </div>
        </div>
      </div>

      <div className="connected-bot-editor-grid">
        <div className="connected-bot-editor-card">
          <div className="bot-chip-group-title">目录对象</div>
          <div className="connected-bot-editor-list">
            {items.length ? items.map((item) => {
              const selected = selectedKey === `${item.subjectType}:${item.subjectId}`;
              return (
                <button
                  key={`${item.subjectType}:${item.subjectId}`}
                  type="button"
                  className={`bot-chip ${selected ? 'active' : ''}`}
                  onClick={() => void loadSubjectDetail(item.subjectType, item.subjectId)}
                >
                  <span>{item.name || item.subjectId}</span>
                </button>
              );
            }) : (
              <div className="bot-config-subtle">当前没有匹配的用户或用户组。</div>
            )}
          </div>
        </div>

        <ExternalSubjectLibraryEditor
          subject={subject}
          preview={preview}
          libraries={libraries}
          manageEnabled={manageEnabled}
          saving={saving}
          onSave={handleSaveLibraries}
        />
      </div>
    </div>
  );
}
