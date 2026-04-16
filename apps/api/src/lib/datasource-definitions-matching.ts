import { readDefinitions } from './datasource-definitions-storage.js';

export async function findDatasourceDefinitionByUploadToken(token: string) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) return null;
  const items = await readDefinitions();
  return items.find((item) => item.kind === 'upload_public' && String(item.config?.uploadToken || '').trim() === normalizedToken) || null;
}
