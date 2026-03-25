'use client';

import { buildApiUrl } from './lib/config';

const SESSION_USER_STORAGE_KEY = 'aidp-openclaw-session-user-v1';

function buildSessionUserId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `web-${crypto.randomUUID()}`;
  }
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateSessionUser() {
  if (typeof window === 'undefined') return 'web-server';

  try {
    const stored = window.localStorage.getItem(SESSION_USER_STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // ignore storage access errors
  }

  const next = buildSessionUserId();

  try {
    window.localStorage.setItem(SESSION_USER_STORAGE_KEY, next);
  } catch {
    // ignore storage access errors
  }

  return next;
}

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
  const response = await fetch(buildApiUrl('/api/documents-overview'));
  return parseApiResponse(response, 'load documents overview failed');
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

export async function sendChatPrompt(prompt, chatHistory = [], conversationState = null) {
  const promptBase64 = typeof window === 'undefined'
    ? ''
    : window.btoa(String.fromCharCode(...new TextEncoder().encode(prompt)));
  const sessionUser = getOrCreateSessionUser();
  const response = await fetch(buildApiUrl('/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, promptBase64, chatHistory, conversationState, sessionUser }),
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
