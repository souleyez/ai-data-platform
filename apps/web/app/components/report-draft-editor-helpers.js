'use client';

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
  if (!draft || !module) return [];
  const currentSummary = buildVisualMixSummary(draft);
  if (!currentSummary.length) return [];

  return currentSummary
    .filter((item) => item.moduleType !== module.moduleType)
    .map((item) => {
      const impacts = buildVisualMixImpactPreview(draft, module.moduleId, (entry) => ({
        ...entry,
        moduleType: item.moduleType,
        layoutType: item.moduleType,
        status: 'edited',
      }));
      if (!impacts.length) return null;
      const topImpact = impacts.reduce((best, current) => (
        getVisualMixStatusWeight(current.status) > getVisualMixStatusWeight(best.status) ? current : best
      ));
      return {
        moduleType: item.moduleType,
        label: getModuleTypeLabel(item.moduleType),
        impacts,
        score: impacts.reduce((total, impact) => total + getVisualMixStatusWeight(impact.status), 0),
        topImpact,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return getVisualMixStatusWeight(right.topImpact.status) - getVisualMixStatusWeight(left.topImpact.status);
    });
}

function buildMovePreview(draft, module, direction) {
  if (!draft || !module) return null;
  const modules = Array.isArray(draft.modules)
    ? [...draft.modules].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
    : [];
  const index = modules.findIndex((entry) => entry.moduleId === module.moduleId);
  if (index < 0) return null;
  const targetIndex = direction === 'up' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= modules.length) return null;
  const targetModule = modules[targetIndex];
  const actionLabel = direction === 'up' ? '上移后' : '下移后';
  const relativeLabel = direction === 'up' ? '前面' : '后面';
  return {
    label: actionLabel,
    detail: `会移动到「${targetModule.title || '未命名模块'}」${relativeLabel}，成为第 ${targetIndex + 1} 个模块。`,
  };
}

function buildStructureChangeSummary(previousDraft, nextDraft) {
  const previousModules = Array.isArray(previousDraft?.modules) ? previousDraft.modules : [];
  const nextModules = Array.isArray(nextDraft?.modules) ? nextDraft.modules : [];
  const previousById = new Map(previousModules.map((module, index) => [module.moduleId, { module, index }]));
  const nextById = new Map(nextModules.map((module, index) => [module.moduleId, { module, index }]));
  const added = nextModules.filter((module) => !previousById.has(module.moduleId)).map((module) => module.title || '未命名模块');
  const removed = previousModules.filter((module) => !nextById.has(module.moduleId)).map((module) => module.title || '未命名模块');
  const reordered = nextModules.some((module, index) => previousById.has(module.moduleId) && previousById.get(module.moduleId).index !== index);
  const retitled = nextModules.filter((module) => previousById.has(module.moduleId) && previousById.get(module.moduleId).module.title !== module.title).map((module) => module.title || '未命名模块');
  const typeChanged = nextModules.filter((module) => previousById.has(module.moduleId) && previousById.get(module.moduleId).module.moduleType !== module.moduleType).map((module) => module.title || '未命名模块');

  const lines = [];
  if (added.length) lines.push(`新增：${added.join('、')}`);
  if (removed.length) lines.push(`移除：${removed.join('、')}`);
  if (reordered) lines.push('模块顺序已调整');
  if (retitled.length) lines.push(`标题更新：${retitled.slice(0, 3).join('、')}${retitled.length > 3 ? '…' : ''}`);
  if (typeChanged.length) lines.push(`模块类型调整：${typeChanged.slice(0, 3).join('、')}${typeChanged.length > 3 ? '…' : ''}`);
  return lines.length ? { headline: '本次结构重写结果', lines } : null;
}

function buildRestorePreview(currentDraft, historyEntry) {
  const historyDraft = historyEntry?.snapshot || null;
  if (!historyDraft || !currentDraft) return null;
  const summary = buildStructureChangeSummary(currentDraft, historyDraft);
  return summary ? { headline: '恢复后将回到以下状态', lines: summary.lines } : null;
}

function buildModuleChangeSummary(previousModule, nextModule) {
  if (!previousModule || !nextModule) return null;
  const lines = [];
  if ((previousModule.title || '') !== (nextModule.title || '')) {
    lines.push(`标题：${nextModule.title || '未命名模块'}`);
  }
  if ((previousModule.contentDraft || '') !== (nextModule.contentDraft || '')) {
    lines.push('正文草稿已更新');
  }
  if ((previousModule.moduleType || '') !== (nextModule.moduleType || '')) {
    lines.push(`类型：${getModuleTypeLabel(nextModule.moduleType)}`);
  }
  if (JSON.stringify(previousModule.bullets || []) !== JSON.stringify(nextModule.bullets || [])) {
    lines.push(`要点：${(nextModule.bullets || []).length} 条`);
  }
  if (JSON.stringify(previousModule.cards || []) !== JSON.stringify(nextModule.cards || [])) {
    lines.push(`指标卡：${(nextModule.cards || []).length} 张`);
  }
  if (JSON.stringify(previousModule.chartIntent?.items || []) !== JSON.stringify(nextModule.chartIntent?.items || [])) {
    lines.push(`图表数据：${(nextModule.chartIntent?.items || []).length} 条`);
  }
  return lines.length ? { headline: '模块重写结果', lines } : null;
}

function buildCopyChangeSummary(previousDraft, nextDraft) {
  const previousModules = Array.isArray(previousDraft?.modules) ? previousDraft.modules : [];
  const nextModules = Array.isArray(nextDraft?.modules) ? nextDraft.modules : [];
  const lines = [];
  let changedCount = 0;
  for (const nextModule of nextModules) {
    const previousModule = previousModules.find((module) => module.moduleId === nextModule.moduleId);
    if (!previousModule) continue;
    if ((previousModule.contentDraft || '') !== (nextModule.contentDraft || '')) {
      changedCount += 1;
    }
  }
  if (changedCount) {
    lines.push(`已更新 ${changedCount} 个模块的正文草稿`);
  }
  if ((previousDraft?.visualStyle || '') !== (nextDraft?.visualStyle || '')) {
    lines.push(`终稿风格切换为 ${nextDraft?.visualStyle || '默认风格'}`);
  }
  return lines.length ? { headline: '整页文案重写结果', lines } : null;
}

function formatHistoryTime(value) {
  const timestamp = value ? Date.parse(value) : 0;
  if (!timestamp) return '刚刚';
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

export {
  buildCopyChangeSummary,
  buildDraftPreviewItem,
  buildModuleChangeSummary,
  buildModuleTypeChangeSuggestions,
  buildMovePreview,
  buildRestorePreview,
  buildStructureChangeSummary,
  buildSuggestedNextModule,
  buildVisualMixImpactPreview,
  buildVisualMixSummary,
  buildVisualMixSummaryWithModules,
  createEmptyModule,
  formatBulletLines,
  formatChartLines,
  formatHistoryTime,
  formatMetricLines,
  getDraftReadinessMeta,
  getEnabledDraftModules,
  getModuleTypeLabel,
  normalizeDraftForSave,
  parseChartLines,
  parseLines,
  parseMetricLines,
};
