import type {
  ReportGroup,
  ReportDraftHistoryAction,
  ReportDraftModule,
  ReportOutputDraft,
  ReportOutputRecord,
  SharedReportTemplate,
} from './report-center.js';

type ReportCenterStateLike = {
  groups: ReportGroup[];
  outputs: ReportOutputRecord[];
  templates: SharedReportTemplate[];
};

type DraftHistoryEntryInput = {
  action: ReportDraftHistoryAction;
  label: string;
  detail?: string;
};

export type ReportDraftActionDeps = {
  loadState: () => Promise<ReportCenterStateLike>;
  buildDraftForRecord: (record: ReportOutputRecord) => ReportOutputDraft | null;
  normalizeStoredDraft: (value: unknown) => ReportOutputDraft | null;
  normalizeStoredDraftModule: (value: unknown, fallbackOrder: number) => ReportDraftModule | null;
  withDraftPreviewPage: (record: ReportOutputRecord, draft: ReportOutputDraft | null) => ReportOutputRecord;
  saveGroupsAndOutputs: (
    groups: ReportGroup[],
    outputs: ReportOutputRecord[],
    templates?: SharedReportTemplate[],
  ) => Promise<void>;
  hydrateDraftQuality: (draft: ReportOutputDraft) => ReportOutputDraft;
  finalizeReportOutputRecord: (record: ReportOutputRecord) => Promise<ReportOutputRecord>;
  syncReportOutputToKnowledgeLibrarySafely: (record: ReportOutputRecord) => Promise<unknown>;
  appendDraftHistory: (draft: ReportOutputDraft, entry: DraftHistoryEntryInput) => ReportOutputDraft['history'];
  buildDraftStructureSummary: (draft: ReportOutputDraft) => unknown;
  isOpenClawGatewayConfigured: () => boolean;
  runOpenClawChat: (input: { prompt: string; systemPrompt?: string }) => Promise<{ content: string }>;
  isRecord: (value: unknown) => value is Record<string, unknown>;
};

function findReportOutputOrThrow(outputs: ReportOutputRecord[], outputId: string) {
  const record = outputs.find((item) => item.id === outputId);
  if (!record) throw new Error('report output not found');
  return record;
}

function parseFirstJsonBlock<T>(content: string): T | null {
  const source = String(content || '').trim();
  if (!source) return null;
  const fenceMatch = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch?.[1] || source;
  const startIndex = Math.min(
    ...['{', '[']
      .map((token) => candidate.indexOf(token))
      .filter((index) => index >= 0),
  );
  if (!Number.isFinite(startIndex)) return null;

  for (let index = candidate.length; index > startIndex; index -= 1) {
    const snippet = candidate.slice(startIndex, index).trim();
    try {
      return JSON.parse(snippet) as T;
    } catch {
      // continue
    }
  }
  return null;
}

function coerceDraftModuleFromModel(
  value: unknown,
  fallback: ReportDraftModule,
  deps: ReportDraftActionDeps,
): ReportDraftModule {
  if (!deps.isRecord(value)) return fallback;
  const parsed = deps.normalizeStoredDraftModule({
    moduleId: fallback.moduleId,
    moduleType: value.moduleType ?? fallback.moduleType,
    title: value.title ?? fallback.title,
    purpose: value.purpose ?? fallback.purpose,
    contentDraft: value.contentDraft ?? value.body ?? fallback.contentDraft,
    evidenceRefs: value.evidenceRefs ?? fallback.evidenceRefs,
    chartIntent: value.chartIntent ?? fallback.chartIntent,
    cards: value.cards ?? fallback.cards,
    bullets: value.bullets ?? fallback.bullets,
    enabled: value.enabled ?? fallback.enabled,
    status: value.status ?? 'edited',
    order: value.order ?? fallback.order,
    layoutType: value.layoutType ?? fallback.layoutType,
  }, fallback.order);
  return parsed || fallback;
}

export async function updateReportOutputDraftWithDeps(
  outputId: string,
  nextDraftInput: ReportOutputDraft,
  deps: ReportDraftActionDeps,
  options?: { historyEntry?: DraftHistoryEntryInput },
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft editing only supports static pages');

  const currentDraft = record.draft || deps.buildDraftForRecord(record);
  if (!currentDraft) throw new Error('draft is not available for this output');
  const reviewStatus = nextDraftInput?.reviewStatus === 'approved' ? 'approved' : 'draft_reviewing';

  const historyEntry = options?.historyEntry || {
    action: 'saved' as const,
    label: '保存草稿',
    detail: `当前共 ${Array.isArray(nextDraftInput?.modules) ? nextDraftInput.modules.length : currentDraft.modules.length} 个模块。`,
  };

  const baseDraft = deps.normalizeStoredDraft({
    ...nextDraftInput,
    version: Math.max(currentDraft.version + 1, Number(nextDraftInput?.version || 0) || 0, 1),
    reviewStatus,
    history: Array.isArray(nextDraftInput?.history) ? nextDraftInput.history : currentDraft.history || [],
    lastEditedAt: new Date().toISOString(),
    approvedAt: reviewStatus === 'approved' ? (nextDraftInput?.approvedAt || new Date().toISOString()) : '',
  });
  if (!baseDraft) throw new Error('draft payload is invalid');

  const history = historyEntry
    ? deps.appendDraftHistory(baseDraft, historyEntry)
    : (Array.isArray(nextDraftInput?.history) ? nextDraftInput.history : currentDraft.history || []);

  const normalizedDraft = deps.normalizeStoredDraft({
    ...baseDraft,
    history,
  });
  if (!normalizedDraft) throw new Error('draft payload is invalid');

  const nextRecordBase: ReportOutputRecord = {
    ...record,
    status: normalizedDraft.reviewStatus === 'approved' ? 'final_generating' : 'draft_reviewing',
    draft: normalizedDraft,
    summary: normalizedDraft.reviewStatus === 'approved'
      ? '草稿已确认，正在生成终稿。'
      : '静态页草稿已更新，等待继续生成终稿。',
  };
  const nextRecord = deps.withDraftPreviewPage(nextRecordBase, normalizedDraft);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? nextRecord : item));
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return nextRecord;
}

export async function restoreReportOutputDraftHistoryWithDeps(
  outputId: string,
  historyId: string,
  deps: ReportDraftActionDeps,
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft restore only supports static pages');

  const currentDraft = record.draft || deps.buildDraftForRecord(record);
  if (!currentDraft) throw new Error('draft is not available for this output');
  const historyEntry = (currentDraft.history || []).find((entry) => entry.id === historyId);
  if (!historyEntry) throw new Error('draft history entry not found');
  if (!historyEntry.snapshot) throw new Error('draft history entry cannot be restored');

  const nextDraft = deps.normalizeStoredDraft({
    ...historyEntry.snapshot,
    reviewStatus: 'draft_reviewing',
    version: Math.max(currentDraft.version + 1, Number(historyEntry.snapshot.version || 0) || 0, 1),
    approvedAt: '',
    lastEditedAt: new Date().toISOString(),
    history: currentDraft.history || [],
  });
  if (!nextDraft) throw new Error('draft history snapshot is invalid');

  return updateReportOutputDraftWithDeps(outputId, nextDraft, deps, {
    historyEntry: {
      action: 'restored',
      label: '恢复草稿版本',
      detail: `已恢复到 ${historyEntry.label || '历史版本'}（${historyEntry.createdAt}）。`,
    },
  });
}

export async function reviseReportOutputDraftModuleWithDeps(
  outputId: string,
  moduleId: string,
  instruction: string,
  deps: ReportDraftActionDeps,
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft module revise only supports static pages');

  const draft = record.draft || deps.buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');
  const moduleIndex = draft.modules.findIndex((item) => item.moduleId === moduleId);
  if (moduleIndex < 0) throw new Error('draft module not found');

  const currentModule = draft.modules[moduleIndex];
  let revisedModule: ReportDraftModule = {
    ...currentModule,
    status: 'edited',
  };

  if (deps.isOpenClawGatewayConfigured()) {
    try {
      const response = await deps.runOpenClawChat({
        prompt: [
          '请根据用户要求，只改写这个静态页草稿模块。',
          `用户要求：${String(instruction || '').trim()}`,
          '',
          '请输出 JSON 对象，字段只允许包含：',
          'title, moduleType, contentDraft, bullets, layoutType, chartIntent',
          '',
          JSON.stringify({
            pageTitle: record.title,
            groupLabel: record.groupLabel,
            draftObjective: draft.objective || '',
            module: currentModule,
          }, null, 2),
        ].join('\n'),
        systemPrompt: [
          '你是企业静态页编辑助手。',
          '你只修改一个模块，不要影响其他模块。',
          '返回严格 JSON，不要解释。',
          '如果模块是 chart，只更新 chartIntent.title、chartIntent.preferredChartType、contentDraft。',
        ].join('\n'),
      });
      const parsed = parseFirstJsonBlock<unknown>(response.content);
      revisedModule = {
        ...coerceDraftModuleFromModel(parsed, currentModule, deps),
        moduleId: currentModule.moduleId,
        order: currentModule.order,
        status: 'edited',
      };
    } catch {
      revisedModule = {
        ...currentModule,
        contentDraft: instruction ? `${currentModule.contentDraft}\n\n${instruction}`.trim() : currentModule.contentDraft,
        status: 'edited',
      };
    }
  }

  const nextDraft: ReportOutputDraft = {
    ...draft,
    reviewStatus: 'draft_reviewing',
    version: draft.version + 1,
    lastEditedAt: new Date().toISOString(),
    modules: draft.modules.map((item, index) => (index === moduleIndex ? revisedModule : item)),
  };
  return updateReportOutputDraftWithDeps(outputId, nextDraft, deps, {
    historyEntry: {
      action: 'module-revised',
      label: '重写单个模块',
      detail: `已更新「${revisedModule.title || currentModule.title || '未命名模块'}」`,
    },
  });
}

export async function reviseReportOutputDraftStructureWithDeps(
  outputId: string,
  instruction: string,
  deps: ReportDraftActionDeps,
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft structure revise only supports static pages');

  const draft = record.draft || deps.buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');

  let nextModules = draft.modules;
  if (deps.isOpenClawGatewayConfigured()) {
    try {
      const response = await deps.runOpenClawChat({
        prompt: [
          '请根据用户要求，只调整静态页草稿的模块结构。',
          `用户要求：${String(instruction || '').trim()}`,
          '',
          '返回 JSON 数组。每个元素只允许包含：',
          'moduleId, moduleType, title, enabled, order, layoutType',
          '',
          JSON.stringify({
            pageTitle: record.title,
            groupLabel: record.groupLabel,
            objective: draft.objective || '',
            modules: deps.buildDraftStructureSummary(draft),
          }, null, 2),
        ].join('\n'),
        systemPrompt: [
          '你是企业静态页结构编辑助手。',
          '只调整模块结构，不改正文内容。',
          '返回严格 JSON 数组，不要解释。',
        ].join('\n'),
      });
      const parsed = parseFirstJsonBlock<Array<unknown>>(response.content);
      if (Array.isArray(parsed) && parsed.length) {
        const currentById = new Map(draft.modules.map((item) => [item.moduleId, item]));
        const reordered = parsed
          .map((item, index) => {
            const entry = deps.isRecord(item) ? item : null;
            const fallback = currentById.get(String(entry?.moduleId || '').trim());
            if (!fallback) return null;
            const next = coerceDraftModuleFromModel({
              ...(entry || {}),
              contentDraft: fallback.contentDraft,
              bullets: fallback.bullets,
              cards: fallback.cards,
              chartIntent: fallback.chartIntent,
              evidenceRefs: fallback.evidenceRefs,
            }, fallback, deps);
            return {
              ...next,
              moduleId: fallback.moduleId,
              order: Number.isFinite(Number(entry?.order))
                ? Number(entry?.order)
                : index,
            };
          })
          .filter(Boolean) as ReportDraftModule[];
        if (reordered.length) {
          nextModules = reordered;
        }
      }
    } catch {
      // keep original structure
    }
  }

  const nextDraft: ReportOutputDraft = {
    ...draft,
    reviewStatus: 'draft_reviewing',
    version: draft.version + 1,
    lastEditedAt: new Date().toISOString(),
    modules: nextModules,
  };
  return updateReportOutputDraftWithDeps(outputId, nextDraft, deps, {
    historyEntry: {
      action: 'structure-revised',
      label: '重写模块结构',
      detail: `当前共 ${nextModules.length} 个模块。`,
    },
  });
}

export async function reviseReportOutputDraftCopyWithDeps(
  outputId: string,
  instruction: string,
  deps: ReportDraftActionDeps,
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft copy revise only supports static pages');

  const draft = record.draft || deps.buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');

  let nextModules = draft.modules;
  if (deps.isOpenClawGatewayConfigured()) {
    try {
      const response = await deps.runOpenClawChat({
        prompt: [
          '请根据用户要求，只重写静态页草稿各模块的标题、正文、要点和图表意图。',
          `用户要求：${String(instruction || '').trim()}`,
          '',
          '返回 JSON 数组。每个元素只允许包含：',
          'moduleId, title, contentDraft, bullets, chartIntent',
          '',
          JSON.stringify({
            pageTitle: record.title,
            groupLabel: record.groupLabel,
            objective: draft.objective || '',
            audience: draft.audience || '',
            modules: draft.modules.map((module) => ({
              moduleId: module.moduleId,
              moduleType: module.moduleType,
              title: module.title,
              purpose: module.purpose,
              contentDraft: module.contentDraft,
              bullets: module.bullets,
              chartIntent: module.chartIntent,
            })),
          }, null, 2),
        ].join('\n'),
        systemPrompt: [
          '你是企业静态页文案编辑助手。',
          '只重写模块内容，不改模块顺序，不改启用状态，不改模块类型。',
          '返回严格 JSON 数组，不要解释。',
        ].join('\n'),
      });
      const parsed = parseFirstJsonBlock<Array<unknown>>(response.content);
      if (Array.isArray(parsed) && parsed.length) {
        const patchById = new Map(
          parsed
            .map((item) => (deps.isRecord(item) ? item : null))
            .filter(Boolean)
            .map((item) => [String(item?.moduleId || '').trim(), item] as const)
            .filter(([moduleId]) => moduleId),
        );
        nextModules = draft.modules.map((module) => {
          const patch = patchById.get(module.moduleId);
          if (!patch) return module;
          const revised = coerceDraftModuleFromModel({
            ...patch,
            moduleType: module.moduleType,
            layoutType: module.layoutType,
            cards: module.cards,
            evidenceRefs: module.evidenceRefs,
          }, module, deps);
          return {
            ...revised,
            moduleId: module.moduleId,
            moduleType: module.moduleType,
            layoutType: module.layoutType,
            order: module.order,
            enabled: module.enabled,
            status: 'edited',
          };
        });
      }
    } catch {
      nextModules = draft.modules.map((module) => ({
        ...module,
        contentDraft: instruction ? `${module.contentDraft}\n\n${instruction}`.trim() : module.contentDraft,
        status: 'edited',
      }));
    }
  } else {
    nextModules = draft.modules.map((module) => ({
      ...module,
      contentDraft: instruction ? `${module.contentDraft}\n\n${instruction}`.trim() : module.contentDraft,
      status: 'edited',
    }));
  }

  const nextDraft: ReportOutputDraft = {
    ...draft,
    reviewStatus: 'draft_reviewing',
    version: draft.version + 1,
    lastEditedAt: new Date().toISOString(),
    modules: nextModules,
  };
  return updateReportOutputDraftWithDeps(outputId, nextDraft, deps, {
    historyEntry: {
      action: 'copy-revised',
      label: '重写整页文案',
      detail: `已更新 ${nextModules.length} 个模块的文案。`,
    },
  });
}

export async function finalizeDraftReportOutputWithDeps(
  outputId: string,
  deps: ReportDraftActionDeps,
) {
  const state = await deps.loadState();
  const record = findReportOutputOrThrow(state.outputs, outputId);
  if (record.kind !== 'page') throw new Error('draft finalize only supports static pages');

  const draft = record.draft || deps.buildDraftForRecord(record);
  if (!draft) throw new Error('draft is not available for this output');

  const validatedDraft = deps.hydrateDraftQuality(draft);
  if (validatedDraft.readiness === 'blocked') {
    const blockingIssues = (validatedDraft.qualityChecklist || [])
      .filter((item) => item.blocking && item.status === 'fail')
      .map((item) => item.detail || item.label)
      .filter(Boolean);
    throw new Error(blockingIssues.length
      ? `draft is not ready to finalize: ${blockingIssues.join('；')}`
      : 'draft is not ready to finalize');
  }

  const approvedDraft: ReportOutputDraft = deps.hydrateDraftQuality({
    ...validatedDraft,
    reviewStatus: 'approved',
    version: draft.version + 1,
    history: deps.appendDraftHistory(validatedDraft, {
      action: 'finalized',
      label: '确认终稿生成',
      detail: `终稿基于 ${validatedDraft.modules.length} 个模块生成。`,
    }),
    approvedAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
  });
  const baseRecord = deps.withDraftPreviewPage({
    ...record,
    status: 'ready',
    summary: '静态页草稿已确认，并已生成终稿。',
    draft: approvedDraft,
    dynamicSource: record.dynamicSource
      ? { ...record.dynamicSource, lastRenderedAt: new Date().toISOString() }
      : record.dynamicSource,
  }, approvedDraft);
  const finalized = await deps.finalizeReportOutputRecord(baseRecord);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? finalized : item));
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  await deps.syncReportOutputToKnowledgeLibrarySafely(finalized);
  return finalized;
}
