import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReportGroup } from './report-center.js';
import { REPO_ROOT, STORAGE_ROOT } from './paths.js';
import type { ReportTemplateType } from './report-standards.js';

const REPORT_GOVERNANCE_DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'report-governance.default.json');
const REPORT_GOVERNANCE_STORAGE_FILE = path.join(STORAGE_ROOT, 'control-plane', 'report-governance.json');

const REPORT_TEMPLATE_TYPES = ['table', 'static-page', 'ppt', 'document'] as const;
const REQUEST_ADAPTER_ENVELOPE_KINDS = ['page', 'table'] as const;

type GovernanceTemplateSpec = {
  suffix: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
};

type GovernanceEnvelope = {
  fixedStructure: string[];
  variableZones: string[];
  outputHint: string;
  tableColumns?: string[];
  pageSections?: string[];
};

export type GovernanceEnvelopeOverride = {
  title?: string;
  fixedStructure?: string[];
  variableZones?: string[];
  outputHint?: string;
  tableColumns?: string[];
  pageSections?: string[];
};

export type ReportGovernanceDatasourceProfile = {
  id: string;
  label: string;
  matchKeywords: string[];
  description: string;
  triggerKeywords: string[];
  defaultTemplateSuffix: string;
  templates: GovernanceTemplateSpec[];
};

export type ReportGovernanceTemplateProfile = {
  id: string;
  label: string;
  type: ReportTemplateType;
  matchKeywords: string[];
  envelope: GovernanceEnvelope;
};

export type ReportGovernanceSystemTemplate = {
  key: string;
  label: string;
  type: ReportTemplateType;
  description: string;
  supported: boolean;
  isDefault?: boolean;
};

export type ReportGovernanceRequestAdapterEnvelopeKind =
  typeof REQUEST_ADAPTER_ENVELOPE_KINDS[number];

export type ReportGovernanceRequestAdapterView = {
  id: string;
  label: string;
  matchKeywords: string[];
  kindOverrides: Partial<Record<ReportGovernanceRequestAdapterEnvelopeKind, GovernanceEnvelopeOverride>>;
};

export type ReportGovernanceRequestAdapterProfile = {
  id: string;
  label: string;
  matchKeywords: string[];
  defaultViewId: string;
  fallbackEnvelopeKind: ReportGovernanceRequestAdapterEnvelopeKind;
  views: ReportGovernanceRequestAdapterView[];
};

export type ReportGovernanceConfig = {
  version: number;
  updatedAt: string;
  datasourceProfiles: ReportGovernanceDatasourceProfile[];
  templateProfiles: ReportGovernanceTemplateProfile[];
  systemTemplates: ReportGovernanceSystemTemplate[];
  requestAdapterProfiles: ReportGovernanceRequestAdapterProfile[];
};

type RequestedKnowledgeOutputKind = 'table' | 'page' | 'pdf' | 'ppt' | 'doc' | 'md';

function readJsonObject(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeStringList(input: unknown) {
  return Array.isArray(input)
    ? input.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

function normalizeSearchText(...parts: Array<string | undefined | null>) {
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

function normalizeTemplateSpec(input: unknown): GovernanceTemplateSpec | null {
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

function normalizeEnvelope(input: unknown): GovernanceEnvelope {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    fixedStructure: normalizeStringList(value.fixedStructure),
    variableZones: normalizeStringList(value.variableZones),
    outputHint: normalizeString(value.outputHint),
    tableColumns: normalizeStringList(value.tableColumns),
    pageSections: normalizeStringList(value.pageSections),
  };
}

function normalizeEnvelopeOverride(input: unknown): GovernanceEnvelopeOverride {
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

function normalizeDatasourceProfile(input: unknown): ReportGovernanceDatasourceProfile | null {
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

function normalizeTemplateProfile(input: unknown): ReportGovernanceTemplateProfile | null {
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

function normalizeSystemTemplate(input: unknown): ReportGovernanceSystemTemplate | null {
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

function normalizeRequestAdapterView(input: unknown): ReportGovernanceRequestAdapterView | null {
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

function normalizeRequestAdapterProfile(input: unknown): ReportGovernanceRequestAdapterProfile | null {
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

function normalizeConfig(input: unknown): ReportGovernanceConfig {
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

function mergeConfig(
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

function loadNormalizedConfig(filePath: string) {
  return normalizeConfig(readJsonObject(filePath));
}

function loadConfigFromDisk() {
  const defaults = loadNormalizedConfig(REPORT_GOVERNANCE_DEFAULT_FILE);
  if (!existsSync(REPORT_GOVERNANCE_STORAGE_FILE)) {
    return defaults;
  }

  return mergeConfig(defaults, loadNormalizedConfig(REPORT_GOVERNANCE_STORAGE_FILE));
}

function interpolateTemplate(text: string, label: string) {
  return String(text || '').replaceAll('{label}', label).trim();
}

function resolveKeywordMatch(searchText: string, keywords: string[]) {
  const normalizedSearchText = normalizeSearchText(searchText);
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    return normalizedKeyword ? normalizedSearchText.includes(normalizedKeyword) : false;
  });
}

function computeKeywordMatchScore(searchText: string, keywords: string[]) {
  const normalizedSearchText = normalizeSearchText(searchText);
  return keywords.reduce((score, keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    if (!normalizedKeyword || !normalizedSearchText.includes(normalizedKeyword)) {
      return score;
    }
    return score + normalizedKeyword.length;
  }, 0);
}

function buildSearchText(...parts: Array<string | undefined | null>) {
  return normalizeSearchText(...parts);
}

function findDefaultRequestAdapterView(profile: ReportGovernanceRequestAdapterProfile) {
  return profile.views.find((item) => item.id === profile.defaultViewId)
    || profile.views[0]
    || null;
}

function resolveEnvelopeKind(
  requestedKind: RequestedKnowledgeOutputKind,
  profile: ReportGovernanceRequestAdapterProfile,
): ReportGovernanceRequestAdapterEnvelopeKind {
  if (requestedKind === 'page' || requestedKind === 'table') {
    return requestedKind;
  }
  return profile.fallbackEnvelopeKind;
}

export function readReportGovernanceConfig(): ReportGovernanceConfig {
  return loadConfigFromDisk();
}

export function buildDefaultSystemTemplates() {
  return readReportGovernanceConfig().systemTemplates;
}

export function resolveDatasourceGovernanceProfile(label: string, key: string): ReportGovernanceDatasourceProfile {
  const config = readReportGovernanceConfig();
  const searchText = buildSearchText(label, key);
  const fallback = config.datasourceProfiles.find((item) => item.id === 'default') || config.datasourceProfiles[0];

  return config.datasourceProfiles.find((item) => (
    item.id !== 'default' && resolveKeywordMatch(searchText, item.matchKeywords)
  )) || fallback;
}

export function expandDatasourceGovernanceProfile(profile: ReportGovernanceDatasourceProfile, label: string, key: string) {
  return {
    id: profile.id,
    label: profile.label,
    description: interpolateTemplate(profile.description, label),
    triggerKeywords: Array.from(new Set([label, ...profile.triggerKeywords].filter(Boolean))),
    defaultTemplateKey: `${key}-${profile.defaultTemplateSuffix}`,
    templates: profile.templates.map((template) => ({
      key: `${key}-${template.suffix}`,
      label: interpolateTemplate(template.label, label),
      type: template.type,
      description: interpolateTemplate(template.description, label),
      supported: template.supported,
    })),
  };
}

export function resolveTemplateEnvelopeProfile(template: {
  label?: string;
  description?: string;
  type: ReportTemplateType;
}) {
  const config = readReportGovernanceConfig();
  const searchText = buildSearchText(template.label || '', template.description || '');
  const fallback = config.templateProfiles.find((item) => (
    item.type === template.type && (item.id === `${template.type}-default` || !item.matchKeywords.length)
  )) || config.templateProfiles.find((item) => item.type === template.type);

  return config.templateProfiles.find((item) => (
    item.type === template.type
    && item.matchKeywords.length > 0
    && resolveKeywordMatch(searchText, item.matchKeywords)
  )) || fallback;
}

export function resolveRequestAdapterProfile(group: Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords'>) {
  const config = readReportGovernanceConfig();
  const searchText = buildSearchText(group.key, group.label, group.description, ...(group.triggerKeywords || []));

  return config.requestAdapterProfiles.find((item) => (
    item.matchKeywords.length > 0 && resolveKeywordMatch(searchText, item.matchKeywords)
  )) || null;
}

export function resolveRequestAdapterView(profile: ReportGovernanceRequestAdapterProfile, requestText: string) {
  const searchText = buildSearchText(requestText);
  const matches = profile.views
    .map((item) => ({
      item,
      score: item.matchKeywords.length > 0
        ? computeKeywordMatchScore(searchText, item.matchKeywords)
        : 0,
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return matches[0]?.item || findDefaultRequestAdapterView(profile);
}

export function resolveRequestAdapterEnvelope(
  group: Pick<ReportGroup, 'key' | 'label' | 'description' | 'triggerKeywords'>,
  requestedKind: RequestedKnowledgeOutputKind,
  requestText: string,
) {
  const profile = resolveRequestAdapterProfile(group);
  if (!profile) return null;

  const resolvedKind = resolveEnvelopeKind(requestedKind, profile);
  const defaultView = findDefaultRequestAdapterView(profile);
  const matchedView = resolveRequestAdapterView(profile, requestText);
  const override =
    matchedView?.kindOverrides?.[resolvedKind]
    || defaultView?.kindOverrides?.[resolvedKind]
    || null;

  if (!override) return null;

  return {
    profileId: profile.id,
    viewId: matchedView?.id || defaultView?.id || '',
    kind: resolvedKind,
    override,
  };
}
