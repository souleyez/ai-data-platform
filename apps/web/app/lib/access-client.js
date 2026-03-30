'use client';

export const ACCESS_KEY_STORAGE_KEY = 'aidp_access_key_v1';

export function normalizeAccessKeyCode(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

export function isValidAccessKeyCode(value) {
  return /^\d{4,8}$/.test(normalizeAccessKeyCode(value));
}

export function loadStoredAccessKey() {
  if (typeof window === 'undefined') return '';

  try {
    return normalizeAccessKeyCode(window.localStorage.getItem(ACCESS_KEY_STORAGE_KEY));
  } catch {
    return '';
  }
}

export function persistAccessKey(value) {
  if (typeof window === 'undefined') return;

  try {
    const normalized = normalizeAccessKeyCode(value);
    if (!normalized) {
      window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(ACCESS_KEY_STORAGE_KEY, normalized);
  } catch {
    // Ignore local persistence failures.
  }
}

export function clearStoredAccessKey() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(ACCESS_KEY_STORAGE_KEY);
  } catch {
    // Ignore local persistence failures.
  }
}
