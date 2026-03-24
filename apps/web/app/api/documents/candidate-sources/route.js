import { proxyJson } from '../../_proxy';

export async function GET() {
  return proxyJson('/api/documents/candidate-sources');
}
