'use client';

import { buildApiUrl } from './config';

const DATASET_SECRET_GRANTS_STORAGE_KEY = 'aidp_dataset_secret_grants_v1';
const DATASET_SECRET_ACTIVE_STORAGE_KEY = 'aidp_dataset_secret_active_grant_v1';

function normalizeLibraryKeys(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  )];
}

export function createEmptyDatasetSecretState() {
  return {
    grants: [],
    activeGrant: null,
    unlockedLibraryKeys: [],
    activeLibraryKeys: [],
  };
}

export function normalizeDatasetSecretGrant(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  if (!source) return null;
  const bindingId = String(source.bindingId || '').trim();
  const fingerprint = String(source.fingerprint || '').trim();
  const issuedAt = String(source.issuedAt || '').trim();
  const signature = String(source.signature || '').trim();
  const version = Number(source.version || 0);
  const libraryKeys = normalizeLibraryKeys(source.libraryKeys);
  if (!bindingId || !fingerprint || !issuedAt || !signature || version !== 1 || !libraryKeys.length) {
    return null;
  }
  return {
    version,
    bindingId,
    fingerprint,
    issuedAt,
    signature,
    libraryKeys,
  };
}

function normalizeDatasetSecretState(value) {
  const grants = Array.isArray(value?.grants)
    ? value.grants.map(normalizeDatasetSecretGrant).filter(Boolean)
    : [];
  const activeGrantCandidate = normalizeDatasetSecretGrant(value?.activeGrant);
  const activeGrant = activeGrantCandidate
    ? grants.find((grant) => grant.bindingId === activeGrantCandidate.bindingId && grant.signature === activeGrantCandidate.signature) || null
    : null;
  const fallbackActiveGrant = activeGrant || grants[0] || null;
  return {
    grants,
    activeGrant: fallbackActiveGrant,
    unlockedLibraryKeys: normalizeLibraryKeys(value?.unlockedLibraryKeys || grants.flatMap((grant) => grant.libraryKeys)),
    activeLibraryKeys: normalizeLibraryKeys(value?.activeLibraryKeys || fallbackActiveGrant?.libraryKeys || []),
  };
}

function safeReadJson(storageKey) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function loadStoredDatasetSecretState() {
  if (typeof window === 'undefined') return createEmptyDatasetSecretState();
  const grants = safeReadJson(DATASET_SECRET_GRANTS_STORAGE_KEY);
  const activeGrant = safeReadJson(DATASET_SECRET_ACTIVE_STORAGE_KEY);
  return normalizeDatasetSecretState({
    grants: Array.isArray(grants) ? grants : [],
    activeGrant,
  });
}

export function persistDatasetSecretState(state) {
  if (typeof window === 'undefined') return normalizeDatasetSecretState(state);
  const normalized = normalizeDatasetSecretState(state);
  try {
    if (normalized.grants.length) {
      window.localStorage.setItem(DATASET_SECRET_GRANTS_STORAGE_KEY, JSON.stringify(normalized.grants));
    } else {
      window.localStorage.removeItem(DATASET_SECRET_GRANTS_STORAGE_KEY);
    }
    if (normalized.activeGrant) {
      window.localStorage.setItem(DATASET_SECRET_ACTIVE_STORAGE_KEY, JSON.stringify(normalized.activeGrant));
    } else {
      window.localStorage.removeItem(DATASET_SECRET_ACTIVE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures and return the normalized in-memory shape.
  }
  return normalized;
}

export function clearStoredDatasetSecretState() {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(DATASET_SECRET_GRANTS_STORAGE_KEY);
      window.localStorage.removeItem(DATASET_SECRET_ACTIVE_STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  }
  return createEmptyDatasetSecretState();
}

async function requestDatasetSecretJson(path, payload) {
  const response = await fetch(buildApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  const raw = await response.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }
  if (!response.ok) {
    throw new Error(json?.error || raw || 'dataset secret request failed');
  }
  return json;
}

export async function resolveStoredDatasetSecretState() {
  const stored = loadStoredDatasetSecretState();
  const resolved = normalizeDatasetSecretState(await requestDatasetSecretJson('/api/dataset-secrets/resolve', {
    grants: stored.grants,
    activeGrant: stored.activeGrant,
  }));
  return persistDatasetSecretState(resolved);
}

export async function verifyDatasetSecretText(secret, currentState = loadStoredDatasetSecretState()) {
  const normalizedSecret = String(secret || '').trim();
  if (!normalizedSecret) {
    throw new Error('请输入密钥');
  }

  const verified = await requestDatasetSecretJson('/api/dataset-secrets/verify', {
    secret: normalizedSecret,
  });
  const nextState = normalizeDatasetSecretState({
    grants: [
      ...currentState.grants.filter((grant) => grant.bindingId !== verified?.grant?.bindingId),
      verified?.grant,
    ],
    activeGrant: verified?.activeGrant || verified?.grant || null,
  });
  return persistDatasetSecretState(nextState);
}

export function setActiveDatasetSecretGrant(currentState, bindingId) {
  const normalized = normalizeDatasetSecretState(currentState);
  const activeGrant = normalized.grants.find((grant) => grant.bindingId === String(bindingId || '').trim()) || null;
  return persistDatasetSecretState({
    ...normalized,
    activeGrant,
    activeLibraryKeys: normalizeLibraryKeys(activeGrant?.libraryKeys || []),
  });
}

export function isLibraryUnlocked(library, datasetSecretState) {
  if (!library?.secretProtected) return true;
  const unlocked = new Set(normalizeDatasetSecretState(datasetSecretState).unlockedLibraryKeys);
  return unlocked.has(String(library?.key || '').trim());
}
