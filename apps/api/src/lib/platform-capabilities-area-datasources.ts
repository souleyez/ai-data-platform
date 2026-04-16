import type { PlatformCapabilityArea } from './platform-capabilities-types.js';

export const PLATFORM_DATASOURCE_CAPABILITY_AREA: PlatformCapabilityArea = {
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
    { key: 'datasources.list', command: 'pnpm system:control -- datasources list', description: 'List managed datasource definitions.' },
    { key: 'datasources.create', command: 'pnpm system:control -- datasources create --name "<name>" --kind web_public|web_login|web_discovery|local_directory|upload_public|database|erp --library "<library>" [--url "<url>"] [--path "<folder>"] [--schedule manual|daily|weekly]', description: 'Create one managed datasource definition.' },
    { key: 'datasources.update', command: 'pnpm system:control -- datasources update --datasource "<name-or-id>" [--name "<name>"] [--library "<library>"] [--status draft|active|paused] [--url "<url>"] [--path "<folder>"]', description: 'Update one managed datasource definition.' },
    { key: 'datasources.delete', command: 'pnpm system:control -- datasources delete --datasource "<name-or-id>"', description: 'Delete one managed datasource definition.' },
    { key: 'datasources.runs', command: 'pnpm system:control -- datasources runs [--datasource "<name>"] [--limit 5]', description: 'Show recent datasource runs, optionally scoped to one datasource.' },
    { key: 'datasources.run', command: 'pnpm system:control -- datasources run --datasource "<name>"', description: 'Run one datasource now.' },
    { key: 'datasources.capture-url', command: 'pnpm system:control -- datasources capture-url --url "<url>" [--focus "<focus>"] [--library "<library>"] [--name "<name>"] [--max-items 1]', description: 'Capture one public page or procurement link immediately and ingest it into the selected knowledge library.' },
    { key: 'datasources.login-capture', command: 'pnpm system:control -- datasources login-capture --url "<url>" [--username "<username>"] [--password "<password>"] [--remember true] [--library "<library>"] [--name "<name>"]', description: 'Capture one authenticated page and ingest the result into the selected knowledge library.' },
    { key: 'datasources.web-tasks', command: 'pnpm system:control -- datasources web-tasks', description: 'List tracked web capture tasks and their latest status.' },
    { key: 'datasources.run-due', command: 'pnpm system:control -- datasources run-due', description: 'Run due managed datasource schedules.' },
    { key: 'datasources.web-run-due', command: 'pnpm system:control -- datasources web-run-due', description: 'Run due web capture schedules.' },
    { key: 'datasources.credentials', command: 'pnpm system:control -- datasources credentials', description: 'List saved datasource credentials.' },
    { key: 'datasources.save-credential', command: 'pnpm system:control -- datasources save-credential --label "<label>" [--kind credential|manual_session|database_password|api_token] [--username "<username>"] [--password "<password>"] [--token "<token>"] [--connection-string "<connection>"]', description: 'Create or update one datasource credential.' },
    { key: 'datasources.delete-credential', command: 'pnpm system:control -- datasources delete-credential --credential "<credential-id>"', description: 'Delete one datasource credential.' },
    { key: 'datasources.pause', command: 'pnpm system:control -- datasources pause --datasource "<name>"', description: 'Pause one datasource.' },
    { key: 'datasources.activate', command: 'pnpm system:control -- datasources activate --datasource "<name>"', description: 'Reactivate one datasource.' },
  ],
};
