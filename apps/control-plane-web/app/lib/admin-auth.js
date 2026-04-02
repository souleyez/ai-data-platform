export const ADMIN_TOKEN_COOKIE = 'cp_admin_token';
export const ADMIN_TOKEN_HEADER = 'X-Control-Plane-Admin-Token';

export function getAdminTokenFromRequest(request) {
  return request.cookies.get(ADMIN_TOKEN_COOKIE)?.value?.trim() || '';
}

export function getAdminTokenFromCookieStore(cookieStore) {
  return cookieStore.get(ADMIN_TOKEN_COOKIE)?.value?.trim() || '';
}
