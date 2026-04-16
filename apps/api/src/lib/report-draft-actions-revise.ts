import type {
  ReportDraftModule,
  ReportOutputDraft,
} from './report-center.js';
import type { ReportDraftActionDeps } from './report-draft-action-support.js';
import {
  coerceDraftModuleFromModel,
  findReportOutputOrThrow,
  parseFirstJsonBlock,
} from './report-draft-action-support.js';
import { updateReportOutputDraftWithDeps } from './report-draft-actions-update.js';

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
