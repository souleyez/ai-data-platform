import { proxyJson } from '../../_proxy';

export async function GET(request) {
  return proxyJson('/api/admin/devices', {}, request);
}
