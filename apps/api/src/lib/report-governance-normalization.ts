import type { ReportTemplateType } from './report-standards.js';
import {
  REPORT_TEMPLATE_TYPES,
  REQUEST_ADAPTER_ENVELOPE_KINDS,
  type GovernanceEnvelope,
  type GovernanceEnvelopeOverride,
  type GovernanceTemplateSpec,
  type ReportGovernanceConfig,
  type ReportGovernanceDatasourceProfile,
  type ReportGovernanceRequestAdapterEnvelopeKind,
  type ReportGovernanceRequestAdapterProfile,
  type ReportGovernanceRequestAdapterView,
  type ReportGovernanceSystemTemplate,
  type ReportGovernanceTemplateProfile,
} from './report-governance-types.js';

export function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeStringList(input: unknown) {
  return Array.isArray(input)
    ? input.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

export function normalizeSearchText(...parts: Array<string | undefined | null>) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTemplateSpec(input: unknown): GovernanceTemplateSpec | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const type = normalizeString(value.type) as ReportTemplateType;
  if (!REPORT_TEMPLATE_TYPES.includes(type)) return null;

  const suffix = normalizeString(value.suffix);
  if (!suffix) return null;

  return {
    suffix,
    label: normalizeString(value.label) || suffix,
    type,
    description: normalizeString(value.description),
    supported: value.supported !== false,
  };
}

export function normalizeEnvelope(input: unknown): GovernanceEnvelope {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    fixedStructure: normalizeStringList(value.fixedStructure),
    variableZones: normalizeStringList(value.variableZones),
    outputHint: normalizeString(value.outputHint),
    tableColumns: normalizeStringList(value.tableColumns),
    pageSections: normalizeStringList(value.pageSections),
  };
}

export function normalizeEnvelopeOverride(input: unknown): GovernanceEnvelopeOverride {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const normalized: GovernanceEnvelopeOverride = {};

  if ('title' in value) normalized.title = normalizeString(value.title);
  if ('fixedStructure' in value) normalized.fixedStructure = normalizeStringList(value.fixedStructure);
  if ('variableZones' in value) normalized.variableZones = normalizeStringList(value.variableZones);
  if ('outputHint' in value) normalized.outputHint = normalizeString(value.outputHint);
  if ('tableColumns' in value) normalized.tableColumns = normalizeStringList(value.tableColumns);
  if ('pageSections' in value) normalized.pageSections = normalizeStringList(value.pageSections);

  return normalized;
}

export function normalizeDatasourceProfile(input: unknown): ReportGovernanceDatasourceProfile | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  if (!id) return null;

  const templates = Array.isArray(value.templates)
    ? value.templates.map(normalizeTemplateSpec).filter(Boolean) as GovernanceTemplateSpec[]
    : [];
  if (!templates.length) return null;

  const defaultTemplateSuffix = normalizeString(value.defaultTemplateSuffix)
    || templates[0]?.suffix
    || '';

  return {
    id,
    label: normalizeString(value.label) || id,
    matchKeywords: normalizeStringList(value.matchKeywords),
    description: normalizeString(value.description),
    triggerKeywords: normalizeStringList(value.triggerKeywords),
    defaultTemplateSuffix,
    templates,
  };
}

export function normalizeTemplateProfile(input: unknown): ReportGovernanceTemplateProfile | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  const type = normalizeString(value.type) as ReportTemplateType;
  if (!id || !REPORT_TEMPLATE_TYPES.includes(type)) return null;

  return {
    id,
    label: normalizeString(value.label) || id,
    type,
    matchKeywords: normalizeStringList(value.matchKeywords),
    envelope: normalizeEnvelope(value.envelope),
  };
}

export function normalizeSystemTemplate(input: unknown): ReportGovernanceSystemTemplate | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const key = normalizeString(value.key);
  const type = normalizeString(value.type) as ReportTemplateType;
  if (!key || !REPORT_TEMPLATE_TYPES.includes(type)) return null;

  return {
    key,
    label: normalizeString(value.label) || key,
    type,
    description: normalizeString(value.description),
    supported: value.supported !== false,
    isDefault: Boolean(value.isDefault),
  };
}

export function normalizeRequestAdapterView(input: unknown): ReportGovernanceRequestAdapterView | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  if (!id) return null;

  const rawKindOverrides = value.kindOverrides && typeof value.kindOverrides === 'object'
    ? value.kindOverrides as Record<string, unknown>
    : {};
  const kindOverrides: Partial<Record<ReportGovernanceRequestAdapterEnvelopeKind, GovernanceEnvelopeOverride>> = {};

  for (const kind of REQUEST_ADAPTER_ENVELOPE_KINDS) {
    if (kind in rawKindOverrides) {
      kindOverrides[kind] = normalizeEnvelopeOverride(rawKindOverrides[kind]);
    }
  }

  return {
    id,
    label: normalizeString(value.label) || id,
    matchKeywords: normalizeStringList(value.matchKeywords),
    kindOverrides,
  };
}

export function normalizeRequestAdapterProfile(input: unknown): ReportGovernanceRequestAdapterProfile | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  if (!id) return null;

  const views = Array.isArray(value.views)
    ? value.views.map(normalizeRequestAdapterView).filter(Boolean) as ReportGovernanceRequestAdapterView[]
    : [];
  if (!views.length) return null;

  const fallbackEnvelopeKind = normalizeString(value.fallbackEnvelopeKind) as ReportGovernanceRequestAdapterEnvelopeKind;
  const defaultViewId = normalizeString(value.defaultViewId) || views[0]?.id || 'generic';

  return {
    id,
    label: normalizeString(value.label) || id,
    matchKeywords: normalizeStringList(value.matchKeywords),
    defaultViewId,
    fallbackEnvelopeKind: REQUEST_ADAPTER_ENVELOPE_KINDS.includes(fallbackEnvelopeKind)
      ? fallbackEnvelopeKind
      : 'table',
    views,
  };
}

export function normalizeConfig(input: unknown): ReportGovernanceConfig {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const datasourceProfiles = Array.isArray(value.datasourceProfiles)
    ? value.datasourceProfiles.map(normalizeDatasourceProfile).filter(Boolean) as ReportGovernanceDatasourceProfile[]
    : [];
  const templateProfiles = Array.isArray(value.templateProfiles)
    ? value.templateProfiles.map(normalizeTemplateProfile).filter(Boolean) as ReportGovernanceTemplateProfile[]
    : [];
  const systemTemplates = Array.isArray(value.systemTemplates)
    ? value.systemTemplates.map(normalizeSystemTemplate).filter(Boolean) as ReportGovernanceSystemTemplate[]
    : [];
  const requestAdapterProfiles = Array.isArray(value.requestAdapterProfiles)
    ? value.requestAdapterProfiles.map(normalizeRequestAdapterProfile).filter(Boolean) as ReportGovernanceRequestAdapterProfile[]
    : [];

  return {
    version: Number(value.version || 1) || 1,
    updatedAt: normalizeString(value.updatedAt),
    datasourceProfiles,
    templateProfiles,
    systemTemplates,
    requestAdapterProfiles,
  };
}

export function mergeConfig(
  defaults: ReportGovernanceConfig,
  override: ReportGovernanceConfig | null | undefined,
): ReportGovernanceConfig {
  if (!override) return defaults;

  return {
    version: override.version || defaults.version,
    updatedAt: override.updatedAt || defaults.updatedAt,
    datasourceProfiles: override.datasourceProfiles.length ? override.datasourceProfiles : defaults.datasourceProfiles,
    templateProfiles: override.templateProfiles.length ? override.templateProfiles : defaults.templateProfiles,
    systemTemplates: override.systemTemplates.length ? override.systemTemplates : defaults.systemTemplates,
    requestAdapterProfiles: override.requestAdapterProfiles.length
      ? override.requestAdapterProfiles
      : defaults.requestAdapterProfiles,
  };
}

export function interpolateTemplate(text: string, label: string) {
  return String(text || '').replaceAll('{label}', label).trim();
}

export function resolveKeywordMatch(searchText: string, keywords: string[]) {
  const normalizedSearchText = normalizeSearchText(searchText);
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    return normalizedKeyword ? normalizedSearchText.includes(normalizedKeyword) : false;
  });
}

export function computeKeywordMatchScore(searchText: string, keywords: string[]) {
  const normalizedSearchText = normalizeSearchText(searchText);
  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    if (!normalizedKeyword || !normalizedSearchText.includes(normalizedKeyword)) {
      return score;
    }
    return score + normalizedKeyword.length;
  }, 0);
}

export function buildSearchText(...parts: Array<string | undefined | null>) {
  return normalizeSearchText(...parts);
}
