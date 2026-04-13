'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildApiUrl } from '../lib/config';
import {
  getReportVisualStyleMeta,
  REPORT_VISUAL_STYLE_OPTIONS,
} from '../lib/report-visual-styles';
import GeneratedReportDetail from './GeneratedReportDetail';
import { DraftModuleInspector, DraftModuleList } from './report-draft-module-editor';
import { DraftHistoryPanel, DraftReadinessPanel } from './report-draft-editor-panels';
import {
  buildCopyChangeSummary,
  buildDraftPreviewItem,
  buildModuleChangeSummary,
  buildModuleTypeChangeSuggestions,
  buildMovePreview,
  buildStructureChangeSummary,
  buildSuggestedNextModule,
  buildVisualMixImpactPreview,
  buildVisualMixSummary,
  createEmptyModule,
  formatBulletLines,
  formatChartLines,
  formatMetricLines,
  getDraftReadinessMeta,
  getModuleTypeLabel,
  normalizeDraftForSave,
  parseChartLines,
  parseLines,
  parseMetricLines,
} from './report-draft-editor-helpers';

export default function ReportDraftEditor({ item, onItemChange }) {
  const [draft, setDraft] = useState(item?.draft || null);
  const [selectedModuleId, setSelectedModuleId] = useState(item?.draft?.modules?.[0]?.moduleId || '');
  const [message, setMessage] = useState('');
  const [structureSummary, setStructureSummary] = useState(null);
  const [moduleSummary, setModuleSummary] = useState(null);
  const [copySummary, setCopySummary] = useState(null);
  const [submittingKey, setSubmittingKey] = useState('');
  const [moduleInstruction, setModuleInstruction] = useState('');
  const [structureInstruction, setStructureInstruction] = useState('');
  const [copyInstruction, setCopyInstruction] = useState('');

  useEffect(() => {
    setDraft(item?.draft || null);
    setSelectedModuleId(item?.draft?.modules?.[0]?.moduleId || '');
    setMessage('');
    setStructureSummary(null);
    setModuleSummary(null);
    setCopySummary(null);
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
  const visualMixSummary = useMemo(() => buildVisualMixSummary(draft), [draft]);
  const suggestedNextModule = useMemo(() => buildSuggestedNextModule(visualMixSummary), [visualMixSummary]);
  const deleteImpact = useMemo(() => (
    selectedModule
      ? buildVisualMixImpactPreview(draft, selectedModule.moduleId, () => null)
      : []
  ), [draft, selectedModule]);
  const toggleImpact = useMemo(() => (
    selectedModule
      ? buildVisualMixImpactPreview(draft, selectedModule.moduleId, (module) => ({
          ...module,
          enabled: !module.enabled,
          status: !module.enabled ? 'edited' : 'disabled',
        }))
      : []
  ), [draft, selectedModule]);
  const typeChangeSuggestions = useMemo(() => (
    buildModuleTypeChangeSuggestions(draft, selectedModule)
  ), [draft, selectedModule]);
  const moveUpPreview = useMemo(() => buildMovePreview(draft, selectedModule, 'up'), [draft, selectedModule]);
  const moveDownPreview = useMemo(() => buildMovePreview(draft, selectedModule, 'down'), [draft, selectedModule]);
  const draftHistory = Array.isArray(draft?.history) ? draft.history.slice(0, 8) : [];

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
      const recommendedType = buildSuggestedNextModule(buildVisualMixSummary(base));
      if (recommendedType) {
        nextModule.moduleType = recommendedType.moduleType;
        nextModule.layoutType = recommendedType.moduleType;
        nextModule.title = `${recommendedType.label}模块`;
      }
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
    setModuleSummary(null);
    try {
      const previousDraft = draft;
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
      const previousModule = (previousDraft?.modules || []).find((entry) => entry.moduleId === selectedModule.moduleId);
      const nextModule = (nextItem.draft?.modules || []).find((entry) => entry.moduleId === selectedModule.moduleId);
      setModuleSummary(buildModuleChangeSummary(previousModule, nextModule));
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
    setStructureSummary(null);
    try {
      const previousDraft = draft;
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
      setStructureSummary(buildStructureChangeSummary(previousDraft, nextItem.draft || previousDraft));
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
    setCopySummary(null);
    try {
      const previousDraft = draft;
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
      setCopySummary(buildCopyChangeSummary(previousDraft, nextItem.draft || previousDraft));
      setCopyInstruction('');
      setMessage('整页草稿文案已更新。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '整页文案重写失败。');
    } finally {
      setSubmittingKey('');
    }
  }

  async function restoreDraftHistory(historyId) {
    if (!historyId) return;
    setSubmittingKey(`restore-${historyId}`);
    setMessage('');
    setStructureSummary(null);
    setModuleSummary(null);
    setCopySummary(null);
    try {
      const response = await fetch(buildApiUrl(`/api/reports/output/${encodeURIComponent(item.id)}/restore-draft-history`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || 'restore draft history failed');
      const nextItem = json?.item || item;
      onItemChange?.(nextItem);
      setDraft(nextItem.draft || draft);
      setSelectedModuleId(nextItem.draft?.modules?.[0]?.moduleId || '');
      setMessage('已恢复到所选草稿版本。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '恢复草稿版本失败。');
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
          <button className="ghost-btn" type="button" onClick={addModule}>
            新增模块{suggestedNextModule ? ` · 建议补${suggestedNextModule.label}` : ''}
          </button>
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

      {suggestedNextModule ? (
        <div className="report-draft-toolbar-note">
          建议优先新增{suggestedNextModule.label}模块。{suggestedNextModule.detail}
        </div>
      ) : null}

      {message ? <div className="page-note">{message}</div> : null}

      <DraftReadinessPanel
        draft={draft}
        readinessMeta={readinessMeta}
        visualMixSummary={visualMixSummary}
      />

      <DraftHistoryPanel
        draft={draft}
        draftHistory={draftHistory}
        submittingKey={submittingKey}
        restoreDraftHistory={restoreDraftHistory}
      />

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

      {structureSummary?.lines?.length ? (
        <div className="report-draft-structure-summary">
          <strong>{structureSummary.headline}</strong>
          <div className="report-draft-structure-summary-list">
            {structureSummary.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
      ) : null}

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

      {copySummary?.lines?.length ? (
        <div className="report-draft-structure-summary">
          <strong>{copySummary.headline}</strong>
          <div className="report-draft-structure-summary-list">
            {copySummary.lines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="report-draft-grid">
        <DraftModuleList
          modules={(draft.modules || []).sort((left, right) => left.order - right.order)}
          selectedModuleId={selectedModule?.moduleId}
          setSelectedModuleId={setSelectedModuleId}
        />

        <section className="report-draft-preview">
          <GeneratedReportDetail item={previewItem} />
        </section>

        <section className="report-draft-edit-panel">
          <DraftModuleInspector
            selectedModule={selectedModule}
            moveModule={moveModule}
            updateModule={updateModule}
            deleteModule={deleteModule}
            moveUpPreview={moveUpPreview}
            moveDownPreview={moveDownPreview}
            toggleImpact={toggleImpact}
            deleteImpact={deleteImpact}
            typeChangeSuggestions={typeChangeSuggestions}
            moduleInstruction={moduleInstruction}
            setModuleInstruction={setModuleInstruction}
            reviseCurrentModule={reviseCurrentModule}
            moduleSummary={moduleSummary}
            submittingKey={submittingKey}
          />
        </section>
      </div>
    </section>
  );
}
