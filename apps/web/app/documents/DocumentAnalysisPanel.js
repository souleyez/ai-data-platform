'use client';

import { useMemo, useState } from 'react';

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function readJson(response) {
  return response.text().then((text) => {
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function DocumentAnalysisPanel({ item: initialItem }) {
  const [item, setItem] = useState(initialItem);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summaryDraft, setSummaryDraft] = useState(String(initialItem?.summary || ''));
  const [structuredDraft, setStructuredDraft] = useState(safeJsonStringify(initialItem?.structuredProfile || {}));
  const [evidenceDraft, setEvidenceDraft] = useState(safeJsonStringify(initialItem?.evidenceChunks || []));

  const evidenceCount = Array.isArray(item?.evidenceChunks) ? item.evidenceChunks.length : 0;
  const detailMeta = useMemo(() => ([
    { label: '深度解析状态', value: item?.detailParseStatus || '-' },
    { label: '最近解析时间', value: formatDateTime(item?.detailParsedAt) },
    { label: '手工编辑时间', value: formatDateTime(item?.analysisEditedAt) },
    { label: '证据块数量', value: String(evidenceCount) },
  ]), [evidenceCount, item?.analysisEditedAt, item?.detailParseStatus, item?.detailParsedAt]);

  function handleStartEdit() {
    setSummaryDraft(String(item?.summary || ''));
    setStructuredDraft(safeJsonStringify(item?.structuredProfile || {}));
    setEvidenceDraft(safeJsonStringify(item?.evidenceChunks || []));
    setError('');
    setNotice('');
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setError('');
    setNotice('');
    setSummaryDraft(String(item?.summary || ''));
    setStructuredDraft(safeJsonStringify(item?.structuredProfile || {}));
    setEvidenceDraft(safeJsonStringify(item?.evidenceChunks || []));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const payload = {
        summary: String(summaryDraft || '').trim(),
        structuredProfile: JSON.parse(structuredDraft || '{}'),
        evidenceChunks: JSON.parse(evidenceDraft || '[]'),
      };

      const response = await fetch(`/api/documents/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error || '保存解析结果失败');
      }

      setItem(data?.item || item);
      setEditing(false);
      setNotice(data?.message || '解析结果已更新');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存解析结果失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card documents-card">
      <div className="panel-header">
        <div>
          <h3>解析结果</h3>
          <p>查看摘要、结构化结果和证据块；必要时可手工修正，帮助后续问答与输出更准确。</p>
        </div>
        {!editing ? (
          <button type="button" className="ghost-btn" onClick={handleStartEdit}>
            编辑解析结果
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="ghost-btn" onClick={handleCancel} disabled={saving}>
              取消
            </button>
            <button type="button" className="primary-btn" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存解析结果'}
            </button>
          </div>
        )}
      </div>

      {notice ? <div className="page-note">{notice}</div> : null}
      {error ? <div className="bot-config-error">{error}</div> : null}

      <div className="message-refs" style={{ marginBottom: 16 }}>
        {detailMeta.map((entry) => (
          <span key={entry.label} className="source-chip">
            {entry.label}：{entry.value}
          </span>
        ))}
      </div>

      {!editing ? (
        <div style={{ display: 'grid', gap: 16 }}>
          <section>
            <h4 style={{ marginBottom: 8 }}>解析摘要</h4>
            <div className="preview-meta-line" style={{ whiteSpace: 'pre-wrap' }}>
              {item?.summary || '-'}
            </div>
          </section>

          <section>
            <h4 style={{ marginBottom: 8 }}>结构化结果</h4>
            <pre className="code-block" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {safeJsonStringify(item?.structuredProfile || {})}
            </pre>
          </section>

          <section>
            <h4 style={{ marginBottom: 8 }}>证据块</h4>
            <pre className="code-block" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {safeJsonStringify(item?.evidenceChunks || [])}
            </pre>
          </section>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <label style={{ display: 'grid', gap: 8 }}>
            <span>解析摘要</span>
            <textarea
              className="chat-constraints-input"
              rows={4}
              value={summaryDraft}
              onChange={(event) => setSummaryDraft(event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: 8 }}>
            <span>结构化结果 JSON</span>
            <textarea
              className="chat-constraints-input"
              rows={14}
              value={structuredDraft}
              onChange={(event) => setStructuredDraft(event.target.value)}
              spellCheck={false}
            />
          </label>

          <label style={{ display: 'grid', gap: 8 }}>
            <span>证据块 JSON</span>
            <textarea
              className="chat-constraints-input"
              rows={14}
              value={evidenceDraft}
              onChange={(event) => setEvidenceDraft(event.target.value)}
              spellCheck={false}
            />
          </label>
        </div>
      )}
    </section>
  );
}
