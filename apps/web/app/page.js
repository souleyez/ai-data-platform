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

export default async function HomePage() {
  const initialModelState = await getInitialModelState();
  return <HomePageClient initialModelState={initialModelState} />;
}
