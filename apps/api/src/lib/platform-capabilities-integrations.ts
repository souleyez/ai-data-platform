import type { PlatformIntegration } from './platform-capabilities-types.js';

export const PLATFORM_INTEGRATIONS: PlatformIntegration[] = [
  {
    id: 'openclaw',
    label: 'OpenClaw gateway',
    kind: 'service',
    description: 'Primary model gateway and agent runtime used by the platform.',
    capabilities: [
      'Normal and full chat both supply context into OpenClaw.',
      'Full mode should avoid unnecessary host-side restrictions and let OpenClaw continue multi-step work when possible.',
      'Native search is preferred when available.',
      'CLI should be treated as the canonical system action surface.',
    ],
  },
  {
    id: 'web-capture',
    label: 'Web and procurement capture',
    kind: 'tool',
    description: 'Single-link web capture tool for public pages, procurement notices, and other URL-based knowledge ingestion.',
    capabilities: [
      'Capture one specified URL directly from the CLI.',
      'Extract正文 or downloadable content and ingest it into a target knowledge library.',
      'Useful when OpenClaw should act through a concrete system command instead of ad-hoc chat routing.',
    ],
  },
  {
    id: 'web-search',
    label: 'Realtime web search',
    kind: 'search',
    description: 'Native OpenClaw search is preferred, with project-side fallback retained as backup.',
    capabilities: [
      'Latest/current/news/weather/announcement style questions have search by default.',
      'DuckDuckGo-native search is preferred when the gateway can use it.',
      'Project-side fallback remains available for resilience.',
    ],
  },
  {
    id: 'tesseract',
    label: 'Tesseract OCR',
    kind: 'tool',
    description: 'OCR engine used for image and scanned document parsing, including Chinese OCR retries.',
    capabilities: [
      'Retries Chinese plus English language packs for image OCR.',
      'Supports manual reparse when OCR extraction fails.',
    ],
  },
  {
    id: 'model-providers',
    label: 'Model providers',
    kind: 'provider',
    description: 'Supported external model providers configured through OpenClaw.',
    capabilities: [
      'OpenAI Codex',
      'GitHub Copilot',
      'MiniMax',
      'Moonshot / Kimi',
      'Z.AI / GLM',
    ],
  },
  {
    id: 'canva',
    label: 'Canva plugin',
    kind: 'plugin',
    description: 'Connected plugin for design generation, editing, resizing, and template-based outputs.',
    capabilities: [
      'Generate, edit, resize, and export Canva designs.',
      'Useful for presentation and visual-output workflows.',
    ],
  },
  {
    id: 'figma',
    label: 'Figma plugin',
    kind: 'plugin',
    description: 'Connected plugin for design implementation, design-system mapping, and asset generation.',
    capabilities: [
      'Read design context and screenshots.',
      'Generate assets, decks, and diagrams.',
    ],
  },
  {
    id: 'github',
    label: 'GitHub plugin',
    kind: 'plugin',
    description: 'Connected plugin for repo triage, PR workflows, and CI inspection.',
    capabilities: [
      'PR, issue, and repo inspection.',
      'CI diagnosis and publish workflows.',
    ],
  },
];

export const PLATFORM_BASE_RULES = [
  'Treat the CLI command domains as the canonical execution surface for platform actions.',
  'Chat orchestration should stay minimal: supply context, enforce template confirmation, and otherwise let OpenClaw decide.',
  'Keep host-side restrictions light and let OpenClaw decide most platform actions.',
  'Never claim an action completed unless the host returns an execution result.',
  'Default web search is available for realtime questions.',
];
