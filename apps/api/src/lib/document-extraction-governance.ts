import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, STORAGE_CONFIG_DIR } from './paths.js';

const DOCUMENT_EXTRACTION_GOVERNANCE_DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'document-extraction-governance.default.json');
const DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'document-extraction-governance.json');

export type DocumentGovernedSchemaType = 'contract' | 'resume' | 'technical' | 'order';
export type DocumentExtractionFieldSet = 'contract' | 'resume' | 'enterprise-guidance' | 'order';
export type DocumentExtractionFieldKey =
  | 'contractNo'
  | 'partyA'
  | 'partyB'
  | 'amount'
  | 'signDate'
  | 'effectiveDate'
  | 'paymentTerms'
  | 'duration'
  | 'candidateName'
  | 'targetRole'
  | 'currentRole'
  | 'yearsOfExperience'
  | 'education'
  | 'major'
  | 'expectedCity'
  | 'expectedSalary'
  | 'latestCompany'
  | 'companies'
  | 'skills'
  | 'highlights'
  | 'projectHighlights'
  | 'itProjectHighlights'
  | 'businessSystem'
  | 'documentKind'
  | 'applicableScope'
  | 'operationEntry'
  | 'approvalLevels'
  | 'policyFocus'
  | 'contacts'
  | 'period'
  | 'platform'
  | 'orderCount'
  | 'netSales'
  | 'grossMargin'
  | 'topCategory'
  | 'inventoryStatus'
  | 'replenishmentAction';

export const DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET: Record<DocumentExtractionFieldSet, DocumentExtractionFieldKey[]> = {
  contract: ['contractNo', 'partyA', 'partyB', 'amount', 'signDate', 'effectiveDate', 'paymentTerms', 'duration'],
  resume: [
    'candidateName',
    'targetRole',
    'currentRole',
    'yearsOfExperience',
    'education',
    'major',
    'expectedCity',
    'expectedSalary',
    'latestCompany',
    'companies',
    'skills',
    'highlights',
    'projectHighlights',
    'itProjectHighlights',
  ],
  'enterprise-guidance': [
    'businessSystem',
    'documentKind',
    'applicableScope',
    'operationEntry',
    'approvalLevels',
    'policyFocus',
    'contacts',
  ],
  order: [
    'period',
    'platform',
    'orderCount',
    'netSales',
    'grossMargin',
    'topCategory',
    'inventoryStatus',
    'replenishmentAction',
  ],
};

export type DocumentLibraryContext = {
  keys: string[];
  labels: string[];
};

export type DocumentExtractionProfile = {
  id: string;
  label: string;
  matchLibraryKeys: string[];
  matchLibraryLabels: string[];
  fieldSet: DocumentExtractionFieldSet;
  fallbackSchemaType?: DocumentGovernedSchemaType;
  preferredFieldKeys?: DocumentExtractionFieldKey[];
  requiredFieldKeys?: DocumentExtractionFieldKey[];
  fieldAliases?: Partial<Record<DocumentExtractionFieldKey, string>>;
};

export type DocumentExtractionGovernanceConfig = {
  version: number;
  updatedAt: string;
  profiles: DocumentExtractionProfile[];
};

export type DocumentLibraryExtractionSettings = {
  profileId?: string;
  fieldSet?: DocumentExtractionFieldSet;
  fallbackSchemaType?: DocumentGovernedSchemaType;
  preferredFieldKeys?: DocumentExtractionFieldKey[];
  requiredFieldKeys?: DocumentExtractionFieldKey[];
  fieldAliases?: Partial<Record<DocumentExtractionFieldKey, string>>;
};

function readJsonObject(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function normalizeString(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => normalizeString(item).toLowerCase()).filter(Boolean))]
    : [];
}

function normalizeFieldSet(value: unknown) {
  const normalized = normalizeString(value);
  return normalized === 'contract'
    || normalized === 'resume'
    || normalized === 'enterprise-guidance'
    || normalized === 'order'
    ? normalized
    : null;
}

function normalizeSchemaType(value: unknown) {
  const normalized = normalizeString(value);
  return normalized === 'contract'
    || normalized === 'resume'
    || normalized === 'technical'
    || normalized === 'order'
    ? normalized
    : undefined;
}

function normalizePreferredFieldKeys(fieldSet: DocumentExtractionFieldSet, value: unknown) {
  const allowed = new Set(DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet]);
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];

  return [...new Set(
    rawValues
      .map((item) => normalizeString(item))
      .filter(Boolean)
      .filter((item): item is DocumentExtractionFieldKey => allowed.has(item as DocumentExtractionFieldKey)),
  )];
}

function normalizeRequiredFieldKeys(
  fieldSet: DocumentExtractionFieldSet,
  preferredFieldKeys: DocumentExtractionFieldKey[] | undefined,
  value: unknown,
) {
  const allowed = new Set(
    Array.isArray(preferredFieldKeys) && preferredFieldKeys.length
      ? preferredFieldKeys
      : DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet],
  );
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n]/)
      : [];

  return [...new Set(
    rawValues
      .map((item) => normalizeString(item))
      .filter(Boolean)
      .filter((item): item is DocumentExtractionFieldKey => allowed.has(item as DocumentExtractionFieldKey)),
  )];
}

function normalizeFieldAliases(fieldSet: DocumentExtractionFieldSet, value: unknown) {
  const allowed = new Set(DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET[fieldSet]);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

  const aliases = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, alias]) => [normalizeString(key), normalizeString(alias)])
      .filter(([key, alias]) => key && alias && !/^[?？]+$/.test(alias))
      .filter(([key]) => allowed.has(key as DocumentExtractionFieldKey)),
  ) as Partial<Record<DocumentExtractionFieldKey, string>>;

  return Object.keys(aliases).length ? aliases : undefined;
}

function hasOwnProperty(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function shouldPreserveDefaultPreferredFieldKeys(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && Array.isArray(existing.preferredFieldKeys)
    && existing.preferredFieldKeys.length > 0
    && Array.isArray(incoming.preferredFieldKeys)
    && incoming.preferredFieldKeys.length === 0;
}

function shouldPreserveDefaultRequiredFieldKeys(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && Array.isArray(existing.requiredFieldKeys)
    && existing.requiredFieldKeys.length > 0
    && Array.isArray(incoming.requiredFieldKeys)
    && incoming.requiredFieldKeys.length === 0;
}

function shouldPreserveDefaultFieldAliases(
  existing: DocumentExtractionProfile,
  incoming: DocumentExtractionProfile,
) {
  return !incoming.id.startsWith('library-')
    && existing.fieldAliases
    && Object.keys(existing.fieldAliases).length > 0
    && incoming.fieldAliases
    && Object.keys(incoming.fieldAliases).length === 0;
}

function normalizeProfile(input: unknown): DocumentExtractionProfile | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  const fieldSet = normalizeFieldSet(value.fieldSet);
  if (!id || !fieldSet) return null;
  const preferredFieldKeys = hasOwnProperty(value, 'preferredFieldKeys')
    ? normalizePreferredFieldKeys(fieldSet, value.preferredFieldKeys)
    : undefined;

  return {
    id,
    label: normalizeString(value.label) || id,
    matchLibraryKeys: normalizeStringList(value.matchLibraryKeys),
    matchLibraryLabels: normalizeStringList(value.matchLibraryLabels),
    fieldSet,
    fallbackSchemaType: normalizeSchemaType(value.fallbackSchemaType),
    preferredFieldKeys,
    requiredFieldKeys: hasOwnProperty(value, 'requiredFieldKeys')
      ? normalizeRequiredFieldKeys(fieldSet, preferredFieldKeys, value.requiredFieldKeys)
      : undefined,
    fieldAliases: hasOwnProperty(value, 'fieldAliases')
      ? normalizeFieldAliases(fieldSet, value.fieldAliases)
      : undefined,
  };
}

function normalizeGovernance(input: unknown): DocumentExtractionGovernanceConfig {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const profiles = Array.isArray(value.profiles)
    ? value.profiles.map(normalizeProfile).filter(Boolean) as DocumentExtractionProfile[]
    : [];

  return {
    version: Number(value.version) || 1,
    updatedAt: normalizeString(value.updatedAt) || new Date().toISOString(),
    profiles,
  };
}

export function loadDocumentExtractionGovernance() {
  const defaultConfig = normalizeGovernance(
    existsSync(DOCUMENT_EXTRACTION_GOVERNANCE_DEFAULT_FILE)
      ? readJsonObject(DOCUMENT_EXTRACTION_GOVERNANCE_DEFAULT_FILE)
      : {},
  );
  const storageConfig = normalizeGovernance(
    existsSync(DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE)
      ? readJsonObject(DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE)
      : {},
  );

  const profileMap = new Map<string, DocumentExtractionProfile>();
  for (const profile of defaultConfig.profiles) {
    profileMap.set(profile.id, profile);
  }

  for (const profile of storageConfig.profiles) {
    const existing = profileMap.get(profile.id);
    if (!existing) {
      profileMap.set(profile.id, profile);
      continue;
    }

    profileMap.set(profile.id, {
      ...existing,
      ...profile,
      preferredFieldKeys: shouldPreserveDefaultPreferredFieldKeys(existing, profile)
        ? existing.preferredFieldKeys
        : (profile.preferredFieldKeys ?? existing.preferredFieldKeys),
      requiredFieldKeys: shouldPreserveDefaultRequiredFieldKeys(existing, profile)
        ? existing.requiredFieldKeys
        : (profile.requiredFieldKeys ?? existing.requiredFieldKeys),
      fieldAliases: shouldPreserveDefaultFieldAliases(existing, profile)
        ? existing.fieldAliases
        : (profile.fieldAliases ?? existing.fieldAliases),
    });
  }

  return {
    version: storageConfig.version || defaultConfig.version,
    updatedAt: storageConfig.updatedAt || defaultConfig.updatedAt,
    profiles: [...profileMap.values()],
  } satisfies DocumentExtractionGovernanceConfig;
}

async function writeDocumentExtractionGovernance(config: DocumentExtractionGovernanceConfig) {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
  const tempFile = `${DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE}.tmp`;
  await fs.writeFile(
    tempFile,
    JSON.stringify({
      version: config.version || 1,
      updatedAt: new Date().toISOString(),
      profiles: config.profiles,
    }, null, 2),
    'utf8',
  );
  await fs.rename(tempFile, DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE);
}

function normalizeLibraryOverrideProfileId(libraryKey: string) {
  return `library-${normalizeString(libraryKey).toLowerCase()}`;
}

function normalizeOptionalFieldSet(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized || normalized === 'auto') return undefined;
  return normalizeFieldSet(normalized) || undefined;
}

function normalizeOptionalSchemaType(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized || normalized === 'auto') return undefined;
  return normalizeSchemaType(normalized);
}

function inferFieldSetFromSchemaType(
  schemaType?: DocumentGovernedSchemaType,
): DocumentExtractionFieldSet | undefined {
  if (schemaType === 'contract') return 'contract';
  if (schemaType === 'resume') return 'resume';
  if (schemaType === 'technical') return 'enterprise-guidance';
  if (schemaType === 'order') return 'order';
  return undefined;
}

export function getDocumentLibraryExtractionSettings(
  config: DocumentExtractionGovernanceConfig,
  library: { key: string; label: string },
) {
  const overrideId = normalizeLibraryOverrideProfileId(library.key);
  const override = config.profiles.find((profile) => profile.id === overrideId)
    || config.profiles.find((profile) => profile.matchLibraryKeys.includes(normalizeString(library.key).toLowerCase()));

  if (!override) return {} satisfies DocumentLibraryExtractionSettings;
  return {
    profileId: override.id,
    fieldSet: override.fieldSet,
    fallbackSchemaType: override.fallbackSchemaType,
    preferredFieldKeys: override.preferredFieldKeys,
    requiredFieldKeys: override.requiredFieldKeys,
    fieldAliases: override.fieldAliases,
  } satisfies DocumentLibraryExtractionSettings;
}

export function attachDocumentExtractionSettings<T extends { key: string; label: string }>(
  libraries: T[],
  config = loadDocumentExtractionGovernance(),
) {
  return libraries.map((library) => ({
    ...library,
    extractionSettings: getDocumentLibraryExtractionSettings(config, library),
  }));
}

export async function updateLibraryDocumentExtractionSettings(
  input: {
    key: string;
    label: string;
    fieldSet?: string;
    fallbackSchemaType?: string;
    preferredFieldKeys?: string[];
    requiredFieldKeys?: string[];
    fieldAliases?: Record<string, string>;
  },
) {
  const key = normalizeString(input.key);
  const label = normalizeString(input.label);
  if (!key || !label) {
    throw new Error('library key and label are required');
  }

  const current = loadDocumentExtractionGovernance();
  const overrideId = normalizeLibraryOverrideProfileId(key);
  const existingOverride = current.profiles.find((profile) => profile.id === overrideId);
  const fieldSet = normalizeOptionalFieldSet(input.fieldSet);
  const fallbackSchemaType = normalizeOptionalSchemaType(input.fallbackSchemaType);
  const requestedPreferredFieldKeys = Array.isArray(input.preferredFieldKeys)
    ? input.preferredFieldKeys.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const requestedRequiredFieldKeys = Array.isArray(input.requiredFieldKeys)
    ? input.requiredFieldKeys.map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const requestedFieldAliases = input.fieldAliases && typeof input.fieldAliases === 'object'
    ? input.fieldAliases
    : {};
  const requestedReset = normalizeString(input.fieldSet).toLowerCase() === 'auto'
    && normalizeString(input.fallbackSchemaType).toLowerCase() === 'auto';
  const nextProfiles = current.profiles.filter((profile) => profile.id !== overrideId);
  const nextFieldSet = requestedReset
    ? undefined
    : (fieldSet || existingOverride?.fieldSet || inferFieldSetFromSchemaType(fallbackSchemaType));
  const nextPreferredFieldKeys = nextFieldSet
    ? normalizePreferredFieldKeys(
        nextFieldSet,
        requestedPreferredFieldKeys.length
          ? requestedPreferredFieldKeys
          : (existingOverride?.preferredFieldKeys || []),
      )
    : [];
  const nextRequiredFieldKeys = nextFieldSet
    ? normalizeRequiredFieldKeys(
        nextFieldSet,
        nextPreferredFieldKeys,
        requestedRequiredFieldKeys.length
          ? requestedRequiredFieldKeys
          : (existingOverride?.requiredFieldKeys || []),
      )
    : [];
  const nextFieldAliases = nextFieldSet
    ? normalizeFieldAliases(
        nextFieldSet,
        Object.keys(requestedFieldAliases).length
          ? requestedFieldAliases
          : (existingOverride?.fieldAliases || {}),
      )
    : undefined;

  if (nextFieldSet || fallbackSchemaType) {
    nextProfiles.push({
      id: overrideId,
      label: `${label} 提取模板`,
      matchLibraryKeys: [key.toLowerCase()],
      matchLibraryLabels: [label.toLowerCase()],
      fieldSet: nextFieldSet || 'contract',
      fallbackSchemaType,
      preferredFieldKeys: nextPreferredFieldKeys,
      requiredFieldKeys: nextRequiredFieldKeys,
      fieldAliases: nextFieldAliases,
    });
  }

  const nextConfig = {
    version: current.version || 1,
    updatedAt: new Date().toISOString(),
    profiles: nextProfiles,
  } satisfies DocumentExtractionGovernanceConfig;

  await writeDocumentExtractionGovernance(nextConfig);
  return nextConfig;
}

export async function deleteLibraryDocumentExtractionSettings(libraryKey: string) {
  const key = normalizeString(libraryKey);
  if (!key) return;

  const current = loadDocumentExtractionGovernance();
  const overrideId = normalizeLibraryOverrideProfileId(key);
  const nextProfiles = current.profiles.filter((profile) => profile.id !== overrideId);
  if (nextProfiles.length === current.profiles.length) return;

  await writeDocumentExtractionGovernance({
    version: current.version || 1,
    updatedAt: new Date().toISOString(),
    profiles: nextProfiles,
  });
}

export function buildDocumentLibraryContext(
  libraries: Array<{ key: string; label: string }>,
  libraryKeys: string[],
): DocumentLibraryContext | undefined {
  const keys = [...new Set((libraryKeys || []).map((item) => normalizeString(item)).filter(Boolean))];
  if (!keys.length) return undefined;

  const labels = [...new Set(
    keys
      .map((key) => libraries.find((library) => library.key === key)?.label || key)
      .map((item) => normalizeString(item))
      .filter(Boolean),
  )];

  return { keys, labels };
}

export function resolveDocumentExtractionProfile(
  config: DocumentExtractionGovernanceConfig,
  libraryContext?: DocumentLibraryContext,
) {
  if (!libraryContext || !config.profiles.length) return null;

  const keySet = new Set((libraryContext.keys || []).map((item) => normalizeString(item).toLowerCase()).filter(Boolean));
  const labelSet = new Set((libraryContext.labels || []).map((item) => normalizeString(item).toLowerCase()).filter(Boolean));

  return config.profiles.find((profile) =>
    profile.matchLibraryKeys.some((item) => keySet.has(item))
    || profile.matchLibraryLabels.some((item) => labelSet.has(item)),
  ) || null;
}
