import { proxyJson } from '../../_proxy';

export async function POST() {
  return proxyJson('/api/documents/organize', {
    method: 'POST',
  });
}
