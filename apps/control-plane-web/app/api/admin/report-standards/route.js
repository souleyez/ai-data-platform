import { proxyBackendJson } from '../../_backend-proxy';

export async function GET(request) {
  return proxyBackendJson('/api/report-standards', {}, request);
}
