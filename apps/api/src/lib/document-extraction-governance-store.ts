import { existsSync, readFileSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  normalizeDocumentExtractionGovernance,
  shouldPreserveDefaultFieldAliases,
  shouldPreserveDefaultFieldConflictStrategies,
  shouldPreserveDefaultFieldNormalizationRules,
  shouldPreserveDefaultFieldPrompts,
  shouldPreserveDefaultPreferredFieldKeys,
  shouldPreserveDefaultRequiredFieldKeys,
} from './document-extraction-governance-normalization.js';
import {
  type DocumentExtractionGovernanceConfig,
  type DocumentExtractionProfile,
} from './document-extraction-governance-types.js';
import { REPO_ROOT, STORAGE_CONFIG_DIR } from './paths.js';

const DOCUMENT_EXTRACTION_GOVERNANCE_DEFAULT_FILE = path.join(REPO_ROOT, 'config', 'document-extraction-governance.default.json');
const DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE = path.join(STORAGE_CONFIG_DIR, 'document-extraction-governance.json');

function readJsonObject(filePath: string) {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function mergeDocumentExtractionProfiles(
  defaults: DocumentExtractionProfile[],
  overrides: DocumentExtractionProfile[],
) {
  const profileMap = new Map<string, DocumentExtractionProfile>();
  for (const profile of defaults) {
    profileMap.set(profile.id, profile);
  }

  for (const profile of overrides) {
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
      fieldPrompts: shouldPreserveDefaultFieldPrompts(existing, profile)
        ? existing.fieldPrompts
        : (profile.fieldPrompts ?? existing.fieldPrompts),
      fieldNormalizationRules: shouldPreserveDefaultFieldNormalizationRules(existing, profile)
        ? existing.fieldNormalizationRules
        : (profile.fieldNormalizationRules ?? existing.fieldNormalizationRules),
      fieldConflictStrategies: shouldPreserveDefaultFieldConflictStrategies(existing, profile)
        ? existing.fieldConflictStrategies
        : (profile.fieldConflictStrategies ?? existing.fieldConflictStrategies),
    });
  }

  return [...profileMap.values()];
}

export function loadDocumentExtractionGovernance() {
  const defaultConfig = normalizeDocumentExtractionGovernance(
    existsSync(DOCUMENT_EXTRACTION_GOVERNANCE_DEFAULT_FILE)
      ? readJsonObject(DOCUMENT_EXTRACTION_GOVERNANCE_DEFAULT_FILE)
      : {},
  );
  const storageConfig = normalizeDocumentExtractionGovernance(
    existsSync(DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE)
      ? readJsonObject(DOCUMENT_EXTRACTION_GOVERNANCE_STORAGE_FILE)
      : {},
  );

  return {
    version: storageConfig.version || defaultConfig.version,
    updatedAt: storageConfig.updatedAt || defaultConfig.updatedAt,
    profiles: mergeDocumentExtractionProfiles(defaultConfig.profiles, storageConfig.profiles),
  } satisfies DocumentExtractionGovernanceConfig;
}

export async function writeDocumentExtractionGovernance(config: DocumentExtractionGovernanceConfig) {
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
