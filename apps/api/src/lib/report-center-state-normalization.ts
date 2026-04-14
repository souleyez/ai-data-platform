import { normalizeDraftVisualMixTargets, normalizeStoredDraftHistoryEntry } from './report-draft-history.js';
import { hydrateDraftQuality } from './report-draft-quality.js';
import type {
  PersistedState,
  ReportOutputDraft,
  ReportDraftModule,
  ReportDraftModuleStatus,
  ReportDraftModuleType,
  ReportDraftReviewStatus,
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

function normalizeStoredPageCard(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const label = deps.normalizeTextField(value.label);
  const rawValue = deps.normalizeTextField(value.value);
  const note = deps.normalizeTextField(value.note);
  return label || rawValue || note ? { label, value: rawValue, note } : null;
}

function normalizeStoredPageSection(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const title = deps.normalizeTextField(value.title);
  const body = deps.normalizeTextField(value.body);
  const bullets = deps.normalizeStringList(value.bullets);
  const displayMode = deps.normalizeTextField(value.displayMode);
  return title || body || bullets.length ? { title, body, bullets, displayMode } : null;
}

function normalizeStoredPageChartRender(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const renderer = deps.normalizeTextField(value.renderer);
  const chartType = deps.normalizeTextField(value.chartType);
  const svg = deps.normalizeTextField(value.svg);
  const alt = deps.normalizeTextField(value.alt);
  const generatedAt = deps.normalizeTextField(value.generatedAt);
  return renderer || chartType || svg || alt || generatedAt
    ? { renderer, chartType, svg, alt, generatedAt }
    : null;
}

function normalizeStoredPageChart(value: unknown, deps: StateStoreDeps) {
  if (!isRecord(value)) return null;
  const title = deps.normalizeTextField(value.title);
  const items = Array.isArray(value.items)
    ? value.items
        .map((item) => {
          if (!isRecord(item)) return null;
          const label = deps.normalizeTextField(item.label);
          const numericValue = Number(item.value);
          return label
            ? {
                label,
                value: Number.isFinite(numericValue) ? numericValue : 0,
              }
            : null;
        })
        .filter(Boolean) as Array<{ label?: string; value?: number }>
    : [];
  const render = normalizeStoredPageChartRender(value.render, deps);
  return title || items.length || render ? { title, items, render } : null;
}

function normalizeStoredPage(value: unknown, deps: StateStoreDeps): ReportOutputRecord['page'] | null {
  if (!isRecord(value)) return null;

  const summary = deps.normalizeTextField(value.summary);
  const cards = Array.isArray(value.cards)
    ? value.cards.map((item) => normalizeStoredPageCard(item, deps)).filter(Boolean) as Array<{ label?: string; value?: string; note?: string }>
    : [];
  const sections = Array.isArray(value.sections)
    ? value.sections.map((item) => normalizeStoredPageSection(item, deps)).filter(Boolean) as Array<{ title?: string; body?: string; bullets?: string[]; displayMode?: string }>
    : [];
  const datavizSlots = deps.normalizeStoredDatavizSlots(value.datavizSlots);
  const pageSpec = deps.normalizeStoredPageSpec(value.pageSpec);
  const visualStyle = deps.normalizeVisualStylePreset(value.visualStyle);
  const charts = Array.isArray(value.charts)
    ? value.charts.map((item) => normalizeStoredPageChart(item, deps)).filter(Boolean) as Array<{
        title?: string;
        items?: Array<{ label?: string; value?: number }>;
        render?: { renderer?: string; chartType?: string; svg?: string; alt?: string; generatedAt?: string } | null;
      }>
    : [];

  return summary || cards.length || sections.length || charts.length || datavizSlots.length || pageSpec || visualStyle
    ? { summary, cards, sections, datavizSlots, pageSpec, visualStyle, charts }
    : null;
}

function normalizeStoredDraftModuleType(value: unknown, deps: StateStoreDeps): ReportDraftModuleType {
  const normalized = deps.normalizeTextField(value);
  if (
    normalized === 'hero'
    || normalized === 'summary'
    || normalized === 'metric-grid'
    || normalized === 'insight-list'
    || normalized === 'table'
    || normalized === 'chart'
    || normalized === 'timeline'
    || normalized === 'comparison'
    || normalized === 'cta'
    || normalized === 'appendix'
  ) {
    return normalized;
  }
  return 'summary';
}

function normalizeStoredDraftModuleStatus(value: unknown, deps: StateStoreDeps): ReportDraftModuleStatus {
  const normalized = deps.normalizeTextField(value);
  if (normalized === 'edited' || normalized === 'disabled') return normalized;
  return 'generated';
}

function normalizeStoredDraftReviewStatus(value: unknown, deps: StateStoreDeps): ReportDraftReviewStatus {
  const normalized = deps.normalizeTextField(value);
  if (normalized === 'draft_reviewing' || normalized === 'approved') return normalized;
  return 'draft_generated';
}

export function normalizeStoredDraftModule(value: unknown, deps: StateStoreDeps, fallbackOrder = 0): ReportDraftModule | null {
  if (!isRecord(value)) return null;

  const moduleId = deps.normalizeTextField(value.moduleId) || deps.buildId('draftmod');
  const moduleType = normalizeStoredDraftModuleType(value.moduleType, deps);
  const title = deps.normalizeTextField(value.title) || '未命名模块';
  const purpose = deps.normalizeTextField(value.purpose);
  const contentDraft = deps.normalizeTextField(value.contentDraft);
  const evidenceRefs = deps.normalizeStringList(value.evidenceRefs);
  const bullets = deps.normalizeStringList(value.bullets);
  const cards = Array.isArray(value.cards)
    ? value.cards.map((item) => normalizeStoredPageCard(item, deps)).filter(Boolean) as Array<{ label?: string; value?: string; note?: string }>
    : [];
  const chartIntent = isRecord(value.chartIntent)
    ? {
        title: deps.normalizeTextField(value.chartIntent.title),
        preferredChartType: deps.normalizeDraftChartType(value.chartIntent.preferredChartType),
        items: Array.isArray(value.chartIntent.items)
          ? value.chartIntent.items
              .map((item) => normalizeStoredPageChart({ items: [item] }, deps)?.items?.[0] || null)
              .filter(Boolean) as Array<{ label?: string; value?: number }>
          : [],
      }
    : null;

  return {
    moduleId,
    moduleType,
    title,
    purpose,
    contentDraft,
    evidenceRefs,
    chartIntent,
    cards,
    bullets,
    enabled: value.enabled !== false && normalizeStoredDraftModuleStatus(value.status, deps) !== 'disabled',
    status: normalizeStoredDraftModuleStatus(value.status, deps),
    order: Number.isFinite(Number(value.order)) ? Number(value.order) : fallbackOrder,
    layoutType: deps.normalizeTextField(value.layoutType) || moduleType,
  };
}

export function normalizeStoredDraft(value: unknown, deps: StateStoreDeps): ReportOutputDraft | null {
  if (!isRecord(value)) return null;

  const modules = Array.isArray(value.modules)
    ? value.modules.map((item, index) => normalizeStoredDraftModule(item, deps, index)).filter(Boolean) as ReportDraftModule[]
    : [];
  if (!modules.length) return null;

  const normalizeStoredDraftValue = (input: unknown) => normalizeStoredDraft(input, deps);
  return hydrateDraftQuality({
    reviewStatus: normalizeStoredDraftReviewStatus(value.reviewStatus, deps),
    version: Math.max(1, Number(value.version || 1) || 1),
    modules: modules.sort((left, right) => left.order - right.order),
    history: Array.isArray(value.history)
      ? value.history
          .map((item) => normalizeStoredDraftHistoryEntry(item, {
            buildId: deps.buildId,
            normalizeTextField: deps.normalizeTextField,
            normalizeVisualStylePreset: deps.normalizeVisualStylePreset,
            normalizeStringList: deps.normalizeStringList,
            normalizeStoredDraft: normalizeStoredDraftValue,
          }))
          .filter(Boolean) as NonNullable<ReportOutputDraft['history']>
      : [],
    lastEditedAt: deps.normalizeTextField(value.lastEditedAt),
    approvedAt: deps.normalizeTextField(value.approvedAt),
    audience: deps.normalizeTextField(value.audience),
    objective: deps.normalizeTextField(value.objective),
    layoutVariant: deps.normalizeTextField(value.layoutVariant) as ReportPlanLayoutVariant,
    visualStyle: deps.normalizeVisualStylePreset(value.visualStyle),
    mustHaveModules: deps.normalizeStringList(value.mustHaveModules),
    optionalModules: deps.normalizeStringList(value.optionalModules),
    evidencePriority: deps.normalizeStringList(value.evidencePriority),
    audienceTone: deps.normalizeTextField(value.audienceTone),
    riskNotes: deps.normalizeStringList(value.riskNotes),
    visualMixTargets: normalizeDraftVisualMixTargets(value.visualMixTargets, deps.normalizeTextField),
  });
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
