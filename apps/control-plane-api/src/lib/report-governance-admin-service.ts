import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { CONTROL_PLANE_STORAGE_DIR, REPO_ROOT } from './paths.js';

const REPORT_GOVERNANCE_DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'report-governance.default.json');
const REPORT_GOVERNANCE_STORAGE_FILE = path.join(CONTROL_PLANE_STORAGE_DIR, 'report-governance.json');

const REPORT_TEMPLATE_TYPES = ['table', 'static-page', 'ppt', 'document'] as const;
const REQUEST_ADAPTER_ENVELOPE_KINDS = ['page', 'table'] as const;
const REPORT_TEMPLATE_TYPE_VALUES: readonly string[] = REPORT_TEMPLATE_TYPES;
const REQUEST_ADAPTER_ENVELOPE_KIND_VALUES: readonly string[] = REQUEST_ADAPTER_ENVELOPE_KINDS;

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeStringList(input: unknown) {
  return Array.isArray(input)
    ? input.map((item) => normalizeString(item)).filter(Boolean)
    : [];
}

function normalizeEnvelope(input: unknown) {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    fixedStructure: normalizeStringList(value.fixedStructure),
    variableZones: normalizeStringList(value.variableZones),
    outputHint: normalizeString(value.outputHint),
    tableColumns: normalizeStringList(value.tableColumns),
    pageSections: normalizeStringList(value.pageSections),
  };
}

function normalizeEnvelopeOverride(input: unknown) {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const normalized: Record<string, unknown> = {};

  if ('title' in value) normalized.title = normalizeString(value.title);
  if ('fixedStructure' in value) normalized.fixedStructure = normalizeStringList(value.fixedStructure);
  if ('variableZones' in value) normalized.variableZones = normalizeStringList(value.variableZones);
  if ('outputHint' in value) normalized.outputHint = normalizeString(value.outputHint);
  if ('tableColumns' in value) normalized.tableColumns = normalizeStringList(value.tableColumns);
  if ('pageSections' in value) normalized.pageSections = normalizeStringList(value.pageSections);

  return normalized;
}

function normalizeTemplateSpec(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const type = normalizeString(value.type);
  const suffix = normalizeString(value.suffix);
  if (!suffix || !REPORT_TEMPLATE_TYPE_VALUES.includes(type)) return null;

  return {
    suffix,
    label: normalizeString(value.label) || suffix,
    type,
    description: normalizeString(value.description),
    supported: value.supported !== false,
  };
}

function normalizeDatasourceProfile(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  if (!id) return null;

  const templates = Array.isArray(value.templates)
    ? value.templates.map(normalizeTemplateSpec).filter(Boolean)
    : [];
  if (!templates.length) return null;

  return {
    id,
    label: normalizeString(value.label) || id,
    matchKeywords: normalizeStringList(value.matchKeywords),
    description: normalizeString(value.description),
    triggerKeywords: normalizeStringList(value.triggerKeywords),
    defaultTemplateSuffix: normalizeString(value.defaultTemplateSuffix) || String(templates[0]?.suffix || ''),
    templates,
  };
}

function normalizeTemplateProfile(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  const type = normalizeString(value.type);
  if (!id || !REPORT_TEMPLATE_TYPE_VALUES.includes(type)) return null;

  return {
    id,
    label: normalizeString(value.label) || id,
    type,
    matchKeywords: normalizeStringList(value.matchKeywords),
    envelope: normalizeEnvelope(value.envelope),
  };
}

function normalizeSystemTemplate(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const key = normalizeString(value.key);
  const type = normalizeString(value.type);
  if (!key || !REPORT_TEMPLATE_TYPE_VALUES.includes(type)) return null;

  return {
    key,
    label: normalizeString(value.label) || key,
    type,
    description: normalizeString(value.description),
    supported: value.supported !== false,
    isDefault: Boolean(value.isDefault),
  };
}

function normalizeRequestAdapterView(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  if (!id) return null;

  const rawKindOverrides = value.kindOverrides && typeof value.kindOverrides === 'object'
    ? value.kindOverrides as Record<string, unknown>
    : {};
  const kindOverrides: Record<string, unknown> = {};

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

function normalizeRequestAdapterProfile(input: unknown) {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  if (!id) return null;

  const views = Array.isArray(value.views)
    ? value.views.map(normalizeRequestAdapterView).filter(Boolean)
    : [];
  if (!views.length) return null;

  const fallbackEnvelopeKind = normalizeString(value.fallbackEnvelopeKind);
  return {
    id,
    label: normalizeString(value.label) || id,
    matchKeywords: normalizeStringList(value.matchKeywords),
    defaultViewId: normalizeString(value.defaultViewId) || String(views[0]?.id || 'generic'),
    fallbackEnvelopeKind: REQUEST_ADAPTER_ENVELOPE_KIND_VALUES.includes(fallbackEnvelopeKind) ? fallbackEnvelopeKind : 'table',
    views,
  };
}

function normalizeConfig(input: unknown) {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    version: Number(value.version || 1) || 1,
    updatedAt: normalizeString(value.updatedAt),
    datasourceProfiles: Array.isArray(value.datasourceProfiles)
      ? value.datasourceProfiles.map(normalizeDatasourceProfile).filter(Boolean)
      : [],
    templateProfiles: Array.isArray(value.templateProfiles)
      ? value.templateProfiles.map(normalizeTemplateProfile).filter(Boolean)
      : [],
    systemTemplates: Array.isArray(value.systemTemplates)
      ? value.systemTemplates.map(normalizeSystemTemplate).filter(Boolean)
      : [],
    requestAdapterProfiles: Array.isArray(value.requestAdapterProfiles)
      ? value.requestAdapterProfiles.map(normalizeRequestAdapterProfile).filter(Boolean)
      : [],
  };
}

function mergeConfig(defaultConfig: Record<string, unknown>, overrideConfig: Record<string, unknown> | null | undefined) {
  if (!overrideConfig) return defaultConfig;

  const override = overrideConfig as {
    version?: number;
    updatedAt?: string;
    datasourceProfiles?: unknown[];
    templateProfiles?: unknown[];
    systemTemplates?: unknown[];
    requestAdapterProfiles?: unknown[];
  };

  return {
    version: Number(override.version || defaultConfig.version || 1) || 1,
    updatedAt: normalizeString(override.updatedAt) || normalizeString(defaultConfig.updatedAt),
    datasourceProfiles: Array.isArray(override.datasourceProfiles) && override.datasourceProfiles.length
      ? override.datasourceProfiles
      : defaultConfig.datasourceProfiles,
    templateProfiles: Array.isArray(override.templateProfiles) && override.templateProfiles.length
      ? override.templateProfiles
      : defaultConfig.templateProfiles,
    systemTemplates: Array.isArray(override.systemTemplates) && override.systemTemplates.length
      ? override.systemTemplates
      : defaultConfig.systemTemplates,
    requestAdapterProfiles: Array.isArray(override.requestAdapterProfiles) && override.requestAdapterProfiles.length
      ? override.requestAdapterProfiles
      : defaultConfig.requestAdapterProfiles,
  };
}

async function readJson(filePath: string) {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as Record<string, unknown>;
}

async function ensureStorageDir() {
  await fs.mkdir(CONTROL_PLANE_STORAGE_DIR, { recursive: true });
}

async function readDefaultConfig() {
  return normalizeConfig(await readJson(REPORT_GOVERNANCE_DEFAULT_FILE));
}

export async function getAdminReportGovernance() {
  const defaultConfig = await readDefaultConfig();
  if (!existsSync(REPORT_GOVERNANCE_STORAGE_FILE)) {
    return defaultConfig;
  }

  const storedConfig = normalizeConfig(await readJson(REPORT_GOVERNANCE_STORAGE_FILE));
  return mergeConfig(defaultConfig, storedConfig);
}

export async function updateAdminReportGovernance(input: unknown) {
  const defaultConfig = await readDefaultConfig();
  const normalized = normalizeConfig(input);
  const merged = mergeConfig(defaultConfig, normalized);

  if (!Array.isArray(merged.datasourceProfiles) || !merged.datasourceProfiles.length) {
    throw new Error('REPORT_GOVERNANCE_DATASOURCE_PROFILES_REQUIRED');
  }
  if (!Array.isArray(merged.templateProfiles) || !merged.templateProfiles.length) {
    throw new Error('REPORT_GOVERNANCE_TEMPLATE_PROFILES_REQUIRED');
  }
  if (!Array.isArray(merged.systemTemplates) || !merged.systemTemplates.length) {
    throw new Error('REPORT_GOVERNANCE_SYSTEM_TEMPLATES_REQUIRED');
  }
  if (!Array.isArray(merged.requestAdapterProfiles) || !merged.requestAdapterProfiles.length) {
    throw new Error('REPORT_GOVERNANCE_REQUEST_ADAPTER_PROFILES_REQUIRED');
  }

  await ensureStorageDir();
  const next = {
    ...merged,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(REPORT_GOVERNANCE_STORAGE_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}
