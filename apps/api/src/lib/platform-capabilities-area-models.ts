import type { PlatformCapabilityArea } from './platform-capabilities-types.js';

export const PLATFORM_MODEL_CAPABILITY_AREA: PlatformCapabilityArea = {
  id: 'models',
  label: 'Model and gateway configuration',
  description: 'Inspect OpenClaw runtime status, configured providers, and model selection.',
  abilities: [
    'Inspect the current OpenClaw runtime and selected model.',
    'Switch model selection and save provider settings from the CLI.',
    'Launch provider login or request OpenClaw installation when needed.',
  ],
  commands: [
    { key: 'models.status', command: 'pnpm system:control -- models status', description: 'Show current model, configured providers, and gateway/runtime state.' },
    { key: 'models.select', command: 'pnpm system:control -- models select --model "<model-id>"', description: 'Switch the selected model.' },
    { key: 'models.save-provider', command: 'pnpm system:control -- models save-provider --provider "<provider>" --method "<method>" [--api-key "<key>"]', description: 'Save provider credentials or selection.' },
    { key: 'models.launch-login', command: 'pnpm system:control -- models launch-login --provider "<provider>" --method "<method>"', description: 'Start an interactive provider login flow.' },
    { key: 'models.install-openclaw', command: 'pnpm system:control -- models install-openclaw', description: 'Install or update the OpenClaw runtime.' },
  ],
};
