import { ADMIN_TOKEN_HEADER } from './admin-auth';
import { buildControlPlaneApiUrl } from './config';

export async function safeFetchControlPlaneJson(path, adminToken) {
  if (!adminToken) {
    return {
      ok: false,
      error: 'ADMIN_TOKEN_REQUIRED',
      data: null,
    };
  }

  try {
    const response = await fetch(buildControlPlaneApiUrl(path), {
      cache: 'no-store',
      headers: {
        [ADMIN_TOKEN_HEADER]: adminToken,
      },
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
