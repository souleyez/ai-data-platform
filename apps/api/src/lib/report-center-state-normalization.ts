import type {
  PersistedState,
  ReportDynamicSource,
  ReportGroup,
  ReportGroupTemplate,
  ReportOutputRecord,
  ReportOutputStatus,
  ReportReferenceImage,
  ReportTemplateType,
  ReportVisualStylePreset,
  SharedReportTemplate,
} from './report-center.js';
import type { ReportDraftModule, ReportOutputDraft } from './report-center.js';
import { normalizeStoredDraft, normalizeStoredDraftModule } from './report-center-state-normalization-draft.js';
import { normalizeStoredPage } from './report-center-state-normalization-page.js';
import type { ReportPlanDatavizSlot, ReportPlanLayoutVariant, ReportPlanPageSpec } from './report-planner.js';

type LegacyPersistedState = Partial<PersistedState> & {
  version?: number;
};

type StoredLibraryRef = Array<{ key?: string; label?: string }>;

export type StateStoreDeps = {
  reportStateFile: string;
  reportStateVersion: number;
  ensureDirs: () => Promise<void>;
  readRuntimeStateJson: <T>(options: {
    filePath: string;
    fallback: T;
    normalize: (parsed: unknown) => T;
  }) => Promise<{ data: T; source: string }>;
  writeRuntimeStateJson: (options: {
    filePath: string;
    payload: unknown;
  }) => Promise<void>;
  buildId: (prefix: string) => string;
  normalizeTextField: (value: unknown) => string;
  normalizeStringList: (value: unknown) => string[];
  normalizeVisualStylePreset: (value: unknown) => ReportVisualStylePreset | undefined;
  normalizeReportReferenceImage: (reference: Partial<ReportReferenceImage> | null | undefined) => ReportReferenceImage | null;
  normalizeStoredDatavizSlots: (value: unknown) => ReportPlanDatavizSlot[];
  normalizeStoredPageSpec: (value: unknown) => ReportPlanPageSpec | undefined;
  normalizeDynamicSource: (
    value: Partial<ReportDynamicSource> | null | undefined,
    fallback: {
      request?: string;
      kind?: ReportOutputRecord['kind'];
      templateKey?: string;
      templateLabel?: string;
      libraries?: ReportOutputRecord['libraries'];
    },
  ) => ReportDynamicSource | null;
  normalizeDraftChartType: (value: unknown) => ReportPlanDatavizSlot['preferredChartType'] | undefined;
  buildDefaultSharedTemplates: () => SharedReportTemplate[];
  inferTemplatePreferredLayoutVariant: (
    template: Pick<SharedReportTemplate, 'key' | 'type' | 'label' | 'description'>,
  ) => ReportPlanLayoutVariant | undefined;
  buildTemplatesForLibrary: (label: string, key: string) => {
    description: string;
    triggerKeywords: string[];
    defaultTemplateKey: string;
    templates: ReportGroupTemplate[];
  };
  attachLocalReportAnalysis: (record: ReportOutputRecord) => ReportOutputRecord;
  loadDocumentLibraries: () => Promise<Array<{ label: string; key: string }>>;
  loadParsedDocuments: (limit: number, includeContent: boolean) => Promise<{ items: Array<Record<string, unknown>> }>;
  buildDynamicPageRecord: (
    record: ReportOutputRecord,
    group: ReportGroup | null,
    template: SharedReportTemplate | null,
    documents: Array<Record<string, unknown>>,
  ) => Promise<ReportOutputRecord>;
  resolveReportGroup: (groups: ReportGroup[], groupKeyOrLabel: string) => ReportGroup | null;
  isFormulaLibrary: (label: string, key: string) => boolean;
  scheduleOpenClawMemoryCatalogSync: (reason: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStoredTemplateType(value: unknown, deps: StateStoreDeps): ReportTemplateType {
  const normalized = deps.normalizeTextField(value);
  return ['table', 'static-page', 'ppt', 'document'].includes(normalized)
    ? (normalized as ReportTemplateType)
    : 'document';
}

function normalizeReportLayoutVariant(value: unknown, deps: StateStoreDeps): ReportPlanLayoutVariant | undefined {
  const normalized = deps.normalizeTextField(value);
  return [
    'insight-brief',
    'risk-brief',
    'operations-cockpit',
    'talent-showcase',
    'research-brief',
    'solution-overview',
  ].includes(normalized)
    ? (normalized as ReportPlanLayoutVariant)
    : undefined;
}

function normalizeStoredGroupTemplate(value: unknown, deps: StateStoreDeps): ReportGroupTemplate | null {
  if (!isRecord(value)) return null;
  const key = deps.normalizeTextField(value.key);
  if (!key) return null;
  return {
    key,
    label: deps.normalizeTextField(value.label) || key,
    type: normalizeStoredTemplateType(value.type, deps),
    description: deps.normalizeTextField(value.description),
    supported: value.supported !== false,
  };
}

function normalizeStoredGroup(value: unknown, deps: StateStoreDeps): PersistedState['groups'][number] | null {
  if (!isRecord(value)) return null;
  const key = deps.normalizeTextField(value.key);
  if (!key) return null;
  return {
    key,
    label: deps.normalizeTextField(value.label) || key,
    description: deps.normalizeTextField(value.description),
    triggerKeywords: deps.normalizeStringList(value.triggerKeywords),
    defaultTemplateKey: deps.normalizeTextField(value.defaultTemplateKey),
    templates: Array.isArray(value.templates)
      ? value.templates.map((item) => normalizeStoredGroupTemplate(item, deps)).filter(Boolean) as ReportGroupTemplate[]
      : [],
    referenceImages: Array.isArray(value.referenceImages)
      ? value.referenceImages.map((item) => deps.normalizeReportReferenceImage(item as Partial<ReportReferenceImage>)).filter(Boolean) as ReportReferenceImage[]
      : [],
  };
}

function normalizeStoredSharedTemplate(value: unknown, deps: StateStoreDeps): SharedReportTemplate | null {
  if (!isRecord(value)) return null;
  const key = deps.normalizeTextField(value.key);
  if (!key) return null;
  const type = normalizeStoredTemplateType(value.type, deps);
  return {
    key,
    label: deps.normalizeTextField(value.label) || key,
    type,
    description: deps.normalizeTextField(value.description),
    preferredLayoutVariant: type === 'static-page' ? normalizeReportLayoutVariant(value.preferredLayoutVariant, deps) : undefined,
    supported: value.supported !== false,
    isDefault: Boolean(value.isDefault),
    origin: deps.normalizeTextField(value.origin) === 'system' ? 'system' : 'user',
    createdAt: deps.normalizeTextField(value.createdAt),
    referenceImages: Array.isArray(value.referenceImages)
      ? value.referenceImages.map((item) => deps.normalizeReportReferenceImage(item as Partial<ReportReferenceImage>)).filter(Boolean) as ReportReferenceImage[]
      : [],
  };
}

function normalizeStoredLibraries(value: unknown, deps: StateStoreDeps): StoredLibraryRef {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item)) return null;
      const key = deps.normalizeTextField(item.key);
      const label = deps.normalizeTextField(item.label);
      return key || label ? { key, label } : null;
    })
    .filter(Boolean) as StoredLibraryRef;
}

function normalizeStoredTable(value: unknown, deps: StateStoreDeps): ReportOutputRecord['table'] | null {
  if (!isRecord(value)) return null;
  const columns = deps.normalizeStringList(value.columns);
  const rows = Array.isArray(value.rows)
    ? value.rows
        .filter((item) => Array.isArray(item))
        .map((row) => (row as unknown[]).map((cell) => {
          if (cell == null) return null;
          if (typeof cell === 'number') return cell;
          return String(cell);
        }))
    : [];
  const title = deps.normalizeTextField(value.title);
  return columns.length || rows.length || title ? { columns, rows, title } : null;
}

function normalizeStoredOutputKind(value: unknown, deps: StateStoreDeps): ReportOutputRecord['kind'] | undefined {
  const normalized = deps.normalizeTextField(value);
  return ['table', 'page', 'ppt', 'pdf', 'doc', 'md'].includes(normalized)
    ? (normalized as ReportOutputRecord['kind'])
    : undefined;
}

function normalizeReportOutputStatus(value: unknown, deps: StateStoreDeps): ReportOutputStatus {
  const normalized = deps.normalizeTextField(value);
  if (
    normalized === 'processing'
    || normalized === 'draft_planned'
    || normalized === 'draft_generated'
    || normalized === 'draft_reviewing'
    || normalized === 'final_generating'
    || normalized === 'failed'
  ) {
    return normalized;
  }
  return 'ready';
}

function normalizeStoredOutput(value: unknown, deps: StateStoreDeps): ReportOutputRecord | null {
  if (!isRecord(value)) return null;

  const id = deps.normalizeTextField(value.id);
  const groupKey = deps.normalizeTextField(value.groupKey) || deps.normalizeTextField(value.groupLabel);
  if (!id || !groupKey) return null;

  const groupLabel = deps.normalizeTextField(value.groupLabel) || groupKey;
  const templateKey = deps.normalizeTextField(value.templateKey);
  const templateLabel = deps.normalizeTextField(value.templateLabel) || templateKey || '数据可视化静态页';
  const kind = normalizeStoredOutputKind(value.kind || value.outputType, deps);
  const outputType = deps.normalizeTextField(value.outputType) || kind || 'page';
  const title = deps.normalizeTextField(value.title) || `${groupLabel} 输出`;
  const summary = deps.normalizeTextField(value.summary) || deps.normalizeTextField(value.content);
  const libraries = normalizeStoredLibraries(value.libraries, deps);

  return {
    id,
    groupKey,
    groupLabel,
    templateKey,
    templateLabel,
    title,
    outputType,
    kind,
    format: deps.normalizeTextField(value.format),
    createdAt: deps.normalizeTextField(value.createdAt) || '1970-01-01T00:00:00.000Z',
    status: normalizeReportOutputStatus(value.status, deps),
    summary,
    triggerSource: deps.normalizeTextField(value.triggerSource) === 'chat' ? 'chat' : 'report-center',
    content: deps.normalizeTextField(value.content),
    table: normalizeStoredTable(value.table, deps),
    page: normalizeStoredPage(value.page, deps),
    libraries,
    downloadUrl: deps.normalizeTextField(value.downloadUrl),
    dynamicSource: deps.normalizeDynamicSource(
      isRecord(value.dynamicSource) ? value.dynamicSource as Partial<ReportDynamicSource> : null,
      {
        request: title || summary,
        kind,
        templateKey,
        templateLabel,
        libraries,
      },
    ),
    draft: normalizeStoredDraft(value.draft, deps),
  };
}

export function normalizePersistedReportStateWithDeps(raw: unknown, deps: StateStoreDeps): PersistedState {
  const state = isRecord(raw) ? raw as LegacyPersistedState : {};
  return {
    version: deps.reportStateVersion,
    groups: Array.isArray(state.groups)
      ? state.groups.map((item) => normalizeStoredGroup(item, deps)).filter(Boolean) as PersistedState['groups']
      : [],
    templates: Array.isArray(state.templates)
      ? state.templates.map((item) => normalizeStoredSharedTemplate(item, deps)).filter(Boolean) as SharedReportTemplate[]
      : [],
    outputs: Array.isArray(state.outputs)
      ? state.outputs.map((item) => normalizeStoredOutput(item, deps)).filter(Boolean) as ReportOutputRecord[]
      : [],
  };
}

export { normalizeStoredDraft, normalizeStoredDraftModule } from './report-center-state-normalization-draft.js';
