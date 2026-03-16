export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '';
export const BACKEND_API_BASE_URL = process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:3100';

export function buildApiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

export function buildBackendApiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = BACKEND_API_BASE_URL.replace(/\/$/, '');

  if (base.endsWith('/api') && normalized.startsWith('/api/')) {
    return `${base}${normalized.slice(4)}`;
  }

  return `${base}${normalized}`;
}
