import type {
  ReportDynamicSource,
  ReportGroup,
  ReportOutputDraft,
  ReportOutputRecord,
  ReportOutputStatus,
  SharedReportTemplate,
} from './report-center.js';

type ReportCenterStateLike = {
  groups: ReportGroup[];
  outputs: ReportOutputRecord[];
  templates: SharedReportTemplate[];
};

export type ReportOutputActionDeps = {
  loadState: () => Promise<ReportCenterStateLike>;
  resolveReportGroup: (groups: ReportGroup[], groupKeyOrLabel: string) => ReportGroup | null;
  resolveTemplateTypeFromKind: (kind?: ReportOutputRecord['kind']) => SharedReportTemplate['type'] | null;
  resolveDefaultReportKind: (templateType: SharedReportTemplate['type']) => NonNullable<ReportOutputRecord['kind']>;
  resolveOutputTypeLabel: (
    kind?: ReportOutputRecord['kind'],
    templateType?: SharedReportTemplate['type'],
  ) => string;
  resolveDefaultReportFormat: (kind: NonNullable<ReportOutputRecord['kind']>) => string;
  normalizeDynamicSource: (
    dynamicSource: Partial<ReportDynamicSource> | null | undefined,
    fallback: {
      request?: string;
      kind?: ReportOutputRecord['kind'];
      templateKey?: string;
      templateLabel?: string;
      libraries?: ReportOutputRecord['libraries'];
    },
  ) => ReportDynamicSource | null;
  withDraftPreviewPage: (record: ReportOutputRecord, draft: ReportOutputDraft | null) => ReportOutputRecord;
  buildDraftForRecord: (record: ReportOutputRecord) => ReportOutputDraft | null;
  finalizeReportOutputRecord: (record: ReportOutputRecord) => Promise<ReportOutputRecord>;
  saveGroupsAndOutputs: (
    groups: ReportGroup[],
    outputs: ReportOutputRecord[],
    templates?: SharedReportTemplate[],
  ) => Promise<void>;
  syncReportOutputToKnowledgeLibrarySafely: (record: ReportOutputRecord) => Promise<unknown>;
  buildId: (prefix: string) => string;
};

function findOutputOrThrow(outputs: ReportOutputRecord[], outputId: string) {
  const record = outputs.find((item) => item.id === outputId);
  if (!record) throw new Error('report output not found');
  return record;
}

export async function createReportOutputWithDeps(
  input: {
    groupKey: string;
    templateKey?: string;
    title?: string;
    triggerSource?: 'report-center' | 'chat';
    kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
    format?: string;
    status?: ReportOutputStatus;
    summary?: string;
    content?: string;
    table?: ReportOutputRecord['table'];
    page?: ReportOutputRecord['page'];
    draft?: ReportOutputDraft | null;
    libraries?: ReportOutputRecord['libraries'];
    downloadUrl?: string;
    dynamicSource?: Partial<ReportDynamicSource> | null;
  },
  deps: ReportOutputActionDeps,
) {
  const state = await deps.loadState();
  const group = deps.resolveReportGroup(state.groups, input.groupKey);
  if (!group) throw new Error('report group not found');

  const preferredTemplateType = deps.resolveTemplateTypeFromKind(input.kind) || 'static-page';
  const template =
    (input.templateKey ? state.templates.find((item) => item.key === input.templateKey) : null)
    || state.templates.find((item) => item.type === preferredTemplateType && item.isDefault)
    || state.templates.find((item) => item.type === preferredTemplateType)
    || state.templates[0];
  if (!template) throw new Error('shared report template not found');

  const createdAt = new Date().toISOString();
  const resolvedKind = input.kind || deps.resolveDefaultReportKind(template.type);
  const shouldCreateDraft = resolvedKind === 'page' && Boolean(input.page || input.draft || input.dynamicSource);
  const resolvedStatus = input.status || (shouldCreateDraft ? 'draft_generated' : 'ready');
  const baseRecord: ReportOutputRecord = {
    id: deps.buildId('report'),
    groupKey: group.key,
    groupLabel: group.label,
    templateKey: template.key,
    templateLabel: template.label,
    title: input.title?.trim() || `${group.label}-${template.label}-${createdAt.slice(0, 10)}`,
    outputType: deps.resolveOutputTypeLabel(resolvedKind, template.type),
    kind: resolvedKind,
    format: input.format || deps.resolveDefaultReportFormat(resolvedKind),
    createdAt,
    status: resolvedStatus,
    summary: String(input.summary || '').trim()
      || (resolvedStatus === 'processing'
        ? `${group.label} 分组内容已转入后台继续生成。`
        : resolvedStatus === 'draft_planned'
          ? `${group.label} 分组已生成静态页草稿规划。`
          : resolvedStatus === 'draft_generated'
            ? `${group.label} 分组已生成可审改的静态页草稿。`
            : resolvedStatus === 'draft_reviewing'
              ? `${group.label} 分组静态页草稿正在审改。`
              : resolvedStatus === 'final_generating'
                ? `${group.label} 分组静态页草稿已确认，正在生成终稿。`
                : resolvedStatus === 'failed'
                  ? `${group.label} 分组内容生成失败。`
                  : `${group.label} 分组已按 ${template.label} 模板生成成型报表。`),
    triggerSource: input.triggerSource || 'report-center',
    content: input.content || '',
    table: input.table || null,
    page: input.page || null,
    libraries: Array.isArray(input.libraries) ? input.libraries : [],
    downloadUrl: input.downloadUrl || '',
    dynamicSource: deps.normalizeDynamicSource(input.dynamicSource, {
      request: input.title || group.label,
      kind: resolvedKind,
      templateKey: template.key,
      templateLabel: template.label,
      libraries: Array.isArray(input.libraries) && input.libraries.length
        ? input.libraries
        : [{ key: group.key, label: group.label }],
    }),
    draft: input.draft || null,
  };

  const recordWithDraft = shouldCreateDraft
    ? deps.withDraftPreviewPage(baseRecord, input.draft || deps.buildDraftForRecord(baseRecord))
    : baseRecord;

  const record = await deps.finalizeReportOutputRecord(recordWithDraft);
  const nextOutputs = [record, ...state.outputs].slice(0, 100);
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  await deps.syncReportOutputToKnowledgeLibrarySafely(record);
  return record;
}

export async function updateReportOutputWithDeps(
  outputId: string,
  patch: {
    title?: string;
    kind?: ReportOutputRecord['kind'];
    format?: string;
    status?: ReportOutputStatus;
    summary?: string;
    content?: string;
    table?: ReportOutputRecord['table'];
    page?: ReportOutputRecord['page'];
    draft?: ReportOutputRecord['draft'];
    libraries?: ReportOutputRecord['libraries'];
    downloadUrl?: string;
    dynamicSource?: ReportOutputRecord['dynamicSource'];
  },
  deps: ReportOutputActionDeps,
) {
  const state = await deps.loadState();
  const current = findOutputOrThrow(state.outputs, outputId);

  const nextBase: ReportOutputRecord = {
    ...current,
    title: patch.title !== undefined ? String(patch.title || '').trim() || current.title : current.title,
    kind: patch.kind !== undefined ? patch.kind : current.kind,
    format: patch.format !== undefined ? String(patch.format || '').trim() || current.format : current.format,
    status: patch.status || current.status,
    summary: patch.summary !== undefined ? String(patch.summary || '').trim() || current.summary : current.summary,
    content: patch.content !== undefined ? String(patch.content || '') : current.content,
    table: patch.table !== undefined ? patch.table || null : current.table,
    page: patch.page !== undefined ? patch.page || null : current.page,
    draft: patch.draft !== undefined ? patch.draft || null : current.draft,
    libraries: patch.libraries !== undefined ? (Array.isArray(patch.libraries) ? patch.libraries : []) : current.libraries,
    downloadUrl: patch.downloadUrl !== undefined ? String(patch.downloadUrl || '').trim() : current.downloadUrl,
    dynamicSource: patch.dynamicSource !== undefined ? patch.dynamicSource || null : current.dynamicSource,
  };
  const nextPrepared = nextBase.kind === 'page'
    ? deps.withDraftPreviewPage(nextBase, nextBase.draft || deps.buildDraftForRecord(nextBase))
    : nextBase;
  const nextRecord = await deps.finalizeReportOutputRecord(nextPrepared);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? nextRecord : item));
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  await deps.syncReportOutputToKnowledgeLibrarySafely(nextRecord);
  return nextRecord;
}

export async function deleteReportOutputWithDeps(
  outputId: string,
  deps: ReportOutputActionDeps,
) {
  const state = await deps.loadState();
  const nextOutputs = state.outputs.filter((item) => item.id !== outputId);
  if (nextOutputs.length === state.outputs.length) {
    throw new Error('report output not found');
  }
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
}
