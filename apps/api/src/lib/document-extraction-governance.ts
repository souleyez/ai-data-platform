import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, STORAGE_CONFIG_DIR } from './paths.js';

const DOCUMENT_EXTRACTION_GOVERNANCE_DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'document-extraction-governance.default.json');
const DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'document-extraction-governance.json');

export type DocumentGovernedSchemaType = 'contract' | 'resume' | 'technical' | 'order';
export type DocumentExtractionFieldSet = 'contract' | 'resume' | 'enterprise-guidance' | 'order';

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
};

export type DocumentExtractionGovernanceConfig = {
  version: number;
  updatedAt: string;
  profiles: DocumentExtractionProfile[];
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

function normalizeProfile(input: unknown): DocumentExtractionProfile | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Record<string, unknown>;
  const id = normalizeString(value.id);
  const fieldSet = normalizeFieldSet(value.fieldSet);
  if (!id || !fieldSet) return null;

  return {
    id,
    label: normalizeString(value.label) || id,
    matchLibraryKeys: normalizeStringList(value.matchLibraryKeys),
    matchLibraryLabels: normalizeStringList(value.matchLibraryLabels),
    fieldSet,
    fallbackSchemaType: normalizeSchemaType(value.fallbackSchemaType),
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
  for (const profile of [...defaultConfig.profiles, ...storageConfig.profiles]) {
    profileMap.set(profile.id, profile);
  }

  return {
    version: storageConfig.version || defaultConfig.version,
    updatedAt: storageConfig.updatedAt || defaultConfig.updatedAt,
    profiles: [...profileMap.values()],
  } satisfies DocumentExtractionGovernanceConfig;
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
