import type { FastifyRequest } from 'fastify';

export function getConfiguredAdminToken(): string {
  return process.env.CONTROL_PLANE_ADMIN_TOKEN?.trim() || '';
}

export function isAdminAuthEnabled(): boolean {
  return Boolean(getConfiguredAdminToken());
}

export function extractAdminToken(request: FastifyRequest): string {
  const explicit = request.headers['x-control-plane-admin-token'];
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim();
  }

  const authorization = request.headers.authorization;
  if (typeof authorization === 'string') {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return '';
}

export function hasValidAdminToken(request: FastifyRequest): boolean {
  const configured = getConfiguredAdminToken();
  if (!configured) {
    return true;
  }
  return extractAdminToken(request) === configured;
}
