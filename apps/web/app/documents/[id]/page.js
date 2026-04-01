import { redirect } from 'next/navigation';
import { buildBackendApiUrl } from '../../lib/config';

export const dynamic = 'force-dynamic';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

function resolveDocumentId(params) {
  const raw = params?.id;
  return Array.isArray(raw) ? raw[0] : raw || '';
}

export default async function DocumentDetailRedirectPage({ params }) {
  const documentId = resolveDocumentId(params);
  if (!documentId) {
    redirect('/documents');
  }

  try {
    const response = await fetch(
      buildBackendApiUrl(`/api/documents/detail?id=${encodeURIComponent(documentId)}`),
      { cache: 'no-store' },
    );

    if (!response.ok) {
      redirect('/documents');
    }

    const json = await response.json();
    const item = json?.item || null;
    const isImage = IMAGE_EXTENSIONS.has(String(item?.ext || '').toLowerCase());
    const endpoint = isImage ? 'file' : 'download';

    redirect(`/api/documents/${endpoint}?id=${encodeURIComponent(documentId)}`);
  } catch {
    redirect('/documents');
  }
}
