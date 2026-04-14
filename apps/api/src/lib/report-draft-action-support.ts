import type {
  ReportGroup,
  ReportDraftHistoryAction,
  ReportDraftModule,
  ReportOutputDraft,
  ReportOutputRecord,
  SharedReportTemplate,
} from './report-center.js';

export type ReportCenterStateLike = {
  groups: ReportGroup[];
  outputs: ReportOutputRecord[];
  templates: SharedReportTemplate[];
};

export type DraftHistoryEntryInput = {
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

export function findReportOutputOrThrow(outputs: ReportOutputRecord[], outputId: string) {
  const record = outputs.find((item) => item.id === outputId);
  if (!record) throw new Error('report output not found');
  return record;
}

export function parseFirstJsonBlock<T>(content: string): T | null {
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

export function coerceDraftModuleFromModel(
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
