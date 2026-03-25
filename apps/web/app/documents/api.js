'use client';

import { buildApiUrl } from '../lib/config';
import { normalizeDatasourceResponse, normalizeDocumentsResponse } from '../lib/types';

async function requestJson(path, options) {
  const response = await fetch(buildApiUrl(path), options);
  if (!response.ok) {
    throw new Error(`request failed: ${path}`);
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

export async function createDocumentLibrary(name, description = '') {
  return requestJson('/api/documents/libraries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description }),
  });
}

export async function fetchCandidateSources() {
  const payload = await requestJson('/api/documents/candidate-sources');
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function importCandidateSources(scanRoots) {
  return requestJson('/api/documents/candidate-sources/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanRoots, scanNow: true }),
  });
}

export async function organizeDocuments() {
  return requestJson('/api/documents/organize', { method: 'POST' });
}

export async function reclusterUngroupedDocuments() {
  return requestJson('/api/documents/recluster-ungrouped', { method: 'POST' });
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

export async function acceptDocumentGroupSuggestions(items) {
  return requestJson('/api/documents/groups/accept-suggestions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

export async function setPrimaryDocumentScanSource(scanRoot) {
  return requestJson('/api/documents/scan-sources/primary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanRoot }),
  });
}

export async function removeDocumentScanSource(scanRoot) {
  return requestJson('/api/documents/scan-sources/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scanRoot }),
  });
}
