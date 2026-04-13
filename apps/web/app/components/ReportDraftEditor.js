'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../lib/config';
import {
  getReportVisualStyleMeta,
  REPORT_VISUAL_STYLE_OPTIONS,
} from '../lib/report-visual-styles';
import GeneratedReportDetail from './GeneratedReportDetail';

function parseLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatBulletLines(items) {
  return Array.isArray(items) ? items.join('\n') : '';
}

function formatMetricLines(cards) {
  return Array.isArray(cards)
    ? cards
      .map((card) => [card?.label || '', card?.value || '', card?.note || ''].filter(Boolean).join(' | '))
      .filter(Boolean)
      .join('\n')
    : '';
}

function parseMetricLines(value) {
  return parseLines(value).map((line) => {
    const [label = '', valueText = '', note = ''] = line.split('|').map((item) => item.trim());
    return { label, value: valueText, note };
  }).filter((item) => item.label || item.value || item.note);
}

function formatChartLines(items) {
  return Array.isArray(items)
    ? items
      .map((item) => `${item?.label || ''} | ${item?.value ?? ''}`.trim())
      .join('\n')
    : '';
}

function parseChartLines(value) {
  return parseLines(value)
    .map((line) => {
      const [label = '', rawValue = ''] = line.split('|').map((item) => item.trim());
      const numericValue = Number(rawValue);
      return {
        label,
        value: Number.isFinite(numericValue) ? numericValue : 0,
      };
    })
    .filter((item) => item.label);
}

function normalizeDraftForSave(draft) {
  return {
    ...draft,
    modules: (draft.modules || []).map((module, index) => ({
      ...module,
      order: index,
      enabled: module.enabled !== false,
      status: module.enabled === false ? 'disabled' : (module.status || 'edited'),
      bullets: Array.isArray(module.bullets) ? module.bullets.filter(Boolean) : [],
      cards: Array.isArray(module.cards) ? module.cards.filter((item) => item?.label || item?.value || item?.note) : [],
      chartIntent: module.chartIntent
        ? {
            ...module.chartIntent,
            items: Array.isArray(module.chartIntent.items)
              ? module.chartIntent.items.filter((item) => item?.label)
              : [],
          }
        : null,
    })),
  };
}

function buildDraftPreviewItem(item, draft) {
  const cards = [];
  const sections = [];
  const charts = [];
  let summary = '';

  for (const module of (draft?.modules || []).filter((entry) => entry.enabled !== false)) {
    if (module.moduleType === 'hero' && !summary) {
      summary = module.contentDraft || module.title || '';
      continue;
    }
    if (module.moduleType === 'metric-grid') {
      cards.push(...(module.cards || []));
      continue;
    }
    if (module.moduleType === 'chart') {
      charts.push({
        title: module.chartIntent?.title || module.title,
        items: module.chartIntent?.items || [],
        render: null,
      });
      continue;
    }
    sections.push({
      title: module.title,
      body: module.contentDraft,
      bullets: module.bullets || [],
    });
  }

  return {
    ...item,
    page: {
      ...(item.page || {}),
      summary,
      visualStyle: draft?.visualStyle || item?.page?.visualStyle || 'midnight-glass',
      cards,
      sections,
      charts,
    },
  };
}

function createEmptyModule(index) {
  return {
    moduleId: `draft-module-${Date.now()}-${index}`,
    moduleType: 'summary',
    title: '新模块',
    purpose: '',
    contentDraft: '',
    evidenceRefs: [],
    chartIntent: null,
    cards: [],
    bullets: [],
    enabled: true,
    status: 'edited',
    order: index,
    layoutType: 'summary',
  };
}

function getDraftReadinessMeta(readiness) {
  if (readiness === 'ready') {
    return { label: '可终稿', className: 'is-ready' };
  }
  if (readiness === 'blocked') {
    return { label: '需先补齐', className: 'is-blocked' };
  }
  return { label: '可继续优化', className: 'is-warning' };
}

export default function ReportDraftEditor({ item, onItemChange }) {
  const [draft, setDraft] = useState(item?.draft || null);
  const [selectedModuleId, setSelectedModuleId] = useState(item?.draft?.modules?.[0]?.moduleId || '');
  const [message, setMessage] = useState('');
  const [submittingKey, setSubmittingKey] = useState('');
  const [moduleInstruction, setModuleInstruction] = useState('');
  const [structureInstruction, setStructureInstruction] = useState('');
  const [copyInstruction, setCopyInstruction] = useState('');

  useEffect(() => {
    setDraft(item?.draft || null);
    setSelectedModuleId(item?.draft?.modules?.[0]?.moduleId || '');
    setMessage('');
    setModuleInstruction('');
    setStructureInstruction('');
    setCopyInstruction('');
  }, [item]);

  const modules = draft?.modules || [];
  const selectedModule = useMemo(
    () => modules.find((entry) => entry.moduleId === selectedModuleId) || modules[0] || null,
    [modules, selectedModuleId],
  );
  const previewItem = useMemo(() => buildDraftPreviewItem(item, draft), [item, draft]);
  const selectedVisualStyle = String(draft?.visualStyle || 'midnight-glass').trim() || 'midnight-glass';
  const selectedVisualStyleMeta = getReportVisualStyleMeta(selectedVisualStyle);
  const readinessMeta = getDraftReadinessMeta(draft?.readiness);

  function updateModule(moduleId, updater) {
    setDraft((current) => {
      if (!current) return current;
      const nextModules = current.modules.map((module) => (
        module.moduleId === moduleId ? updater(module) : module
      ));
      return {
        ...current,
        reviewStatus: 'draft_reviewing',
        modules: nextModules,
      };
    });
  }

  function moveModule(moduleId, direction) {
    setDraft((current) => {
      if (!current) return current;
      const index = current.modules.findIndex((module) => module.moduleId === moduleId);
      if (index < 0) return current;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= current.modules.length) return current;
      const nextModules = [...current.modules];
      const [moved] = nextModules.splice(index, 1);
      nextModules.splice(targetIndex, 0, moved);
      return {
        ...current,
        reviewStatus: 'draft_reviewing',
        modules: nextModules.map((module, order) => ({ ...module, order })),
      };
    });
  }

  function addModule() {
    setDraft((current) => {
      const base = current || {
        reviewStatus: 'draft_reviewing',
        version: 1,
        modules: [],
      };
      const nextModule = createEmptyModule(base.modules.length);
      setSelectedModuleId(nextModule.moduleId);
      return {
        ...base,
        reviewStatus: 'draft_reviewing',
        modules: [...base.modules, nextModule],
      };
    });
  }

  function deleteModule(moduleId) {
    setDraft((current) => {
      if (!current) return current;
      const nextModules = current.modules.filter((module) => module.moduleId !== moduleId);
      const nextSelected = nextModules[0]?.moduleId || '';
      setSelectedModuleId(nextSelected);
      return {
        ...current,
        reviewStatus: 'draft_reviewing',
        modules: nextModules.map((module, order) => ({ ...module, order })),
      };
    });
  }

  async function persistDraft(successMessage = '草稿已保存。') {
    if (!draft) return item;
    const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(item.id)}/draft`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft: normalizeDraftForSave(draft) }),
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json?.error || 'save draft failed');
    const nextItem = json?.item || item;
    onItemChange?.(nextItem);
    setDraft(nextItem.draft || draft);
    if (successMessage) setMessage(successMessage);
    return nextItem;
  }

  async function saveDraft() {
    if (!draft) return;
    setSubmittingKey('save-draft');
    setMessage('');
    try {
      await persistDraft('草稿已保存。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存草稿失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function reviseCurrentModule() {
    if (!selectedModule || !moduleInstruction.trim()) return;
    setSubmittingKey('revise-module');
    setMessage('');
    try {
      const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(item.id)}/revise-draft-module`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId: selectedModule.moduleId,
          instruction: moduleInstruction.trim(),
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'revise draft module failed');
      const nextItem = json?.item || item;
      onItemChange?.(nextItem);
      setDraft(nextItem.draft || draft);
      setModuleInstruction('');
      setMessage('模块已重新生成。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '模块重写失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function reviseStructure() {
    if (!structureInstruction.trim()) return;
    setSubmittingKey('revise-structure');
    setMessage('');
    try {
      const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(item.id)}/revise-draft-structure`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: structureInstruction.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'revise draft structure failed');
      const nextItem = json?.item || item;
      onItemChange?.(nextItem);
      setDraft(nextItem.draft || draft);
      setStructureInstruction('');
      setMessage('模块结构已更新。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '结构重写失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function reviseAllCopy() {
    if (!copyInstruction.trim()) return;
    setSubmittingKey('revise-copy');
    setMessage('');
    try {
      const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(item.id)}/revise-draft-copy`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: copyInstruction.trim() }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'revise draft copy failed');
      const nextItem = json?.item || item;
      onItemChange?.(nextItem);
      setDraft(nextItem.draft || draft);
      setCopyInstruction('');
      setMessage('整页草稿文案已更新。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '整页文案重写失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function finalizeDraft() {
    setSubmittingKey('finalize-draft');
    setMessage('');
    try {
      await persistDraft('');
      const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(item.id)}/finalize`), {
        method: 'POST',
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'finalize draft failed');
      const nextItem = json?.item || item;
      onItemChange?.(nextItem);
      setDraft(nextItem.draft || draft);
      setMessage('终稿已生成。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '终稿生成失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  if (!draft) {
    return (
      <section className="card report-empty-card">
        <h4>草稿不可用</h4>
        <p>当前静态页还没有可编辑草稿，可能是旧记录或非静态页输出。</p>
      </section>
    );
  }

  return (
    <section className="card report-draft-editor">
      <div className="panel-header report-draft-editor-header">
        <div>
          <h3>{item.title}</h3>
          <p>草稿版本 {draft.version} · {draft.reviewStatus}</p>
        </div>
        <div className="report-draft-toolbar">
          <button className="ghost-btn" type="button" onClick={addModule}>新增模块</button>
          <button
            className="ghost-btn"
            type="button"
            disabled={submittingKey === 'save-draft'}
            onClick={() => void saveDraft()}
          >
            {submittingKey === 'save-draft' ? '保存中...' : '保存草稿'}
          </button>
          <button
            className="primary-btn"
            type="button"
            disabled={submittingKey === 'finalize-draft' || draft?.readiness === 'blocked'}
            onClick={() => void finalizeDraft()}
          >
            {submittingKey === 'finalize-draft' ? '生成中...' : '进入终稿生成'}
          </button>
        </div>
      </div>

      {message ? <div className="page-note">{message}</div> : null}

      <div className="report-draft-readiness">
        <div className="report-draft-readiness-summary">
          <div>
            <strong>终稿就绪度</strong>
            <span className={`report-draft-readiness-badge ${readinessMeta.className}`.trim()}>
              {readinessMeta.label}
            </span>
          </div>
          {draft?.evidenceCoverage ? (
            <span className="report-draft-readiness-note">
              证据/数据覆盖 {draft.evidenceCoverage.coveredModules}/{draft.evidenceCoverage.totalModules}
            </span>
          ) : null}
        </div>
        {Array.isArray(draft?.qualityChecklist) && draft.qualityChecklist.length ? (
          <div className="report-draft-checklist">
            {draft.qualityChecklist.map((item) => (
              <div
                key={item.key || item.label}
                className={`report-draft-checklist-item is-${item.status}`.trim()}
              >
                <strong>{item.label}</strong>
                <span>{item.detail || ''}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="report-draft-style-bar">
        <div className="report-draft-style-picker">
          <span>终稿视觉风格</span>
          <div className="report-visual-style-grid">
            {REPORT_VISUAL_STYLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`report-visual-style-card ${option.previewClassName} ${selectedVisualStyle === option.value ? 'is-selected' : ''}`.trim()}
                onClick={() => setDraft((current) => (
                  current
                    ? {
                        ...current,
                        reviewStatus: 'draft_reviewing',
                        visualStyle: option.value,
                      }
                    : current
                ))}
              >
                <span className="report-visual-style-card-preview" />
                <strong>{option.label}</strong>
                <span>{option.description}</span>
                <div className="report-visual-style-chip-row">
                  {(option.chips || []).map((chip) => (
                    <span key={chip} className="report-visual-style-chip">{chip}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="report-draft-style-note">
          <strong>{selectedVisualStyleMeta.label}</strong>
          <span>{selectedVisualStyleMeta.description}</span>
        </div>
      </div>

      <div className="report-draft-structure-bar">
        <textarea
          className="filter-input report-draft-structure-input"
          value={structureInstruction}
          onChange={(event) => setStructureInstruction(event.target.value)}
          placeholder="例如：把风险概览移到最前，删除 CTA，新增一个“客户建议”模块"
        />
        <button
          className="ghost-btn"
          type="button"
          disabled={submittingKey === 'revise-structure'}
          onClick={() => void reviseStructure()}
        >
          {submittingKey === 'revise-structure' ? '处理中...' : '重新生成模块结构'}
        </button>
      </div>

      <div className="report-draft-structure-bar">
        <textarea
          className="filter-input report-draft-structure-input"
          value={copyInstruction}
          onChange={(event) => setCopyInstruction(event.target.value)}
          placeholder="例如：整体改成更客户化语气，压缩每个模块字数，并把行动建议写得更明确"
        />
        <button
          className="ghost-btn"
          type="button"
          disabled={submittingKey === 'revise-copy'}
          onClick={() => void reviseAllCopy()}
        >
          {submittingKey === 'revise-copy' ? '处理中...' : '重新生成全部文案'}
        </button>
      </div>

      <div className="report-draft-grid">
        <aside className="report-draft-modules">
          {(draft.modules || []).sort((left, right) => left.order - right.order).map((module, index) => (
            <button
              key={module.moduleId}
              type="button"
              className={`report-draft-module-item ${selectedModule?.moduleId === module.moduleId ? 'is-selected' : ''}`.trim()}
              onClick={() => setSelectedModuleId(module.moduleId)}
            >
              <span className="report-draft-module-order">{index + 1}</span>
              <span className="report-draft-module-meta">
                <strong>{module.title || '未命名模块'}</strong>
                <span>{module.moduleType}{module.enabled === false ? ' · 已禁用' : ''}</span>
              </span>
            </button>
          ))}
        </aside>

        <section className="report-draft-preview">
          <GeneratedReportDetail item={previewItem} />
        </section>

        <section className="report-draft-edit-panel">
          {!selectedModule ? (
            <div className="report-empty-card">
              <h4>选择一个模块</h4>
              <p>左侧选择模块后，可在这里编辑标题、正文、模块类型和图表偏好。</p>
            </div>
          ) : (
            <>
              <div className="report-draft-edit-actions">
                <button className="ghost-btn" type="button" onClick={() => moveModule(selectedModule.moduleId, 'up')}>上移</button>
                <button className="ghost-btn" type="button" onClick={() => moveModule(selectedModule.moduleId, 'down')}>下移</button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={() => updateModule(selectedModule.moduleId, (module) => ({
                    ...module,
                    enabled: !module.enabled,
                    status: !module.enabled ? 'edited' : 'disabled',
                  }))}
                >
                  {selectedModule.enabled === false ? '启用模块' : '禁用模块'}
                </button>
                <button className="ghost-btn" type="button" onClick={() => deleteModule(selectedModule.moduleId)}>删除模块</button>
              </div>

              <div className="report-draft-form">
                <label>
                  <span>模块类型</span>
                  <select
                    className="filter-input"
                    value={selectedModule.moduleType}
                    onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                      ...module,
                      moduleType: event.target.value,
                      layoutType: event.target.value,
                      status: 'edited',
                    }))}
                  >
                    {['hero', 'summary', 'metric-grid', 'insight-list', 'table', 'chart', 'timeline', 'comparison', 'cta', 'appendix'].map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>标题</span>
                  <input
                    className="filter-input"
                    value={selectedModule.title}
                    onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                      ...module,
                      title: event.target.value,
                      status: 'edited',
                    }))}
                  />
                </label>
                <label>
                  <span>模块目的</span>
                  <textarea
                    className="filter-input"
                    value={selectedModule.purpose || ''}
                    onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                      ...module,
                      purpose: event.target.value,
                      status: 'edited',
                    }))}
                  />
                </label>
                {selectedModule.moduleType === 'metric-grid' ? (
                  <label>
                    <span>指标卡（每行：标题 | 数值 | 备注）</span>
                    <textarea
                      className="filter-input"
                      value={formatMetricLines(selectedModule.cards)}
                      onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                        ...module,
                        cards: parseMetricLines(event.target.value),
                        status: 'edited',
                      }))}
                    />
                  </label>
                ) : selectedModule.moduleType === 'chart' ? (
                  <>
                    <label>
                      <span>图表标题</span>
                      <input
                        className="filter-input"
                        value={selectedModule.chartIntent?.title || selectedModule.title}
                        onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                          ...module,
                          chartIntent: {
                            ...(module.chartIntent || {}),
                            title: event.target.value,
                            preferredChartType: module.chartIntent?.preferredChartType || 'bar',
                            items: module.chartIntent?.items || [],
                          },
                          status: 'edited',
                        }))}
                      />
                    </label>
                    <label>
                      <span>图表类型</span>
                      <select
                        className="filter-input"
                        value={selectedModule.chartIntent?.preferredChartType || 'bar'}
                        onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                          ...module,
                          chartIntent: {
                            ...(module.chartIntent || {}),
                            title: module.chartIntent?.title || module.title,
                            preferredChartType: event.target.value,
                            items: module.chartIntent?.items || [],
                          },
                          status: 'edited',
                        }))}
                      >
                        {['bar', 'horizontal-bar', 'line'].map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>图表数据（每行：标签 | 数值）</span>
                      <textarea
                        className="filter-input"
                        value={formatChartLines(selectedModule.chartIntent?.items)}
                        onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                          ...module,
                          chartIntent: {
                            ...(module.chartIntent || {}),
                            title: module.chartIntent?.title || module.title,
                            preferredChartType: module.chartIntent?.preferredChartType || 'bar',
                            items: parseChartLines(event.target.value),
                          },
                          status: 'edited',
                        }))}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      <span>正文草稿</span>
                      <textarea
                        className="filter-input"
                        value={selectedModule.contentDraft || ''}
                        onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                          ...module,
                          contentDraft: event.target.value,
                          status: 'edited',
                        }))}
                      />
                    </label>
                    <label>
                      <span>要点（每行一条）</span>
                      <textarea
                        className="filter-input"
                        value={formatBulletLines(selectedModule.bullets)}
                        onChange={(event) => updateModule(selectedModule.moduleId, (module) => ({
                          ...module,
                          bullets: parseLines(event.target.value),
                          status: 'edited',
                        }))}
                      />
                    </label>
                  </>
                )}
              </div>

              <div className="report-draft-module-ai">
                <textarea
                  className="filter-input"
                  value={moduleInstruction}
                  onChange={(event) => setModuleInstruction(event.target.value)}
                  placeholder="例如：把这个模块改成更像客户汇报语气，强调风险和下一步动作"
                />
                <button
                  className="ghost-btn"
                  type="button"
                  disabled={submittingKey === 'revise-module'}
                  onClick={() => void reviseCurrentModule()}
                >
                  {submittingKey === 'revise-module' ? '处理中...' : '重新生成当前模块'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
