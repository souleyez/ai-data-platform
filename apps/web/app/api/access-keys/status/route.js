import { proxyJson } from '../../_proxy';

export async function GET() {
  return proxyJson('/api/access-keys/status');
}
