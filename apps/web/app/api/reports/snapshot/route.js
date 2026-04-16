import { proxyJson } from '../../_proxy';

export const dynamic = 'force-dynamic';

export async function GET() {
  return proxyJson('/api/reports/snapshot');
}
