import { headers } from 'next/headers';
import HomePageClient from './HomePageClient';
import { buildBackendApiUrl } from './lib/config';

const INITIAL_MODEL_STATE = {
  openclaw: {
    installed: false,
    running: false,
    installMode: 'none',
    installedVersion: null,
    gatewayUrl: 'http://127.0.0.1:18789',
    needsInstall: false,
    usesDevBridge: false,
  },
  currentModel: null,
  availableModels: [],
  providers: [],
};

const MOBILE_VIEWPORT_PATTERN = /android|blackberry|iemobile|iphone|ipod|ipad|mobile|opera mini|webos/i;

function resolveInitialViewportMode(headerStore) {
  const clientHint = String(headerStore.get('sec-ch-ua-mobile') || '').trim();
  if (clientHint === '?1' || clientHint === '1' || clientHint.toLowerCase() === 'true') {
    return 'mobile';
  }

  const userAgent = String(headerStore.get('user-agent') || '');
  return MOBILE_VIEWPORT_PATTERN.test(userAgent) ? 'mobile' : 'desktop';
}

async function getInitialModelState() {
  try {
    const response = await fetch(buildBackendApiUrl('/api/model-config'), {
      cache: 'no-store',
    });

    if (!response.ok) {
      return INITIAL_MODEL_STATE;
    }

    const json = await response.json();
    return {
      openclaw: json.openclaw || INITIAL_MODEL_STATE.openclaw,
      currentModel: json.currentModel || null,
      availableModels: Array.isArray(json.availableModels) ? json.availableModels : [],
      providers: Array.isArray(json.providers) ? json.providers : [],
    };
  } catch {
    return INITIAL_MODEL_STATE;
  }
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
  const [initialModelState, initialDocumentsSnapshot] = await Promise.all([
    getInitialModelState(),
    getInitialDocumentsSnapshot(),
  ]);

  return (
    <HomePageClient
      initialDocumentsSnapshot={initialDocumentsSnapshot}
      initialModelState={initialModelState}
      initialViewportMode={initialViewportMode}
    />
  );
}
