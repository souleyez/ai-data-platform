import type { PlatformCapabilityArea } from './platform-capabilities-types.js';

export const PLATFORM_CORE_CAPABILITY_AREAS: PlatformCapabilityArea[] = [
  {
    id: 'capabilities',
    label: 'Platform capability registry',
    description: 'The canonical inventory of what the system can do and how those actions are exposed on the CLI.',
    abilities: [
      'List the current platform areas and the canonical commands for each area.',
      'Describe output formats, integrations, and command examples in one place.',
      'Act as the single source of truth for OpenClaw capability awareness.',
    ],
    commands: [
      {
        key: 'capabilities.list',
        command: 'pnpm system:control -- capabilities list',
        description: 'List top-level capability areas, output formats, and integrations.',
      },
      {
        key: 'capabilities.show',
        command: 'pnpm system:control -- capabilities show --area reports',
        description: 'Show the detailed description, abilities, and commands for one area or integration.',
      },
    ],
  },
  {
    id: 'supply',
    label: 'Knowledge supply',
    description: 'Preview the exact library, document, and evidence supply that would be sent to OpenClaw.',
    abilities: [
      'Resolve library scope for a user request.',
      'Preview retrieved documents and evidence matches before answering or generating outputs.',
      'Expose supply as a stable CLI domain instead of chat orchestration.',
    ],
    commands: [
      {
        key: 'supply.preview',
        command: 'pnpm system:control -- supply preview --prompt "<request>" [--library "<library>"] [--time-range "<range>"] [--focus "<focus>"]',
        description: 'Preview matched libraries, documents, and evidence for a natural-language request.',
      },
    ],
  },
];
