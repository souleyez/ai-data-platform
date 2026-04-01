import { proxyJson } from '../_proxy';

export async function GET() {
  return proxyJson('/api/intelligence-mode');
}
