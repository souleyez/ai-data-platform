'use client';

import { buildApiUrl } from './lib/config';

async function parseApiResponse(response, fallbackError) {
  const raw = await response.text();
  let json = {};
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }

  if (!response.ok) {
    throw new Error(json?.error || raw || fallbackError);
  }

  return json;
}

export async function fetchDatasources() {
  const response = await fetch(buildApiUrl('/api/datasources'));
  return parseApiResponse(response, 'load datasources failed');
}

export async function fetchCaptureTasks() {
  const response = await fetch(buildApiUrl('/api/web-captures'));
  return parseApiResponse(response, 'load web captures failed');
}

export async function fetchDocumentsSnapshot() {
  const response = await fetch(buildApiUrl('/api/documents'));
  return parseApiResponse(response, 'load documents failed');
}

export async function createWebCapture(payload) {
  const response = await fetch(buildApiUrl('/api/web-captures'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'create web capture failed');
}

export async function createLoginCapture(payload) {
  const response = await fetch(buildApiUrl('/api/web-captures/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return parseApiResponse(response, 'login capture failed');
}

export async function uploadDocuments(formData) {
  const response = await fetch(buildApiUrl('/api/documents/upload'), {
    method: 'POST',
    body: formData,
  });
  return parseApiResponse(response, 'document upload failed');
}

export async function sendChatPrompt(prompt) {
  const response = await fetch(buildApiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return parseApiResponse(response, 'chat api failed');
}

export async function saveDocumentGroups(items) {
  const response = await fetch(buildApiUrl('/api/documents/groups'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  return parseApiResponse(response, 'save groups failed');
}
