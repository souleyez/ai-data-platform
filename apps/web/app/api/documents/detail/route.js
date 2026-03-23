import { proxyJson } from '../../_proxy';

export async function GET(request) {
  const id = request.nextUrl.searchParams.get('id');
  const query = id ? `?id=${encodeURIComponent(id)}` : '';
  return proxyJson(`/api/documents/detail${query}`);
}
