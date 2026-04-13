export type PlatformCapabilityAreaId =
  | 'capabilities'
  | 'documents'
  | 'supply'
  | 'datasources'
  | 'reports'
  | 'models';

export type PlatformCommandSpec = {
  key: string;
  command: string;
  description: string;
};

export type PlatformCapabilityArea = {
  id: PlatformCapabilityAreaId;
  label: string;
  description: string;
  abilities: string[];
  commands: PlatformCommandSpec[];
};

export type PlatformIntegrationKind = 'service' | 'provider' | 'plugin' | 'tool' | 'search';

export type PlatformIntegration = {
  id: string;
  label: string;
  kind: PlatformIntegrationKind;
  description: string;
  capabilities: string[];
};

export const PLATFORM_OUTPUT_FORMATS = ['table', 'page', 'doc', 'md', 'pdf', 'ppt'] as const;

export const PLATFORM_CAPABILITY_AREAS: PlatformCapabilityArea[] = [
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
    id: 'documents',
    label: 'Dataset center',
    description: 'Browse dataset material, inspect parsed detail, and run maintenance actions on the indexed dataset base.',
    abilities: [
      'List libraries and documents.',
      'Inspect one document with parsed detail and source availability.',
      'Create, update, and delete dataset groups.',
      'Import one or more local files into the dataset base and store them into the selected library.',
      'Reparse failed items, organize groups, recluster ungrouped material, run deep parse, and rebuild vectors.',
    ],
    commands: [
      {
        key: 'documents.libraries',
        command: 'pnpm system:control -- documents libraries',
        description: 'List configured knowledge libraries.',
      },
      {
        key: 'documents.create-library',
        command: 'pnpm system:control -- documents create-library --name "<library-name>" [--description "<description>"] [--permission 0]',
        description: 'Create one dataset library/group.',
      },
      {
        key: 'documents.update-library',
        command: 'pnpm system:control -- documents update-library --library "<library>" [--label "<new-name>"] [--description "<description>"] [--permission 0]',
        description: 'Update one dataset library/group.',
      },
      {
        key: 'documents.delete-library',
        command: 'pnpm system:control -- documents delete-library --library "<library>"',
        description: 'Delete one non-reserved dataset library/group.',
      },
      {
        key: 'documents.list',
        command: 'pnpm system:control -- documents list [--library "<library>"] [--limit 20]',
        description: 'List recent indexed documents, optionally scoped to one library.',
      },
      {
        key: 'documents.detail',
        command: 'pnpm system:control -- documents detail --id "<document-id>"',
        description: 'Inspect parsed detail for one document.',
      },
      {
        key: 'documents.import-local',
        command: 'pnpm system:control -- documents import-local --path "<file-path>" [--paths "<file1,file2>"] [--library "<library>"]',
        description: 'Import local files into the dataset base and ingest them into the selected library.',
      },
      {
        key: 'documents.reparse',
        command: 'pnpm system:control -- documents reparse --id "<document-id>"',
        description: 'Retry parsing for one or more documents.',
      },
      {
        key: 'documents.deep-parse',
        command: 'pnpm system:control -- documents deep-parse [--limit 8]',
        description: 'Run one batch of detailed parsing.',
      },
      {
        key: 'documents.canonical-backfill',
        command: 'pnpm system:control -- documents canonical-backfill [--limit 50] [--run true]',
        description: 'Queue documents that still rely on legacy full text into the canonical markdown/VLM detailed-parse path.',
      },
      {
        key: 'documents.organize',
        command: 'pnpm system:control -- documents organize',
        description: 'Run auto-grouping against current libraries.',
      },
      {
        key: 'documents.recluster-ungrouped',
        command: 'pnpm system:control -- documents recluster-ungrouped',
        description: 'Recluster ungrouped material and create suggestions or new groups.',
      },
      {
        key: 'documents.vector-rebuild',
        command: 'pnpm system:control -- documents vector-rebuild',
        description: 'Rebuild the vector index from the current document set.',
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
  {
    id: 'datasources',
    label: 'Datasource center',
    description: 'Inspect, run, pause, and reactivate managed ingestion sources.',
    abilities: [
      'List managed datasource definitions and recent runs.',
      'Run a datasource immediately.',
      'Capture one public web or procurement link by URL and ingest it into a target knowledge library.',
      'Create, update, and delete managed datasources and credentials from the CLI.',
      'Run authenticated web capture, list web capture tasks, and execute due capture schedules.',
      'Pause and activate local-directory, web, database, and ERP-like sources.',
    ],
    commands: [
      {
        key: 'datasources.list',
        command: 'pnpm system:control -- datasources list',
        description: 'List managed datasource definitions.',
      },
      {
        key: 'datasources.create',
        command: 'pnpm system:control -- datasources create --name "<name>" --kind web_public|web_login|web_discovery|local_directory|upload_public|database|erp --library "<library>" [--url "<url>"] [--path "<folder>"] [--schedule manual|daily|weekly]',
        description: 'Create one managed datasource definition.',
      },
      {
        key: 'datasources.update',
        command: 'pnpm system:control -- datasources update --datasource "<name-or-id>" [--name "<name>"] [--library "<library>"] [--status draft|active|paused] [--url "<url>"] [--path "<folder>"]',
        description: 'Update one managed datasource definition.',
      },
      {
        key: 'datasources.delete',
        command: 'pnpm system:control -- datasources delete --datasource "<name-or-id>"',
        description: 'Delete one managed datasource definition.',
      },
      {
        key: 'datasources.runs',
        command: 'pnpm system:control -- datasources runs [--datasource "<name>"] [--limit 5]',
        description: 'Show recent datasource runs, optionally scoped to one datasource.',
      },
      {
        key: 'datasources.run',
        command: 'pnpm system:control -- datasources run --datasource "<name>"',
        description: 'Run one datasource now.',
      },
      {
        key: 'datasources.capture-url',
        command: 'pnpm system:control -- datasources capture-url --url "<url>" [--focus "<focus>"] [--library "<library>"] [--name "<name>"] [--max-items 1]',
        description: 'Capture one public page or procurement link immediately and ingest it into the selected knowledge library.',
      },
      {
        key: 'datasources.login-capture',
        command: 'pnpm system:control -- datasources login-capture --url "<url>" [--username "<username>"] [--password "<password>"] [--remember true] [--library "<library>"] [--name "<name>"]',
        description: 'Capture one authenticated page and ingest the result into the selected knowledge library.',
      },
      {
        key: 'datasources.web-tasks',
        command: 'pnpm system:control -- datasources web-tasks',
        description: 'List tracked web capture tasks and their latest status.',
      },
      {
        key: 'datasources.run-due',
        command: 'pnpm system:control -- datasources run-due',
        description: 'Run due managed datasource schedules.',
      },
      {
        key: 'datasources.web-run-due',
        command: 'pnpm system:control -- datasources web-run-due',
        description: 'Run due web capture schedules.',
      },
      {
        key: 'datasources.credentials',
        command: 'pnpm system:control -- datasources credentials',
        description: 'List saved datasource credentials.',
      },
      {
        key: 'datasources.save-credential',
        command: 'pnpm system:control -- datasources save-credential --label "<label>" [--kind credential|manual_session|database_password|api_token] [--username "<username>"] [--password "<password>"] [--token "<token>"] [--connection-string "<connection>"]',
        description: 'Create or update one datasource credential.',
      },
      {
        key: 'datasources.delete-credential',
        command: 'pnpm system:control -- datasources delete-credential --credential "<credential-id>"',
        description: 'Delete one datasource credential.',
      },
      {
        key: 'datasources.pause',
        command: 'pnpm system:control -- datasources pause --datasource "<name>"',
        description: 'Pause one datasource.',
      },
      {
        key: 'datasources.activate',
        command: 'pnpm system:control -- datasources activate --datasource "<name>"',
        description: 'Reactivate one datasource.',
      },
    ],
  },
  {
    id: 'reports',
    label: 'Report center',
    description: 'Generate, revise, and persist outputs from matched library material across all supported output formats.',
    abilities: [
      'Generate table, static page, DOC/DOCX-style document, Markdown document, PDF, and PPT outputs.',
      'List reusable output templates and persist a dataset file as a reusable report template.',
      'List saved outputs and revise an existing output by instruction.',
      'Store generated report-center outputs back into the corresponding knowledge library as Markdown documents by default.',
      'Keep report generation available on the CLI as the canonical execution layer.',
    ],
    commands: [
      {
        key: 'reports.generate',
        command: 'pnpm system:control -- reports generate --library "<library>" --format table|page|doc|md|pdf|ppt [--template "<template>"] [--time-range "<range>"] [--focus "<focus>"] [--request "<request>"]',
        description: 'Generate one report output from a library request.',
      },
      {
        key: 'reports.templates',
        command: 'pnpm system:control -- reports templates [--type table|static-page|ppt|document] [--limit 20]',
        description: 'List reusable report templates that can be passed to report generation.',
      },
      {
        key: 'reports.template-from-document',
        command: 'pnpm system:control -- reports template-from-document --document "<document-id>" [--label "<template-name>"] [--type table|static-page|ppt|document] [--layout insight-brief|risk-brief|operations-cockpit|talent-showcase|research-brief|solution-overview] [--default true]',
        description: 'Promote one dataset file into a reusable report template reference.',
      },
      {
        key: 'reports.create-template',
        command: 'pnpm system:control -- reports create-template --label "<template-name>" [--type table|static-page|ppt|document] [--description "<description>"] [--layout insight-brief|risk-brief|operations-cockpit|talent-showcase|research-brief|solution-overview] [--default true]',
        description: 'Create one reusable report template shell.',
      },
      {
        key: 'reports.update-template',
        command: 'pnpm system:control -- reports update-template --template "<template-key>" [--label "<template-name>"] [--description "<description>"] [--layout insight-brief|risk-brief|operations-cockpit|talent-showcase|research-brief|solution-overview] [--default true|false]',
        description: 'Update one reusable report template.',
      },
      {
        key: 'reports.delete-template',
        command: 'pnpm system:control -- reports delete-template --template "<template-key>"',
        description: 'Delete one user-created reusable report template.',
      },
      {
        key: 'reports.group-templates',
        command: 'pnpm system:control -- reports group-templates --library "<library>"',
        description: 'List built-in templates currently available to one library/group.',
      },
      {
        key: 'reports.set-group-template',
        command: 'pnpm system:control -- reports set-group-template --library "<library>" --template "<template-key>"',
        description: 'Set the default output template for one library/group.',
      },
      {
        key: 'reports.template-reference-file',
        command: 'pnpm system:control -- reports template-reference-file --template "<template-key>" --path "<file-path>" [--name "<display-name>"]',
        description: 'Attach one local file as a reusable template reference.',
      },
      {
        key: 'reports.template-reference-link',
        command: 'pnpm system:control -- reports template-reference-link --template "<template-key>" --url "<url>" [--label "<display-name>"]',
        description: 'Attach one public URL as a reusable template reference.',
      },
      {
        key: 'reports.outputs',
        command: 'pnpm system:control -- reports outputs [--library "<library>"] [--limit 10]',
        description: 'List saved outputs, optionally scoped to one library/group.',
      },
      {
        key: 'reports.revise',
        command: 'pnpm system:control -- reports revise --output "<output-id>" --instruction "<instruction>"',
        description: 'Revise one saved output in place.',
      },
      {
        key: 'reports.revise-draft-module',
        command: 'pnpm system:control -- reports revise-draft-module --output "<output-id>" --module "<module-id>" --instruction "<instruction>"',
        description: 'Regenerate one draft module without rewriting the whole static page.',
      },
      {
        key: 'reports.revise-draft-structure',
        command: 'pnpm system:control -- reports revise-draft-structure --output "<output-id>" --instruction "<instruction>"',
        description: 'Rewrite the draft module structure for one static page without touching all copy manually.',
      },
      {
        key: 'reports.revise-draft-copy',
        command: 'pnpm system:control -- reports revise-draft-copy --output "<output-id>" --instruction "<instruction>"',
        description: 'Rewrite all draft module copy for one static page while keeping the structure stable.',
      },
      {
        key: 'reports.finalize-page',
        command: 'pnpm system:control -- reports finalize-page --output "<output-id>"',
        description: 'Finalize one reviewed static-page draft into a ready report output.',
      },
      {
        key: 'reports.delete-output',
        command: 'pnpm system:control -- reports delete-output --output "<output-id>"',
        description: 'Delete one saved output from the report center.',
      },
    ],
  },
  {
    id: 'models',
    label: 'Model and gateway configuration',
    description: 'Inspect OpenClaw runtime status, configured providers, and model selection.',
    abilities: [
      'Inspect the current OpenClaw runtime and selected model.',
      'Switch model selection and save provider settings from the CLI.',
      'Launch provider login or request OpenClaw installation when needed.',
    ],
    commands: [
      {
        key: 'models.status',
        command: 'pnpm system:control -- models status',
        description: 'Show current model, configured providers, and gateway/runtime state.',
      },
      {
        key: 'models.select',
        command: 'pnpm system:control -- models select --model "<model-id>"',
        description: 'Switch the selected model.',
      },
      {
        key: 'models.save-provider',
        command: 'pnpm system:control -- models save-provider --provider "<provider>" --method "<method>" [--api-key "<key>"]',
        description: 'Save provider credentials or selection.',
      },
      {
        key: 'models.launch-login',
        command: 'pnpm system:control -- models launch-login --provider "<provider>" --method "<method>"',
        description: 'Start an interactive provider login flow.',
      },
      {
        key: 'models.install-openclaw',
        command: 'pnpm system:control -- models install-openclaw',
        description: 'Install or update the OpenClaw runtime.',
      },
    ],
  },
];

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
  'In full mode, keep host-side restrictions light and let OpenClaw decide most platform actions.',
  'Never claim an action completed unless the host returns an execution result.',
  'Default web search is available for realtime questions.',
];

export function getPlatformCapabilityArea(id: string) {
  return PLATFORM_CAPABILITY_AREAS.find((item) => item.id === id) || null;
}

export function getPlatformIntegration(id: string) {
  return PLATFORM_INTEGRATIONS.find((item) => item.id === id) || null;
}

export function buildPlatformCapabilityContextLines(options?: { includeCommands?: boolean }) {
  const includeCommands = options?.includeCommands === true;
  const lines: string[] = [
    'Core platform areas are defined by a capability registry, not by ad-hoc chat orchestration.',
    ...PLATFORM_BASE_RULES.map((rule) => `- Rule: ${rule}`),
    `- Output formats: ${PLATFORM_OUTPUT_FORMATS.join(', ')}.`,
  ];

  if (!includeCommands) {
    lines.push('- Detailed CLI syntax exists in the host command registry and should only be surfaced when explicit execution or command help is requested.');
  }

  for (const area of PLATFORM_CAPABILITY_AREAS) {
    lines.push(`- ${area.label}: ${area.description}`);
    for (const ability of area.abilities) {
      lines.push(`  - ${ability}`);
    }
    if (includeCommands) {
      for (const command of area.commands) {
        lines.push(`  - Command: ${command.command}`);
      }
    }
  }

  lines.push('- Integrations and external tools you can rely on:');
  for (const integration of PLATFORM_INTEGRATIONS) {
    lines.push(`  - ${integration.label} (${integration.kind}): ${integration.description}`);
  }

  return lines;
}
