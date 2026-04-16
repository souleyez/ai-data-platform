import { headers } from 'next/headers';
import HomePageClient from './HomePageClient';
import { buildBackendApiUrl } from './lib/config';

const MOBILE_VIEWPORT_PATTERN = /android|blackberry|iemobile|iphone|ipod|ipad|mobile|opera mini|webos/i;

function resolveInitialViewportMode(headerStore) {
  const clientHint = String(headerStore.get('sec-ch-ua-mobile') || '').trim();
  if (clientHint === '?1' || clientHint === '1' || clientHint.toLowerCase() === 'true') {
    return 'mobile';
  }

  const userAgent = String(headerStore.get('user-agent') || '');
  return MOBILE_VIEWPORT_PATTERN.test(userAgent) ? 'mobile' : 'desktop';
}

async function getInitialDocumentsSnapshot() {
  try {
    const response = await fetch(buildBackendApiUrl('/api/documents-overview'), {
      cache: 'no-store',
    });

    if (!response.ok) {
      return { libraries: [], totalDocuments: 0 };
    }

    const json = await response.json();
    const libraries = Array.isArray(json?.libraries) ? json.libraries : [];
    const totalFromLibraries = libraries.reduce(
      (sum, library) => sum + Number(library?.documentCount || 0),
      0,
    );

    return {
      libraries,
      totalDocuments: totalFromLibraries || Number(json?.totalFiles || 0),
    };
  } catch {
    return { libraries: [], totalDocuments: 0 };
  }
}

export default async function HomePage() {
  const headerStore = await headers();
  const initialViewportMode = resolveInitialViewportMode(headerStore);
  const initialDocumentsSnapshot = await getInitialDocumentsSnapshot();

  return (
    <HomePageClient
      initialDocumentsSnapshot={initialDocumentsSnapshot}
      initialViewportMode={initialViewportMode}
    />
  );
}
