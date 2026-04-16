'use client';

import { buildApiUrl } from '../lib/config';
import { loadStoredDatasetSecretState } from '../lib/dataset-secrets';
import { normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';

async function requestJson(path, options) {
  const response = await fetch(buildApiUrl(path), {
    cache: 'no-store',
    ...(options || {}),
  });
  if (!response.ok) {
    let message = `request failed: ${path}`;
    try {
      const payload = await response.json();
      message = payload?.message || payload?.error || message;
    } catch {
      try {
        const text = await response.text();
        if (text) message = text;
      } catch {
        // ignore
      }
    }
    throw new Error(message);
  }
  return response.json();
}

export async function fetchDocuments() {
  const payload = await requestJson('/api/documents');
  return normalizeDocumentsResponse(payload);
}

export async function fetchDatasources() {
  const payload = await requestJson('/api/datasources');
  return normalizeDatasourceResponse(payload);
}

export async function createDocumentLibrary(name, description = '', permissionLevel = 0, options = {}) {
  const datasetSecretState = options.datasetSecretState || loadStoredDatasetSecretState();
  return requestJson('/api/documents/libraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      description,
      permissionLevel,
      secret: typeof options.secret === 'string' ? options.secret : '',
      clearSecret: options.clearSecret === true,
      datasetSecretGrants: Array.isArray(datasetSecretState?.grants) ? datasetSecretState.grants : [],
      activeDatasetSecretGrant: datasetSecretState?.activeGrant || null,
    }),
  });
}

export async function updateDocumentLibrary(key, payload) {
  return requestJson(`/api/documents/libraries/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function reclusterUngroupedDocuments() {
  return requestJson('/api/documents/recluster-ungrouped', { method: 'POST' });
}

export async function backfillCanonicalDocuments(limit = 50, runImmediately = false) {
  return requestJson('/api/documents/deep-parse/backfill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, runImmediately }),
  });
}

export async function ignoreDocuments(items) {
  return requestJson('/api/documents/ignore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function saveDocumentGroups(items) {
  return requestJson('/api/documents/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function reparseDocuments(items) {
  return requestJson('/api/documents/reparse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function acceptDocumentGroupSuggestions(items) {
  return requestJson('/api/documents/groups/accept-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}
