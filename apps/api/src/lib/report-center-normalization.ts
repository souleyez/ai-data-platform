import path from 'node:path';
import type {
  ReportDynamicSource,
  ReportReferenceImage,
  ReportReferenceSourceType,
  ReportTemplateType,
  ReportVisualStylePreset,
  SharedReportTemplate,
} from './report-center.js';
import type {
  ReportPlanDatavizSlot,
  ReportPlanLayoutVariant,
  ReportPlanPageSpec,
  ReportPlanVisualMixTarget,
} from './report-planner.js';
import { inferSectionDisplayModeFromTitle } from './report-visual-intent.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeTextField(value: unknown) {
  return String(value || '').trim();
}

function getExtensionFromPathLike(value: string) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  const pathname = normalized.split('?')[0].split('#')[0];
  return path.extname(pathname);
}

function normalizeReferenceName(value: string) {
  return String(value || '').trim().toLowerCase();
}

export function normalizeVisualStylePreset(value: unknown): ReportVisualStylePreset | undefined {
  const normalized = normalizeTextField(value);
  if (
    normalized === 'signal-board'
    || normalized === 'midnight-glass'
    || normalized === 'editorial-brief'
    || normalized === 'minimal-canvas'
  ) {
    return normalized;
  }
  return undefined;
}

export function resolveDefaultReportVisualStyle(layoutVariant?: ReportPlanLayoutVariant | string, title?: string): ReportVisualStylePreset {
  const normalizedLayout = normalizeTextField(layoutVariant);
  const normalizedTitle = normalizeTextField(title).toLowerCase();
  if (normalizedLayout === 'operations-cockpit') return 'signal-board';
  if (normalizedLayout === 'research-brief' || normalizedLayout === 'risk-brief') return 'editorial-brief';
  if (normalizedLayout === 'talent-showcase') return 'minimal-canvas';
  if (/workspace|overview|dashboard|cockpit|总览|经营|运营/.test(normalizedTitle)) return 'signal-board';
  return 'midnight-glass';
}

export function normalizeReferenceUrl(rawUrl: string) {
  const value = normalizeTextField(rawUrl);
  if (!value) throw new Error('reference url is required');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('reference url is invalid');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('reference url must use http or https');
  }

  return parsed.toString();
}

export function inferReportReferenceSourceType(input: {
  fileName?: string;
  mimeType?: string;
  url?: string;
}): ReportReferenceSourceType {
  const normalizedMimeType = normalizeTextField(input.mimeType).toLowerCase();
  const normalizedUrl = normalizeTextField(input.url);
  const extension = getExtensionFromPathLike(input.fileName || normalizedUrl);

  if (normalizedUrl && !extension) return 'web-link';
  if (['.doc', '.docx', '.rtf', '.odt'].includes(extension)) return 'word';
  if (['.ppt', '.pptx', '.pptm', '.key'].includes(extension)) return 'ppt';
  if (['.xls', '.xlsx', '.csv', '.tsv', '.ods'].includes(extension)) return 'spreadsheet';
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'].includes(extension)) return 'image';
  if (normalizedMimeType.includes('word') || normalizedMimeType.includes('officedocument.wordprocessingml')) return 'word';
  if (normalizedMimeType.includes('presentation') || normalizedMimeType.includes('powerpoint')) return 'ppt';
  if (normalizedMimeType.includes('spreadsheet') || normalizedMimeType.includes('excel') || normalizedMimeType.includes('csv')) return 'spreadsheet';
  if (normalizedMimeType.startsWith('image/')) return 'image';
  return normalizedUrl ? 'web-link' : 'other';
}

export function inferReportTemplateTypeFromSource(input: {
  fileName?: string;
  mimeType?: string;
  url?: string;
  sourceType?: ReportReferenceSourceType;
}): ReportTemplateType {
  const sourceType = input.sourceType || inferReportReferenceSourceType(input);
  if (sourceType === 'ppt') return 'ppt';
  if (sourceType === 'spreadsheet') return 'table';
  if (sourceType === 'word') return 'document';
  if (sourceType === 'image' || sourceType === 'web-link') return 'static-page';
  return 'document';
}

export function normalizeReportReferenceImage(reference: Partial<ReportReferenceImage> | null | undefined): ReportReferenceImage | null {
  if (!reference) return null;

  const url = normalizeTextField(reference.url);
  const kind = url ? 'link' : (reference.kind === 'link' ? 'link' : 'file');
  const normalizedUrl = kind === 'link' && url ? normalizeReferenceUrl(url) : '';
  const sourceType =
    reference.sourceType
    || inferReportReferenceSourceType({
      fileName: reference.originalName || reference.fileName,
      mimeType: reference.mimeType,
      url: normalizedUrl,
    });

  return {
    id: normalizeTextField(reference.id) || `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fileName: normalizeTextField(reference.fileName),
    originalName: normalizeTextField(reference.originalName || reference.fileName || normalizedUrl || '未命名上传内容'),
    uploadedAt: normalizeTextField(reference.uploadedAt) || new Date().toISOString(),
    relativePath: normalizeTextField(reference.relativePath),
    kind,
    sourceType,
    mimeType: normalizeTextField(reference.mimeType),
    size: Number(reference.size || 0) || 0,
    url: normalizedUrl,
  };
}

export function isUserSharedReportTemplate(template: Pick<SharedReportTemplate, 'key' | 'origin'> | null | undefined) {
  const origin = normalizeTextField(template?.origin).toLowerCase();
  if (origin) return origin === 'user';
  return !normalizeTextField(template?.key).startsWith('shared-');
}

export function findDuplicateSharedTemplateReference(
  templates: SharedReportTemplate[],
  input: {
    fileName?: string;
    url?: string;
  },
) {
  const normalizedFileName = normalizeReferenceName(input.fileName || '');
  const normalizedUrl = normalizeTextField(input.url) ? normalizeReferenceUrl(String(input.url)) : '';
  if (!normalizedFileName && !normalizedUrl) return null;

  for (const template of templates || []) {
    if (!isUserSharedReportTemplate(template)) continue;
    for (const reference of template.referenceImages || []) {
      const referenceName = normalizeReferenceName(reference.originalName || reference.fileName || '');
      const referenceUrl = normalizeTextField(reference.url);
      const duplicated =
        (normalizedFileName && referenceName === normalizedFileName)
        || (normalizedUrl && referenceUrl === normalizedUrl);
      if (!duplicated) continue;
      return {
        templateKey: template.key,
        templateLabel: template.label,
        referenceId: reference.id,
        uploadName: reference.url || reference.originalName || reference.fileName || template.label,
      };
    }
  }

  return null;
}

export function normalizeStoredDatavizSlots(value: unknown): ReportPlanDatavizSlot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const preferredChartType: ReportPlanDatavizSlot['preferredChartType'] =
        item?.preferredChartType === 'horizontal-bar' || item?.preferredChartType === 'line'
          ? item.preferredChartType
          : 'bar';
      const placement: ReportPlanDatavizSlot['placement'] =
        item?.placement === 'section' ? 'section' : 'hero';
      return {
        key: normalizeTextField(item?.key),
        title: normalizeTextField(item?.title),
        purpose: normalizeTextField(item?.purpose),
        preferredChartType,
        placement,
        sectionTitle: normalizeTextField(item?.sectionTitle),
        evidenceFocus: normalizeTextField(item?.evidenceFocus),
        minItems: Number.isFinite(Number(item?.minItems)) ? Number(item?.minItems) : 2,
        maxItems: Number.isFinite(Number(item?.maxItems)) ? Number(item?.maxItems) : 6,
      } satisfies ReportPlanDatavizSlot;
    })
    .filter((item) => item.title);
}

export function normalizeStoredPageSpec(value: unknown): ReportPlanPageSpec | undefined {
  if (!isRecord(value) || !Array.isArray(value.sections)) return undefined;

  const inferStoredDisplayMode = (
    title: string,
    rawDisplayMode: unknown,
  ): ReportPlanPageSpec['sections'][number]['displayMode'] => {
    const explicit = normalizeTextField(rawDisplayMode);
    if (
      explicit === 'summary'
      || explicit === 'insight-list'
      || explicit === 'timeline'
      || explicit === 'comparison'
      || explicit === 'cta'
      || explicit === 'appendix'
    ) {
      return explicit;
    }
    return inferSectionDisplayModeFromTitle(
      title,
      /建议|行动|应答|下一步/i.test(title) ? 'cta' : 'summary',
    );
  };

  return {
    layoutVariant: normalizeTextField(value.layoutVariant) as ReportPlanPageSpec['layoutVariant'] || 'insight-brief',
    heroCardLabels: Array.isArray(value.heroCardLabels)
      ? value.heroCardLabels.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    heroDatavizSlotKeys: Array.isArray(value.heroDatavizSlotKeys)
      ? value.heroDatavizSlotKeys.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    sections: value.sections
      .map((item: Record<string, unknown>) => {
        const title = normalizeTextField(item?.title);
        const completionMode: ReportPlanPageSpec['sections'][number]['completionMode'] =
          item?.completionMode === 'knowledge-first' ? 'knowledge-first' : 'knowledge-plus-model';
        return {
          title,
          purpose: normalizeTextField(item?.purpose),
          completionMode,
          displayMode: inferStoredDisplayMode(title, item?.displayMode),
          datavizSlotKeys: Array.isArray(item?.datavizSlotKeys)
            ? item.datavizSlotKeys.map((entry) => normalizeTextField(entry)).filter(Boolean)
            : [],
        };
      })
      .filter((item) => item.title),
  };
}

export function normalizeDynamicSource(
  dynamicSource: Partial<ReportDynamicSource> | null | undefined,
  fallback: {
    request?: string;
    kind?: ReportDynamicSource['outputType'];
    templateKey?: string;
    templateLabel?: string;
    libraries?: Array<{ key?: string; label?: string }>;
  },
): ReportDynamicSource | null {
  const enabled = Boolean(dynamicSource?.enabled) || fallback.kind === 'page';
  const outputType = (dynamicSource?.outputType || fallback.kind || 'page') as ReportDynamicSource['outputType'];
  const conceptMode = Boolean(dynamicSource?.conceptMode)
    || (outputType === 'page' && !normalizeTextField(dynamicSource?.templateKey));
  const libraries = Array.isArray(dynamicSource?.libraries) && dynamicSource?.libraries.length
    ? dynamicSource.libraries
    : Array.isArray(fallback.libraries)
      ? fallback.libraries
      : [];

  if (!enabled || !libraries.length) return null;

  return {
    enabled: true,
    request: normalizeTextField(dynamicSource?.request || fallback.request),
    outputType,
    conceptMode,
    templateKey: conceptMode ? '' : normalizeTextField(dynamicSource?.templateKey || fallback.templateKey),
    templateLabel: conceptMode ? '' : normalizeTextField(dynamicSource?.templateLabel || fallback.templateLabel),
    timeRange: normalizeTextField(dynamicSource?.timeRange),
    contentFocus: normalizeTextField(dynamicSource?.contentFocus),
    libraries: libraries
      .map((item) => ({
        key: normalizeTextField(item?.key),
        label: normalizeTextField(item?.label),
      }))
      .filter((item) => item.key || item.label),
    updatedAt: normalizeTextField(dynamicSource?.updatedAt) || new Date().toISOString(),
    lastRenderedAt: normalizeTextField(dynamicSource?.lastRenderedAt),
    sourceFingerprint: normalizeTextField(dynamicSource?.sourceFingerprint),
    sourceDocumentCount: Number(dynamicSource?.sourceDocumentCount || 0),
    sourceUpdatedAt: normalizeTextField(dynamicSource?.sourceUpdatedAt),
    planAudience: normalizeTextField(dynamicSource?.planAudience),
    planObjective: normalizeTextField(dynamicSource?.planObjective),
    planTemplateMode: normalizeTextField(dynamicSource?.planTemplateMode),
    planSectionTitles: Array.isArray(dynamicSource?.planSectionTitles)
      ? dynamicSource.planSectionTitles.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planCardLabels: Array.isArray(dynamicSource?.planCardLabels)
      ? dynamicSource.planCardLabels.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planChartTitles: Array.isArray(dynamicSource?.planChartTitles)
      ? dynamicSource.planChartTitles.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planMustHaveModules: Array.isArray(dynamicSource?.planMustHaveModules)
      ? dynamicSource.planMustHaveModules.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planOptionalModules: Array.isArray(dynamicSource?.planOptionalModules)
      ? dynamicSource.planOptionalModules.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planEvidencePriority: Array.isArray(dynamicSource?.planEvidencePriority)
      ? dynamicSource.planEvidencePriority.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planAudienceTone: normalizeTextField(dynamicSource?.planAudienceTone),
    planRiskNotes: Array.isArray(dynamicSource?.planRiskNotes)
      ? dynamicSource.planRiskNotes.map((item) => normalizeTextField(item)).filter(Boolean)
      : [],
    planVisualMixTargets: Array.isArray(dynamicSource?.planVisualMixTargets)
      ? dynamicSource.planVisualMixTargets
          .map((item) => ({
            moduleType: normalizeTextField(item?.moduleType) as ReportPlanVisualMixTarget['moduleType'],
            minCount: Number(item?.minCount || 0),
            targetCount: Number(item?.targetCount || 0),
            maxCount: Number(item?.maxCount || 0),
          }))
          .filter((item) => item.moduleType && Number.isFinite(item.minCount) && Number.isFinite(item.targetCount) && Number.isFinite(item.maxCount))
      : [],
    planDatavizSlots: normalizeStoredDatavizSlots(dynamicSource?.planDatavizSlots),
    planPageSpec: normalizeStoredPageSpec(dynamicSource?.planPageSpec),
    planUpdatedAt: normalizeTextField(dynamicSource?.planUpdatedAt),
  };
}
