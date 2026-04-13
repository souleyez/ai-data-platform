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

function getModuleTypeLabel(moduleType) {
  switch (String(moduleType || '').trim()) {
    case 'hero': return '摘要';
    case 'summary': return '正文';
    case 'metric-grid': return '指标';
    case 'insight-list': return '洞察';
    case 'table': return '表格';
    case 'chart': return '图表';
    case 'timeline': return '时间线';
    case 'comparison': return '对比';
    case 'cta': return '动作';
    case 'appendix': return '附录';
    default: return String(moduleType || '模块').trim() || '模块';
  }
}

function getEnabledDraftModules(draft) {
  return Array.isArray(draft?.modules)
    ? draft.modules.filter((module) => module.enabled !== false && module.status !== 'disabled')
    : [];
}

function getOrderedDraftModules(draft) {
  return Array.isArray(draft?.modules)
    ? [...draft.modules].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    : [];
}

function buildVisualMixSummaryWithModules(draft, modules) {
  const targets = Array.isArray(draft?.visualMixTargets) ? draft.visualMixTargets : [];
  if (!targets.length) return [];
  const enabledModules = Array.isArray(modules)
    ? modules.filter((module) => module.enabled !== false && module.status !== 'disabled')
    : [];
  return targets.map((target) => {
    const currentCount = enabledModules.filter((module) => module.moduleType === target.moduleType).length;
    const minCount = Number(target.minCount || 0);
    const targetCount = Number(target.targetCount || 0);
    const maxCount = Number(target.maxCount || 0);
    const status = currentCount < minCount
      ? 'is-blocked'
      : currentCount === targetCount
        ? 'is-ready'
        : 'is-warning';
    return {
      key: `${target.moduleType}-${minCount}-${targetCount}-${maxCount}`,
      moduleType: target.moduleType,
      label: getModuleTypeLabel(target.moduleType),
      currentCount,
      minCount,
      targetCount,
      maxCount,
      status,
    };
  });
}

function buildVisualMixSummary(draft) {
  return buildVisualMixSummaryWithModules(draft, getEnabledDraftModules(draft));
}

function buildSuggestedNextModule(visualMixSummary) {
  const top = (Array.isArray(visualMixSummary) ? visualMixSummary : [])
    .filter((item) => item.currentCount < item.targetCount || item.currentCount < item.minCount)
    .sort((left, right) => {
      const leftGap = Math.max(left.minCount - left.currentCount, left.targetCount - left.currentCount, 0);
      const rightGap = Math.max(right.minCount - right.currentCount, right.targetCount - right.currentCount, 0);
      return rightGap - leftGap;
    })[0];
  if (!top) return null;
  return {
    moduleType: top.moduleType,
    label: top.label,
    detail: `当前 ${top.currentCount}/${top.targetCount}，最少 ${top.minCount}`,
  };
}

function buildVisualMixImpactPreview(draft, moduleId, mutateModule) {
  const currentSummary = buildVisualMixSummary(draft);
  if (!currentSummary.length) return [];
  const nextModules = Array.isArray(draft?.modules)
    ? draft.modules
      .map((module) => (module.moduleId === moduleId ? mutateModule(module) : module))
      .filter(Boolean)
    : [];
  const nextSummary = buildVisualMixSummaryWithModules(draft, nextModules);
  return nextSummary
    .map((item) => {
      const previous = currentSummary.find((entry) => entry.moduleType === item.moduleType);
      if (!previous) return null;
      if (previous.currentCount === item.currentCount && previous.status === item.status) return null;
      return {
        key: `${item.moduleType}-${item.currentCount}-${item.status}`,
        label: item.label,
        currentCount: item.currentCount,
        targetCount: item.targetCount,
        status: item.status,
      };
    })
    .filter(Boolean);
}

function getVisualMixStatusWeight(status) {
  if (status === 'is-ready') return 2;
  if (status === 'is-warning') return 1;
  return 0;
}

function buildModuleTypeChangeSuggestions(draft, module) {
  if (!module) return [];
  const currentSummary = buildVisualMixSummary(draft);
  const moduleTypes = ['hero', 'summary', 'metric-grid', 'insight-list', 'table', 'chart', 'timeline', 'comparison', 'cta', 'appendix'];
  return moduleTypes
    .filter((option) => option !== module.moduleType)
    .map((option) => {
      const nextModules = Array.isArray(draft?.modules)
        ? draft.modules.map((entry) => (
          entry.moduleId === module.moduleId
            ? { ...entry, moduleType: option, layoutType: option, status: 'edited' }
            : entry
        ))
        : [];
      const nextSummary = buildVisualMixSummaryWithModules(draft, nextModules);
      const impacts = nextSummary
        .map((item) => {
          const previous = currentSummary.find((entry) => entry.moduleType === item.moduleType);
          if (!previous) return null;
          if (previous.currentCount === item.currentCount && previous.status === item.status) return null;
          return {
            key: `${option}-${item.moduleType}-${item.currentCount}-${item.status}`,
            label: item.label,
            currentCount: item.currentCount,
            targetCount: item.targetCount,
            status: item.status,
          };
        })
        .filter(Boolean);
      if (!impacts.length) return null;
      const score = nextSummary.reduce((total, item) => {
        const previous = currentSummary.find((entry) => entry.moduleType === item.moduleType);
        return total + (getVisualMixStatusWeight(item.status) - getVisualMixStatusWeight(previous?.status));
      }, 0);
      return {
        moduleType: option,
        label: getModuleTypeLabel(option),
        impacts,
        score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label, 'zh-CN'));
}

function buildMovePreview(draft, module, direction) {
  if (!module) return null;
  const orderedModules = getOrderedDraftModules(draft);
  const index = orderedModules.findIndex((entry) => entry.moduleId === module.moduleId);
  if (index < 0) return null;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= orderedModules.length) return null;
  const anchor = orderedModules[targetIndex];
  const anchorLabel = anchor?.title || `${getModuleTypeLabel(anchor?.moduleType)}模块`;
  return {
    direction,
    targetIndex,
    label: direction === 'up' ? '上移后' : '下移后',
    detail: direction === 'up'
      ? `将位于「${anchorLabel}」之前，顺序变为第 ${targetIndex + 1} 位。`
      : `将位于「${anchorLabel}」之后，顺序变为第 ${targetIndex + 1} 位。`,
  };
}

function buildStructureChangeSummary(previousDraft, nextDraft) {
  const previousModules = getOrderedDraftModules(previousDraft);
  const nextModules = getOrderedDraftModules(nextDraft);
  if (!previousModules.length || !nextModules.length) return null;
  const previousById = new Map(previousModules.map((module, index) => [module.moduleId, { module, index }]));
  const nextById = new Map(nextModules.map((module, index) => [module.moduleId, { module, index }]));
  const added = nextModules.filter((module) => !previousById.has(module.moduleId));
  const removed = previousModules.filter((module) => !nextById.has(module.moduleId));
  const moved = nextModules.filter((module, index) => {
    const previous = previousById.get(module.moduleId);
    return previous && previous.index !== index;
  });
  const typeChanged = nextModules.filter((module) => {
    const previous = previousById.get(module.moduleId);
    return previous && previous.module.moduleType !== module.moduleType;
  });
  const lines = [];
  if (added.length) {
    lines.push(`新增 ${added.length} 个模块：${added.slice(0, 3).map((module) => module.title || getModuleTypeLabel(module.moduleType)).join('、')}${added.length > 3 ? '…' : ''}`);
  }
  if (removed.length) {
    lines.push(`移除 ${removed.length} 个模块：${removed.slice(0, 3).map((module) => module.title || getModuleTypeLabel(module.moduleType)).join('、')}${removed.length > 3 ? '…' : ''}`);
  }
  if (moved.length) {
    lines.push(`重排 ${moved.length} 个模块顺序。`);
  }
  if (typeChanged.length) {
    lines.push(`调整 ${typeChanged.length} 个模块类型。`);
  }
  if (!lines.length) {
    return {
      headline: '结构调整结果',
      lines: ['模块结构已重写，但整体顺序和类型基本保持不变。'],
    };
  }
  return {
    headline: '结构调整结果',
    lines,
  };
}

function buildRestorePreview(currentDraft, historyEntry) {
  const snapshotDraft = historyEntry?.snapshot;
  if (!snapshotDraft?.modules?.length || !currentDraft?.modules?.length) return null;
  const summary = buildStructureChangeSummary(currentDraft, snapshotDraft);
  if (!summary?.lines?.length) return null;
  return {
    headline: '恢复后预览',
    lines: summary.lines,
  };
}

function buildModuleChangeSummary(previousModule, nextModule) {
  if (!previousModule || !nextModule) return null;
  const lines = [];
  if (String(previousModule.title || '').trim() !== String(nextModule.title || '').trim()) {
    lines.push(`标题改成「${nextModule.title || '未命名模块'}」。`);
  }
  if (String(previousModule.contentDraft || '').trim() !== String(nextModule.contentDraft || '').trim()) {
    lines.push('正文草稿已更新。');
  }
  if (JSON.stringify(previousModule.bullets || []) !== JSON.stringify(nextModule.bullets || [])) {
    lines.push(`要点调整为 ${Array.isArray(nextModule.bullets) ? nextModule.bullets.length : 0} 条。`);
  }
  if (String(previousModule.moduleType || '').trim() !== String(nextModule.moduleType || '').trim()) {
    lines.push(`模块类型改成 ${getModuleTypeLabel(nextModule.moduleType)}。`);
  }
  if (JSON.stringify(previousModule.chartIntent || null) !== JSON.stringify(nextModule.chartIntent || null)) {
    lines.push('图表意图已更新。');
  }
  if (!lines.length) {
    lines.push('模块内容已重写，但结构保持不变。');
  }
  return {
    headline: '模块重写结果',
    lines,
  };
}

function buildCopyChangeSummary(previousDraft, nextDraft) {
  const previousModules = new Map((previousDraft?.modules || []).map((module) => [module.moduleId, module]));
  const changed = (nextDraft?.modules || [])
    .map((module) => {
      const previous = previousModules.get(module.moduleId);
      if (!previous) return null;
      const changedContent = (
        String(previous.title || '').trim() !== String(module.title || '').trim()
        || String(previous.contentDraft || '').trim() !== String(module.contentDraft || '').trim()
        || JSON.stringify(previous.bullets || []) !== JSON.stringify(module.bullets || [])
        || JSON.stringify(previous.chartIntent || null) !== JSON.stringify(module.chartIntent || null)
      );
      return changedContent ? (module.title || getModuleTypeLabel(module.moduleType)) : null;
    })
    .filter(Boolean);
  if (!changed.length) {
    return {
      headline: '整页文案重写结果',
      lines: ['整体文案已重写，但主要模块结构保持不变。'],
    };
  }
  return {
    headline: '整页文案重写结果',
    lines: [
      `已更新 ${changed.length} 个模块。`,
      `重点变化：${changed.slice(0, 4).join('、')}${changed.length > 4 ? '…' : ''}`,
    ],
  };
}

function formatHistoryTime(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return String(value || '');
  }
}

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
        {visualMixSummary.length ? (
          <div className="report-draft-visual-mix">
            <div className="report-draft-visual-mix-header">
              <strong>视觉比例目标</strong>
              <span>当前模块数 / 目标数</span>
            </div>
            <div className="report-draft-visual-mix-grid">
              {visualMixSummary.map((item) => (
                <div
                  key={item.key}
                  className={`report-draft-visual-mix-card ${item.status}`.trim()}
                >
                  <strong>{item.label}</strong>
                  <span>{item.currentCount} / {item.targetCount}</span>
                  <small>最少 {item.minCount}，最多 {item.maxCount}</small>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {draftHistory.length ? (
        <div className="report-draft-history">
          <div className="report-draft-history-header">
            <strong>草稿版本轨迹</strong>
            <span>最近 {draftHistory.length} 次动作</span>
          </div>
          <div className="report-draft-history-list">
            {draftHistory.map((entry) => (
              <div key={entry.id || `${entry.action}-${entry.createdAt}`} className="report-draft-history-item">
                <div className="report-draft-history-item-head">
                  <strong>{entry.label || '草稿更新'}</strong>
                  <div className="report-draft-history-item-actions">
                    <span>{formatHistoryTime(entry.createdAt)}</span>
                    {entry.canRestore ? (
                      <button
                        className="ghost-btn report-draft-history-restore-btn"
                        type="button"
                        disabled={submittingKey === `restore-${entry.id}`}
                        onClick={() => void restoreDraftHistory(entry.id)}
                      >
                        {submittingKey === `restore-${entry.id}` ? '恢复中...' : '恢复此版'}
                      </button>
                    ) : null}
                  </div>
                </div>
                {entry.detail ? <span className="report-draft-history-detail">{entry.detail}</span> : null}
                {entry.canRestore ? (() => {
                  const restorePreview = buildRestorePreview(draft, entry);
                  return restorePreview?.lines?.length ? (
                    <div className="report-draft-history-preview">
                      <strong>{restorePreview.headline}</strong>
                      <div className="report-draft-history-preview-list">
                        {restorePreview.lines.map((line) => (
                          <span key={`${entry.id}-${line}`}>{line}</span>
                        ))}
                      </div>
                    </div>
                  ) : null;
                })() : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

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

              {moveUpPreview || moveDownPreview ? (
                <div className="report-draft-order-notes">
                  {moveUpPreview ? (
                    <div className="report-draft-order-note">
                      <strong>{moveUpPreview.label}</strong>
                      <span>{moveUpPreview.detail}</span>
                    </div>
                  ) : null}
                  {moveDownPreview ? (
                    <div className="report-draft-order-note">
                      <strong>{moveDownPreview.label}</strong>
                      <span>{moveDownPreview.detail}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {toggleImpact.length || deleteImpact.length ? (
                <div className="report-draft-impact-notes">
                  {toggleImpact.length ? (
                    <div className="report-draft-impact-note">
                      <strong>{selectedModule.enabled === false ? '启用后' : '禁用后'}</strong>
                      <div className="report-draft-impact-chip-row">
                        {toggleImpact.map((impact) => (
                          <span
                            key={`toggle-${impact.key}`}
                            className={`report-draft-impact-chip ${impact.status}`.trim()}
                          >
                            {impact.label} {impact.currentCount}/{impact.targetCount}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {deleteImpact.length ? (
                    <div className="report-draft-impact-note">
                      <strong>删除后</strong>
                      <div className="report-draft-impact-chip-row">
                        {deleteImpact.map((impact) => (
                          <span
                            key={`delete-${impact.key}`}
                            className={`report-draft-impact-chip ${impact.status}`.trim()}
                          >
                            {impact.label} {impact.currentCount}/{impact.targetCount}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

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
                {typeChangeSuggestions.length ? (
                  <div className="report-draft-type-suggestions">
                    <strong>快速改成更合适的类型</strong>
                    <div className="report-draft-type-suggestion-list">
                      {typeChangeSuggestions.slice(0, 4).map((suggestion) => (
                        <div key={`${selectedModule.moduleId}-${suggestion.moduleType}`} className="report-draft-type-suggestion-item">
                          <button
                            className="ghost-btn report-draft-type-suggestion-btn"
                            type="button"
                            onClick={() => updateModule(selectedModule.moduleId, (module) => ({
                              ...module,
                              moduleType: suggestion.moduleType,
                              layoutType: suggestion.moduleType,
                              status: 'edited',
                            }))}
                          >
                            改成{suggestion.label}
                          </button>
                          <div className="report-draft-impact-chip-row">
                            {suggestion.impacts.map((impact) => (
                              <span
                                key={impact.key}
                                className={`report-draft-impact-chip ${impact.status}`.trim()}
                              >
                                {impact.label} {impact.currentCount}/{impact.targetCount}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
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

              {moduleSummary?.lines?.length ? (
                <div className="report-draft-structure-summary">
                  <strong>{moduleSummary.headline}</strong>
                  <div className="report-draft-structure-summary-list">
                    {moduleSummary.lines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </section>
  );
}
