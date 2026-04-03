export const BACKEND_API_BASE_URL = process.env.BACKEND_API_BASE_URL || 'http://127.0.0.1:3100';

export function buildBackendApiUrl(path) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = BACKEND_API_BASE_URL.replace(/\/$/, '');

  if (base.endsWith('/api') && normalized.startsWith('/api/')) {
    return `${base}${normalized.slice(4)}`;
  }

  return `${base}${normalized}`;
}

export async function safeFetchBackendJson(path, adminToken) {
  if (!adminToken) {
    return {
      ok: false,
      error: 'ADMIN_TOKEN_REQUIRED',
      data: null,
    };
  }

  try {
    const response = await fetch(buildBackendApiUrl(path), {
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        ok: false,
        error: text || `${response.status} ${response.statusText}`,
        data: null,
      };
    }

    return {
      ok: true,
      error: '',
      data: await response.json(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      data: null,
    };
  }
}
