import type { PlatformCapabilityArea } from './platform-capabilities-types.js';

export const PLATFORM_DOCUMENT_CAPABILITY_AREA: PlatformCapabilityArea = {
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
    { key: 'documents.libraries', command: 'pnpm system:control -- documents libraries', description: 'List configured knowledge libraries.' },
    { key: 'documents.create-library', command: 'pnpm system:control -- documents create-library --name "<library-name>" [--description "<description>"] [--permission 0]', description: 'Create one dataset library/group.' },
    { key: 'documents.update-library', command: 'pnpm system:control -- documents update-library --library "<library>" [--label "<new-name>"] [--description "<description>"] [--permission 0]', description: 'Update one dataset library/group.' },
    { key: 'documents.delete-library', command: 'pnpm system:control -- documents delete-library --library "<library>"', description: 'Delete one non-reserved dataset library/group.' },
    { key: 'documents.list', command: 'pnpm system:control -- documents list [--library "<library>"] [--limit 20]', description: 'List recent indexed documents, optionally scoped to one library.' },
    { key: 'documents.detail', command: 'pnpm system:control -- documents detail --id "<document-id>"', description: 'Inspect parsed detail for one document.' },
    { key: 'documents.import-local', command: 'pnpm system:control -- documents import-local --path "<file-path>" [--paths "<file1,file2>"] [--library "<library>"]', description: 'Import local files into the dataset base and ingest them into the selected library.' },
    { key: 'documents.reparse', command: 'pnpm system:control -- documents reparse --id "<document-id>"', description: 'Retry parsing for one or more documents.' },
    { key: 'documents.deep-parse', command: 'pnpm system:control -- documents deep-parse [--limit 8]', description: 'Run one batch of detailed parsing.' },
    { key: 'documents.canonical-backfill', command: 'pnpm system:control -- documents canonical-backfill [--limit 50] [--run true]', description: 'Queue documents that still rely on legacy full text into the canonical markdown/VLM detailed-parse path.' },
    { key: 'documents.organize', command: 'pnpm system:control -- documents organize', description: 'Run auto-grouping against current libraries.' },
    { key: 'documents.recluster-ungrouped', command: 'pnpm system:control -- documents recluster-ungrouped', description: 'Recluster ungrouped material and create suggestions or new groups.' },
    { key: 'documents.vector-rebuild', command: 'pnpm system:control -- documents vector-rebuild', description: 'Rebuild the vector index from the current document set.' },
  ],
};
