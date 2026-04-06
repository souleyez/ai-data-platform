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

function formatFieldValue(value) {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item || '').trim()).filter(Boolean);
    return items.length ? items.join(' / ') : '-';
  }
  const text = String(value ?? '').trim();
  return text || '-';
}

function extractFieldDetails(profile) {
  const details = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile.fieldDetails
    : null;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];

  return Object.entries(details)
    .map(([key, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      return {
        key,
        value: value.value,
        confidence: typeof value.confidence === 'number' ? value.confidence : null,
        source: String(value.source || '').trim(),
        evidenceChunkId: String(value.evidenceChunkId || '').trim(),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.key.localeCompare(right.key, 'zh-CN'));
}

function extractTableSummary(profile) {
  const summary = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile.tableSummary
    : null;
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;

  return {
    format: String(summary.format || '').trim(),
    rowCount: typeof summary.rowCount === 'number' ? summary.rowCount : null,
    columnCount: typeof summary.columnCount === 'number' ? summary.columnCount : null,
    columns: Array.isArray(summary.columns) ? summary.columns.map((item) => String(item || '').trim()).filter(Boolean) : [],
    primarySheetName: String(summary.primarySheetName || '').trim(),
    sheetCount: typeof summary.sheetCount === 'number' ? summary.sheetCount : null,
    sampleRows: Array.isArray(summary.sampleRows) ? summary.sampleRows.slice(0, 3) : [],
  };
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
  const fieldDetails = useMemo(
    () => extractFieldDetails(item?.structuredProfile || {}),
    [item?.structuredProfile],
  );
  const tableSummary = useMemo(
    () => extractTableSummary(item?.structuredProfile || {}),
    [item?.structuredProfile],
  );
  const detailMeta = useMemo(() => ([
    { label: '深度解析状态', value: item?.detailParseStatus || '-' },
    { label: '最近解析时间', value: formatDateTime(item?.detailParsedAt) },
    { label: '手工编辑时间', value: formatDateTime(item?.analysisEditedAt) },
    { label: '证据块数量', value: String(evidenceCount) },
    { label: '字段元数据数量', value: String(fieldDetails.length) },
    { label: '表格摘要', value: tableSummary ? '已提取' : '无' },
  ]), [evidenceCount, fieldDetails.length, item?.analysisEditedAt, item?.detailParseStatus, item?.detailParsedAt, tableSummary]);

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
          <p>查看摘要、结构化结果、字段置信度和证据块；必要时可手工修正，帮助后续问答与输出更准确。</p>
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
            <h4 style={{ marginBottom: 8 }}>字段置信度与来源</h4>
            {fieldDetails.length ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {fieldDetails.map((entry) => (
                  <div key={entry.key} className="bot-summary-card">
                    <div style={{ display: 'grid', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <strong>{entry.key}</strong>
                        <span className="source-chip">
                          置信度：{entry.confidence == null ? '-' : `${Math.round(entry.confidence * 100)}%`}
                        </span>
                      </div>
                      <div className="preview-meta-line">{formatFieldValue(entry.value)}</div>
                      <div className="message-refs">
                        <span className="source-chip">来源：{entry.source || '-'}</span>
                        {entry.evidenceChunkId ? (
                          <span className="source-chip">证据块：{entry.evidenceChunkId}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="preview-meta-line">暂无字段元数据，可先重新解析或手工在 JSON 中补充。</div>
            )}
          </section>

          {tableSummary ? (
            <section>
              <h4 style={{ marginBottom: 8 }}>表格摘要</h4>
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="message-refs">
                  <span className="source-chip">格式：{tableSummary.format || '-'}</span>
                  <span className="source-chip">数据行：{tableSummary.rowCount == null ? '-' : tableSummary.rowCount}</span>
                  <span className="source-chip">列数：{tableSummary.columnCount == null ? '-' : tableSummary.columnCount}</span>
                  {tableSummary.sheetCount ? (
                    <span className="source-chip">工作表：{tableSummary.sheetCount}</span>
                  ) : null}
                  {tableSummary.primarySheetName ? (
                    <span className="source-chip">主表：{tableSummary.primarySheetName}</span>
                  ) : null}
                </div>
                {tableSummary.columns.length ? (
                  <div className="preview-meta-line">列名：{tableSummary.columns.join(' / ')}</div>
                ) : null}
                {tableSummary.sampleRows.length ? (
                  <pre className="code-block" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {safeJsonStringify(tableSummary.sampleRows)}
                  </pre>
                ) : null}
              </div>
            </section>
          ) : null}

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
              rows={16}
              value={structuredDraft}
              onChange={(event) => setStructuredDraft(event.target.value)}
              spellCheck={false}
            />
          </label>

          <label style={{ display: 'grid', gap: 8 }}>
            <span>证据块 JSON</span>
            <textarea
              className="chat-constraints-input"
              rows={16}
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
