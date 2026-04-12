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

function resolveCanonicalSource(item) {
  if (String(item?.markdownText || '').trim()) {
    return String(item?.markdownMethod || '').trim() === 'existing-markdown'
      ? 'existing-markdown'
      : 'markitdown';
  }
  const parseMethod = String(item?.parseMethod || '').trim().toLowerCase();
  if (String(item?.fullText || '').trim()) {
    if (parseMethod.includes('presentation-vlm')) return 'vlm-presentation';
    if (parseMethod.includes('pdf-vlm')) return 'vlm-pdf';
    if (parseMethod.includes('image-vlm') || parseMethod.includes('image-ocr+vlm')) return 'vlm-image';
    return 'legacy-full-text';
  }
  return 'none';
}

function formatCanonicalSource(value) {
  switch (String(value || '').trim()) {
    case 'existing-markdown':
      return '现成 Markdown';
    case 'markitdown':
      return 'MarkItDown';
    case 'legacy-full-text':
      return '旧正文';
    case 'vlm-image':
      return '图片 VLM';
    case 'vlm-pdf':
      return 'PDF VLM';
    case 'vlm-presentation':
      return '演示页 VLM';
    case 'none':
      return '未生成';
    default:
      return '-';
  }
}

function formatCanonicalStatus(value) {
  switch (String(value || '').trim()) {
    case 'ready':
      return '已就绪';
    case 'fallback_full_text':
      return '正文可用（旧正文）';
    case 'failed':
      return 'Canonical 失败';
    case 'unsupported':
      return '不支持';
    default:
      return '-';
  }
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
    recordKeyField: String(summary.recordKeyField || '').trim(),
    recordFieldRoles: summary.recordFieldRoles && typeof summary.recordFieldRoles === 'object' && !Array.isArray(summary.recordFieldRoles)
      ? summary.recordFieldRoles
      : {},
    recordInsights: summary.recordInsights && typeof summary.recordInsights === 'object' && !Array.isArray(summary.recordInsights)
      ? summary.recordInsights
      : {},
    sampleRows: Array.isArray(summary.sampleRows) ? summary.sampleRows.slice(0, 3) : [],
    recordRows: Array.isArray(summary.recordRows) ? summary.recordRows.slice(0, 5) : [],
  };
}

function extractFieldTemplate(profile) {
  const template = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile.fieldTemplate
    : null;
  if (!template || typeof template !== 'object' || Array.isArray(template)) return null;

  return {
    fieldSet: String(template.fieldSet || '').trim(),
    preferredFieldKeys: Array.isArray(template.preferredFieldKeys)
      ? template.preferredFieldKeys.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    requiredFieldKeys: Array.isArray(template.requiredFieldKeys)
      ? template.requiredFieldKeys.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    fieldAliases: template.fieldAliases && typeof template.fieldAliases === 'object' && !Array.isArray(template.fieldAliases)
      ? template.fieldAliases
      : {},
    fieldPrompts: template.fieldPrompts && typeof template.fieldPrompts === 'object' && !Array.isArray(template.fieldPrompts)
      ? template.fieldPrompts
      : {},
    fieldNormalizationRules: template.fieldNormalizationRules && typeof template.fieldNormalizationRules === 'object' && !Array.isArray(template.fieldNormalizationRules)
      ? template.fieldNormalizationRules
      : {},
    fieldConflictStrategies: template.fieldConflictStrategies && typeof template.fieldConflictStrategies === 'object' && !Array.isArray(template.fieldConflictStrategies)
      ? template.fieldConflictStrategies
      : {},
  };
}

function extractFocusedFieldEntries(profile) {
  const entries = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile.focusedFieldEntries
    : null;
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      return {
        key: String(entry.key || '').trim(),
        alias: String(entry.alias || '').trim(),
        required: Boolean(entry.required),
        value: entry.value,
        confidence: typeof entry.confidence === 'number' ? entry.confidence : null,
        source: String(entry.source || '').trim(),
        evidenceChunkId: String(entry.evidenceChunkId || '').trim(),
      };
    })
    .filter(Boolean);
}

function extractImageUnderstanding(profile) {
  const value = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile.imageUnderstanding
    : null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  return {
    documentKind: String(value.documentKind || '').trim(),
    layoutType: String(value.layoutType || '').trim(),
    visualSummary: String(value.visualSummary || '').trim(),
    chartOrTableDetected: Boolean(value.chartOrTableDetected),
    tableLikeSignals: Array.isArray(value.tableLikeSignals)
      ? value.tableLikeSignals.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
}

function extractFeedbackSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

  return {
    schemaType: String(snapshot.schemaType || '').trim(),
    updatedAt: String(snapshot.updatedAt || '').trim(),
    fieldCount: typeof snapshot.fieldCount === 'number' ? snapshot.fieldCount : 0,
    totalValueCount: typeof snapshot.totalValueCount === 'number' ? snapshot.totalValueCount : 0,
    matchedFieldCount: typeof snapshot.matchedFieldCount === 'number' ? snapshot.matchedFieldCount : 0,
    fields: Array.isArray(snapshot.fields)
      ? snapshot.fields
        .map((field) => {
          if (!field || typeof field !== 'object' || Array.isArray(field)) return null;
          return {
            name: String(field.name || '').trim(),
            values: Array.isArray(field.values) ? field.values.map((item) => String(item || '').trim()).filter(Boolean) : [],
            valueCount: typeof field.valueCount === 'number' ? field.valueCount : 0,
            matchedValues: Array.isArray(field.matchedValues) ? field.matchedValues.map((item) => String(item || '').trim()).filter(Boolean) : [],
            matchedValueCount: typeof field.matchedValueCount === 'number' ? field.matchedValueCount : 0,
          };
        })
        .filter(Boolean)
      : [],
  };
}

function extractLibraryKnowledgeSummaries(summaries) {
  if (!Array.isArray(summaries)) return [];
  return summaries
    .map((summary) => {
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return null;
      return {
        libraryKey: String(summary.libraryKey || '').trim(),
        libraryLabel: String(summary.libraryLabel || '').trim(),
        updatedAt: String(summary.updatedAt || '').trim(),
        documentCount: typeof summary.documentCount === 'number' ? summary.documentCount : 0,
        overview: String(summary.overview || '').trim(),
        keyTopics: Array.isArray(summary.keyTopics) ? summary.keyTopics.map((item) => String(item || '').trim()).filter(Boolean) : [],
        keyFacts: Array.isArray(summary.keyFacts) ? summary.keyFacts.map((item) => String(item || '').trim()).filter(Boolean) : [],
        focusedFieldSet: String(summary.focusedFieldSet || '').trim(),
        focusedFieldCoverage: Array.isArray(summary.focusedFieldCoverage)
          ? summary.focusedFieldCoverage
            .map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
              return {
                key: String(entry.key || '').trim(),
                alias: String(entry.alias || '').trim(),
                prompt: String(entry.prompt || '').trim(),
                conflictStrategy: String(entry.conflictStrategy || '').trim(),
                populatedDocumentCount: typeof entry.populatedDocumentCount === 'number' ? entry.populatedDocumentCount : 0,
                totalDocumentCount: typeof entry.totalDocumentCount === 'number' ? entry.totalDocumentCount : 0,
                coverageRatio: typeof entry.coverageRatio === 'number' ? entry.coverageRatio : 0,
                resolvedValues: Array.isArray(entry.resolvedValues) ? entry.resolvedValues.map((item) => String(item || '').trim()).filter(Boolean) : [],
              };
            })
            .filter(Boolean)
          : [],
        fieldConflicts: Array.isArray(summary.fieldConflicts)
          ? summary.fieldConflicts
            .map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
              return {
                key: String(entry.key || '').trim(),
                alias: String(entry.alias || '').trim(),
                conflictStrategy: String(entry.conflictStrategy || '').trim(),
                values: Array.isArray(entry.values) ? entry.values.map((item) => String(item || '').trim()).filter(Boolean) : [],
                sampleDocumentTitles: Array.isArray(entry.sampleDocumentTitles)
                  ? entry.sampleDocumentTitles.map((item) => String(item || '').trim()).filter(Boolean)
                  : [],
              };
            })
            .filter(Boolean)
          : [],
        representativeDocuments: Array.isArray(summary.representativeDocuments)
          ? summary.representativeDocuments.map((entry) => ({
            title: String(entry?.title || '').trim(),
            summary: String(entry?.summary || '').trim(),
          })).filter((entry) => entry.title)
          : [],
        recentUpdates: Array.isArray(summary.recentUpdates)
          ? summary.recentUpdates.map((entry) => ({
            title: String(entry?.title || '').trim(),
            summary: String(entry?.summary || '').trim(),
            updatedAt: String(entry?.updatedAt || '').trim(),
          })).filter((entry) => entry.title)
          : [],
        pilotValidated: Boolean(summary.pilotValidated),
      };
    })
    .filter(Boolean);
}

export default function DocumentAnalysisPanel({
  item: initialItem,
  feedbackSnapshot: initialFeedbackSnapshot,
  libraryKnowledge: initialLibraryKnowledge,
}) {
  const [item, setItem] = useState(initialItem);
  const [feedbackSnapshot, setFeedbackSnapshot] = useState(extractFeedbackSnapshot(initialFeedbackSnapshot));
  const [libraryKnowledge, setLibraryKnowledge] = useState(extractLibraryKnowledgeSummaries(initialLibraryKnowledge));
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backfillingCanonical, setBackfillingCanonical] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [clearingFeedback, setClearingFeedback] = useState('');
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
  const fieldTemplate = useMemo(
    () => extractFieldTemplate(item?.structuredProfile || {}),
    [item?.structuredProfile],
  );
  const focusedFieldEntries = useMemo(
    () => extractFocusedFieldEntries(item?.structuredProfile || {}),
    [item?.structuredProfile],
  );
  const imageUnderstanding = useMemo(
    () => extractImageUnderstanding(item?.structuredProfile || {}),
    [item?.structuredProfile],
  );
  const detailMeta = useMemo(() => ([
    { label: '解析链路', value: item?.parseMethod || '-' },
    { label: 'Canonical 来源', value: formatCanonicalSource(resolveCanonicalSource(item)) },
    { label: 'Canonical 状态', value: formatCanonicalStatus(item?.canonicalParseStatus) },
    { label: 'Markdown 方法', value: item?.markdownMethod || '-' },
    { label: 'Markdown 时间', value: formatDateTime(item?.markdownGeneratedAt) },
    { label: '深度解析状态', value: item?.detailParseStatus || '-' },
    { label: '最近解析时间', value: formatDateTime(item?.detailParsedAt) },
    { label: '视觉模型', value: item?.cloudStructuredModel || '-' },
    { label: '手工编辑时间', value: formatDateTime(item?.analysisEditedAt) },
    { label: '证据块数量', value: String(evidenceCount) },
    { label: '字段元数据数量', value: String(fieldDetails.length) },
    { label: '表格摘要', value: tableSummary ? '已提取' : '无' },
  ]), [evidenceCount, fieldDetails.length, item, item?.analysisEditedAt, item?.cloudStructuredModel, item?.detailParseStatus, item?.detailParsedAt, item?.markdownGeneratedAt, item?.markdownMethod, item?.parseMethod, tableSummary]);
  const canReparse = item?.parseStatus === 'error' || item?.detailParseStatus === 'failed';

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
      setFeedbackSnapshot(extractFeedbackSnapshot(data?.feedbackSnapshot || feedbackSnapshot));
      setLibraryKnowledge(extractLibraryKnowledgeSummaries(data?.libraryKnowledge || libraryKnowledge));
      setEditing(false);
      setNotice(data?.message || '解析结果已更新');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存解析结果失败');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearFeedback(fieldName) {
    setClearingFeedback(String(fieldName || '__all__'));
    setError('');
    setNotice('');

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(item.id)}/parse-feedback/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fieldName ? { fieldName } : {}),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error || '清理解析反馈失败');
      }

      setFeedbackSnapshot(extractFeedbackSnapshot(data?.feedbackSnapshot || null));
      setNotice(data?.message || '已清理解析反馈');
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : '清理解析反馈失败');
    } finally {
      setClearingFeedback('');
    }
  }

  async function handleCanonicalBackfill() {
    if (!item?.id || backfillingCanonical) return;
    setBackfillingCanonical(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(item.id)}/canonical-backfill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runImmediately: false }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error || '加入 canonical backfill 失败');
      }
      setNotice(data?.message || '已加入 canonical backfill 队列');
    } catch (backfillError) {
      setError(backfillError instanceof Error ? backfillError.message : '加入 canonical backfill 失败');
    } finally {
      setBackfillingCanonical(false);
    }
  }

  async function handleReparse() {
    if (!item?.id || reparsing) return;
    setReparsing(true);
    setError('');
    setNotice('');

    try {
      const response = await fetch('/api/documents/reparse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: item.id }] }),
      });
      const data = await readJson(response);
      if (!response.ok) {
        throw new Error(data?.error || '重新解析失败');
      }
      setNotice(data?.message || '已加入重新解析队列');
    } catch (reparseError) {
      setError(reparseError instanceof Error ? reparseError.message : '重新解析失败');
    } finally {
      setReparsing(false);
    }
  }

  return (
    <section className="card documents-card">
      <div className="panel-header">
        <div>
          <h3>解析结果</h3>
          <p>查看摘要、结构化结果、字段置信度、证据块，以及当前知识库的解析反馈回流状态。</p>
        </div>
        {!editing ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canReparse ? (
              <button type="button" className="ghost-btn" onClick={handleReparse} disabled={reparsing}>
                {reparsing ? '重新解析中...' : '重新解析'}
              </button>
            ) : null}
            <button type="button" className="ghost-btn" onClick={handleCanonicalBackfill} disabled={backfillingCanonical}>
              {backfillingCanonical ? '回填排队中...' : '立即回填当前文档'}
            </button>
            <button type="button" className="ghost-btn" onClick={handleStartEdit}>
              编辑解析结果
            </button>
          </div>
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
            <h4 style={{ marginBottom: 8 }}>Canonical 文本状态</h4>
            <div style={{ display: 'grid', gap: 8 }}>
                <div className="message-refs">
                  <span className="source-chip">来源：{formatCanonicalSource(resolveCanonicalSource(item))}</span>
                  <span className="source-chip">状态：{formatCanonicalStatus(item?.canonicalParseStatus)}</span>
                  <span className="source-chip">方法：{item?.markdownMethod || '-'}</span>
                  <span className="source-chip">生成时间：{formatDateTime(item?.markdownGeneratedAt)}</span>
                </div>
                {item?.markdownError ? (
                  item?.canonicalParseStatus === 'failed' ? (
                    <div className="preview-meta-line" style={{ color: '#b91c1c' }}>
                      Markdown 解析失败：{item.markdownError}
                    </div>
                  ) : (
                    <div className="preview-meta-line" style={{ color: '#64748b' }}>
                      Markdown 未生成，当前已回退到可用正文。调试信息：{item.markdownError}
                    </div>
                  )
                ) : (
                  <div className="preview-meta-line">
                    {item?.canonicalParseStatus === 'fallback_full_text'
                      ? '当前没有 canonical markdown，但旧正文可用，问答和结构化仍可继续。'
                      : resolveCanonicalSource(item) === 'legacy-full-text'
                        ? '当前仍在使用旧正文作为 canonical text。'
                      : String(resolveCanonicalSource(item)).startsWith('vlm-')
                        ? '当前 canonical text 来自 VLM 兜底解析，已作为可用终态保留。'
                    : resolveCanonicalSource(item) === 'none'
                      ? '当前还没有可用的 canonical text。'
                      : '当前 canonical text 已就绪。'}
                </div>
              )}
            </div>
          </section>

          {imageUnderstanding ? (
            <section>
              <h4 style={{ marginBottom: 8 }}>图片理解</h4>
              <div style={{ display: 'grid', gap: 8 }}>
                <div className="message-refs">
                  <span className="source-chip">文档类型：{imageUnderstanding.documentKind || '-'}</span>
                  <span className="source-chip">版式：{imageUnderstanding.layoutType || '-'}</span>
                  <span className="source-chip">表格/图表：{imageUnderstanding.chartOrTableDetected ? '已识别' : '无'}</span>
                </div>
                <div className="preview-meta-line" style={{ whiteSpace: 'pre-wrap' }}>
                  {imageUnderstanding.visualSummary || '当前没有图片视觉摘要。'}
                </div>
                {imageUnderstanding.tableLikeSignals.length ? (
                  <div className="preview-meta-line">
                    线索：{imageUnderstanding.tableLikeSignals.join(' / ')}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {libraryKnowledge.length ? (
            <section>
              <h4 style={{ marginBottom: 8 }}>库级编译摘要</h4>
              <div style={{ display: 'grid', gap: 12 }}>
                {libraryKnowledge.map((summary) => (
                  <div key={summary.libraryKey} className="bot-summary-card">
                    <div style={{ display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                        <strong>{summary.libraryLabel || summary.libraryKey}</strong>
                        <div className="message-refs">
                          {summary.pilotValidated ? <span className="source-chip">pilot</span> : null}
                          <span className="source-chip">文档数：{summary.documentCount}</span>
                          {summary.focusedFieldSet ? <span className="source-chip">字段集：{summary.focusedFieldSet}</span> : null}
                          <span className="source-chip">更新时间：{formatDateTime(summary.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="preview-meta-line" style={{ whiteSpace: 'pre-wrap' }}>
                        {summary.overview || '-'}
                      </div>
                      {summary.keyTopics.length ? (
                        <div className="preview-meta-line">主题：{summary.keyTopics.join(' / ')}</div>
                      ) : null}
                      {summary.keyFacts.length ? (
                        <div className="preview-meta-line">关键事实：{summary.keyFacts.join(' / ')}</div>
                      ) : null}
                      {summary.focusedFieldCoverage.length ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div className="preview-meta-line">重点字段覆盖率</div>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {summary.focusedFieldCoverage.map((entry) => (
                              <div key={entry.key} className="message-refs">
                                <span className="source-chip">{entry.alias || entry.key}</span>
                                <span className="source-chip">{entry.populatedDocumentCount}/{entry.totalDocumentCount}</span>
                                <span className="source-chip">{Math.round(entry.coverageRatio * 100)}%</span>
                                {entry.conflictStrategy ? <span className="source-chip">冲突：{entry.conflictStrategy}</span> : null}
                                {entry.resolvedValues.length ? <span className="source-chip">代表值：{entry.resolvedValues.join(' / ')}</span> : null}
                                {entry.prompt ? <span className="source-chip">提示：{entry.prompt}</span> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {summary.fieldConflicts.length ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div className="preview-meta-line">字段冲突</div>
                          {summary.fieldConflicts.map((entry) => (
                            <div key={entry.key} className="preview-meta-line">
                              {entry.alias || entry.key}（{entry.conflictStrategy || '-'}）：{entry.values.length ? entry.values.join(' / ') : '-'}
                              {entry.sampleDocumentTitles.length ? `；样本文档：${entry.sampleDocumentTitles.join(' / ')}` : ''}
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {summary.representativeDocuments.length ? (
                        <div className="preview-meta-line">
                          代表文档：{summary.representativeDocuments.slice(0, 3).map((entry) => entry.title).join(' / ')}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {feedbackSnapshot ? (
            <section>
              <h4 style={{ marginBottom: 8 }}>解析反馈回流</h4>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="message-refs">
                    <span className="source-chip">反馈字段：{feedbackSnapshot.fieldCount}</span>
                    <span className="source-chip">反馈值：{feedbackSnapshot.totalValueCount}</span>
                    <span className="source-chip">当前文档命中：{feedbackSnapshot.matchedFieldCount}</span>
                    <span className="source-chip">更新时间：{formatDateTime(feedbackSnapshot.updatedAt)}</span>
                  </div>
                  {feedbackSnapshot.fieldCount ? (
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={clearingFeedback === '__all__'}
                      onClick={() => handleClearFeedback('')}
                    >
                      {clearingFeedback === '__all__' ? '清理中...' : '清理当前库反馈'}
                    </button>
                  ) : null}
                </div>

                {feedbackSnapshot.fieldCount ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {feedbackSnapshot.fields.map((field) => {
                      const alias = fieldTemplate?.fieldAliases?.[field.name] || field.name;
                      return (
                        <div key={field.name} className="bot-summary-card">
                          <div style={{ display: 'grid', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                              <strong>{alias}</strong>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <div className="message-refs">
                                  <span className="source-chip">字段键：{field.name}</span>
                                  <span className="source-chip">反馈值：{field.valueCount}</span>
                                  {field.matchedValueCount ? <span className="source-chip">命中：{field.matchedValueCount}</span> : null}
                                </div>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  disabled={clearingFeedback === field.name}
                                  onClick={() => handleClearFeedback(field.name)}
                                >
                                  {clearingFeedback === field.name ? '清理中...' : '清理字段反馈'}
                                </button>
                              </div>
                            </div>
                            <div className="preview-meta-line">反馈值：{field.values.length ? field.values.join(' / ') : '-'}</div>
                            {field.matchedValues.length ? (
                              <div className="preview-meta-line">当前文档命中：{field.matchedValues.join(' / ')}</div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="preview-meta-line">当前知识库还没有可复用的解析反馈。</div>
                )}
              </div>
            </section>
          ) : null}

          <section>
            <h4 style={{ marginBottom: 8 }}>字段置信度与来源</h4>
            {fieldTemplate?.preferredFieldKeys?.length ? (
              <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                <div className="message-refs">
                  <span className="source-chip">字段模板：{fieldTemplate.fieldSet || '-'}</span>
                  <span className="source-chip">重点字段：{fieldTemplate.preferredFieldKeys.length}</span>
                  <span className="source-chip">必填字段：{fieldTemplate.requiredFieldKeys.length}</span>
                </div>
                {focusedFieldEntries.length ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {focusedFieldEntries.map((entry, index) => (
                      <div key={`${entry.key}-${index}`} className="bot-summary-card">
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <strong>{index + 1}. {entry.alias || entry.key}</strong>
                            <div className="message-refs">
                              {entry.required ? <span className="source-chip">必填</span> : null}
                              {entry.confidence != null ? (
                                <span className="source-chip">置信度：{Math.round(entry.confidence * 100)}%</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="preview-meta-line">{formatFieldValue(entry.value)}</div>
                          <div className="message-refs">
                            <span className="source-chip">字段键：{entry.key}</span>
                            {entry.source ? <span className="source-chip">来源：{entry.source}</span> : null}
                            {entry.evidenceChunkId ? <span className="source-chip">证据块：{entry.evidenceChunkId}</span> : null}
                            {fieldTemplate?.fieldPrompts?.[entry.key] ? (
                              <span className="source-chip">提示：{fieldTemplate.fieldPrompts[entry.key]}</span>
                            ) : null}
                            {fieldTemplate?.fieldConflictStrategies?.[entry.key] ? (
                              <span className="source-chip">冲突：{fieldTemplate.fieldConflictStrategies[entry.key]}</span>
                            ) : null}
                          </div>
                          {Array.isArray(fieldTemplate?.fieldNormalizationRules?.[entry.key]) && fieldTemplate.fieldNormalizationRules[entry.key].length ? (
                            <div className="preview-meta-line">
                              标准化：{fieldTemplate.fieldNormalizationRules[entry.key].join(' / ')}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

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
              <div className="preview-meta-line">暂无字段元数据，可先重新解析或手工在 JSON 里补充。</div>
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
                  {tableSummary.recordKeyField ? (
                    <span className="source-chip">主键列：{tableSummary.recordKeyField}</span>
                  ) : null}
                </div>
                {tableSummary.columns.length ? (
                  <div className="preview-meta-line">列名：{tableSummary.columns.join(' / ')}</div>
                ) : null}
                {Object.keys(tableSummary.recordFieldRoles || {}).length ? (
                  <pre className="code-block" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {safeJsonStringify(tableSummary.recordFieldRoles)}
                  </pre>
                ) : null}
                {Object.keys(tableSummary.recordInsights || {}).length ? (
                  <pre className="code-block" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {safeJsonStringify(tableSummary.recordInsights)}
                  </pre>
                ) : null}
                {tableSummary.sampleRows.length ? (
                  <pre className="code-block" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                    {safeJsonStringify(tableSummary.sampleRows)}
                  </pre>
                ) : null}
                {tableSummary.recordRows.length ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="preview-meta-line">标准化记录行（前 5 行）</div>
                    <pre className="code-block" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
                      {safeJsonStringify(tableSummary.recordRows)}
                    </pre>
                  </div>
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
