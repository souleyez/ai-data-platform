export const CONTROL_PLANE_API_BASE_URL = process.env.CONTROL_PLANE_API_BASE_URL || 'http://127.0.0.1:3210';

export function buildControlPlaneApiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = CONTROL_PLANE_API_BASE_URL.replace(/\/$/, '');

  if (base.endsWith('/api') && normalized.startsWith('/api/')) {
    return `${base}${normalized.slice(4)}`;
  }

  return `${base}${normalized}`;
}
