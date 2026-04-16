import { proxyJson } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const suffix = request.nextUrl.search || '';
  return proxyJson(`/api/reports/benchmark${suffix}`);
}
