import type {
  PersistedState,
  ReportGroup,
  ReportOutputRecord,
  ReportReferenceImage,
  ReportTemplateType,
  SharedReportTemplate,
} from './report-center.js';
import {
  type StateStoreDeps,
  normalizePersistedReportStateWithDeps,
  normalizeStoredDraft,
  normalizeStoredDraftModule,
} from './report-center-state-normalization.js';

export {
  normalizePersistedReportStateWithDeps,
  normalizeStoredDraft,
  normalizeStoredDraftModule,
} from './report-center-state-normalization.js';

export async function readReportCenterStateWithDeps(deps: StateStoreDeps): Promise<{ state: PersistedState; migrated: boolean }> {
  const fallbackState = normalizePersistedReportStateWithDeps(null, deps);
  const { data, source } = await deps.readRuntimeStateJson<{ raw: unknown; state: PersistedState }>({
    filePath: deps.reportStateFile,
    fallback: {
      raw: null,
      state: fallbackState,
    },
    normalize: (parsed) => ({
      raw: parsed,
      state: normalizePersistedReportStateWithDeps(parsed, deps),
    }),
  });

  return {
    state: data.state,
    migrated: source !== 'fallback' && JSON.stringify(data.raw) !== JSON.stringify(data.state),
  };
}

export async function writeReportCenterStateWithDeps(state: PersistedState, deps: StateStoreDeps) {
  await deps.ensureDirs();
  await deps.writeRuntimeStateJson({
    filePath: deps.reportStateFile,
    payload: normalizePersistedReportStateWithDeps(state, deps),
  });
}

export function mergeSharedTemplatesWithDeps(
  storedTemplates: SharedReportTemplate[] | undefined,
  deps: StateStoreDeps,
) {
  const defaults = deps.buildDefaultSharedTemplates();
  const merged = new Map<string, SharedReportTemplate>();

  for (const template of defaults) {
    merged.set(template.key, template);
  }

  for (const template of storedTemplates || []) {
    if (!template?.key) continue;
    const fallback = merged.get(template.key);
    merged.set(template.key, {
      ...(fallback || {}),
      ...template,
      preferredLayoutVariant:
        template.preferredLayoutVariant
        || fallback?.preferredLayoutVariant
        || deps.inferTemplatePreferredLayoutVariant({
          ...(fallback || {}),
          ...template,
        }),
      origin:
        template.origin
        || fallback?.origin
        || (String(template.key || '').startsWith('shared-') ? 'system' : 'user'),
      createdAt: String(template.createdAt || fallback?.createdAt || '').trim(),
      referenceImages: (Array.isArray(template.referenceImages) ? template.referenceImages : (fallback?.referenceImages || []))
        .map((item) => deps.normalizeReportReferenceImage(item))
        .filter(Boolean) as ReportReferenceImage[],
    });
  }

  const values = Array.from(merged.values());
  for (const type of ['static-page', 'ppt', 'table', 'document'] as ReportTemplateType[]) {
    const sameType = values.filter((item) => item.type === type);
    if (!sameType.length) continue;
    if (!sameType.some((item) => item.isDefault)) {
      sameType[0].isDefault = true;
    }
  }
  return values;
}

export function buildGroupFromLibraryWithDeps(label: string, key: string, deps: StateStoreDeps): ReportGroup {
  const config = deps.buildTemplatesForLibrary(label, key);
  return {
    key,
    label,
    description: config.description,
    triggerKeywords: config.triggerKeywords,
    defaultTemplateKey: config.defaultTemplateKey,
    templates: config.templates,
    referenceImages: [],
  };
}

export function reconcileOutputRecordsWithDeps(
  outputs: ReportOutputRecord[],
  groups: ReportGroup[],
  deps: StateStoreDeps,
) {
  let changed = false;
  const formulaGroup = groups.find((group) => deps.isFormulaLibrary(group.label, group.key));

  const nextOutputs = outputs
    .map((record) => {
      let nextRecord: ReportOutputRecord = { ...record };
      const directGroup = groups.find((group) => group.key === record.groupKey);
      if (!nextRecord.content && !nextRecord.table && !nextRecord.page) {
        nextRecord = {
          ...nextRecord,
          content: [
            nextRecord.summary || '该报表为历史记录，当前未保存正文内容。',
            nextRecord.groupLabel ? `知识库：${nextRecord.groupLabel}` : '',
            nextRecord.templateLabel ? `输出模板：${nextRecord.templateLabel}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        };
        changed = true;
      }

      const withLocalAnalysis = deps.attachLocalReportAnalysis(nextRecord);
      if (withLocalAnalysis !== nextRecord) {
        nextRecord = withLocalAnalysis;
        changed = true;
      }

      if (directGroup) return nextRecord;

      const looksLikeFormulaRecord = deps.isFormulaLibrary(record.groupLabel || '', record.groupKey || '');
      if (looksLikeFormulaRecord && formulaGroup) {
        changed = true;
        const template = formulaGroup.templates.find((item) => item.key === formulaGroup.defaultTemplateKey) || formulaGroup.templates[0];
        return {
          ...nextRecord,
          groupKey: formulaGroup.key,
          groupLabel: formulaGroup.label,
          templateKey: template?.key || record.templateKey,
          templateLabel: template?.label || record.templateLabel,
          title: record.title.replace(record.groupLabel, formulaGroup.label),
          summary: `${formulaGroup.label} 分组已按 ${template?.label || record.templateLabel} 模板生成成型报表。`,
        };
      }

      changed = true;
      return null;
    })
    .filter(Boolean) as ReportOutputRecord[];

  return { outputs: nextOutputs, changed };
}

export async function saveReportCenterGroupsAndOutputsWithDeps(
  groups: ReportGroup[],
  outputs: ReportOutputRecord[],
  templates: SharedReportTemplate[] | undefined,
  deps: StateStoreDeps,
) {
  await writeReportCenterStateWithDeps({
    version: deps.reportStateVersion,
    groups: groups.map((group) => ({
      key: group.key,
      label: group.label,
      description: group.description,
      triggerKeywords: group.triggerKeywords,
      defaultTemplateKey: group.defaultTemplateKey,
      templates: group.templates,
      referenceImages: group.referenceImages,
    })),
    templates: Array.isArray(templates) ? templates : [],
    outputs: Array.isArray(outputs) ? outputs : [],
  }, deps);
  deps.scheduleOpenClawMemoryCatalogSync('report-center-state-changed');
}

export async function loadReportCenterStateWithOptionsWithDeps(
  options: {
    refreshDynamicPages?: boolean;
    persistFixups?: boolean;
  } | undefined,
  deps: StateStoreDeps,
) {
  const [{ state, migrated }, libraries] = await Promise.all([
    readReportCenterStateWithDeps(deps),
    deps.loadDocumentLibraries(),
  ]);

  const storedGroups = Array.isArray(state.groups) ? state.groups : [];
  const groups = libraries.map((library) => {
    const base = buildGroupFromLibraryWithDeps(library.label, library.key, deps);
    const stored = storedGroups.find((item) => item.key === library.key);
    if (!stored) return base;

    const storedTemplates = Array.isArray(stored.templates) && stored.templates.length ? stored.templates : base.templates;
    const resolvedDefaultTemplateKey = storedTemplates.some((item) => item.key === base.defaultTemplateKey)
      ? base.defaultTemplateKey
      : stored.defaultTemplateKey || base.defaultTemplateKey;

    return {
      ...base,
      description: stored.description || base.description,
      triggerKeywords: Array.isArray(stored.triggerKeywords) && stored.triggerKeywords.length ? stored.triggerKeywords : base.triggerKeywords,
      defaultTemplateKey: resolvedDefaultTemplateKey,
      templates: storedTemplates,
      referenceImages: (Array.isArray(stored.referenceImages) ? stored.referenceImages : [])
        .map((item) => deps.normalizeReportReferenceImage(item))
        .filter(Boolean) as ReportReferenceImage[],
    };
  });

  const templates = mergeSharedTemplatesWithDeps(Array.isArray(state.templates) ? state.templates : [], deps);
  const rawOutputs = Array.isArray(state.outputs) ? state.outputs : [];
  const { outputs, changed } = reconcileOutputRecordsWithDeps(rawOutputs, groups, deps);
  let nextOutputs = outputs;
  let refreshedChanged = false;
  const refreshDynamicPages = options?.refreshDynamicPages !== false;

  if (refreshDynamicPages && nextOutputs.some((item) => item.kind === 'page' && item.dynamicSource?.enabled && !item.draft)) {
    const documentState = await deps.loadParsedDocuments(400, false);
    nextOutputs = await Promise.all(nextOutputs.map(async (item) => {
      if (!(item.kind === 'page' && item.dynamicSource?.enabled) || item.draft) return item;
      const conceptMode = Boolean(item.dynamicSource?.conceptMode)
        || !String(item.dynamicSource?.templateKey || '').trim();
      const template = conceptMode
        ? null
        : templates.find((entry) => entry.key === (item.dynamicSource?.templateKey || item.templateKey))
          || templates.find((entry) => entry.key === item.templateKey)
          || templates.find((entry) => entry.type === 'static-page' && entry.isDefault)
          || templates.find((entry) => entry.type === 'static-page');
      if (!template && !conceptMode) return item;
      const group = deps.resolveReportGroup(groups, item.groupKey) || deps.resolveReportGroup(groups, item.groupLabel);
      const refreshed = await deps.buildDynamicPageRecord(
        item,
        group || null,
        template || null,
        documentState.items as Array<Record<string, unknown>>,
      );
      if (JSON.stringify({
        content: refreshed.content,
        summary: refreshed.summary,
        page: refreshed.page,
        dynamicSource: refreshed.dynamicSource,
      }) !== JSON.stringify({
        content: item.content,
        summary: item.summary,
        page: item.page,
        dynamicSource: item.dynamicSource,
      })) {
        refreshedChanged = true;
      }
      return refreshed;
    }));
  }

  const persistFixups = options?.persistFixups !== false;
  if (persistFixups && (migrated || changed || refreshedChanged)) {
    await saveReportCenterGroupsAndOutputsWithDeps(groups, nextOutputs, templates, deps);
  }

  return { groups, outputs: nextOutputs, templates };
}
