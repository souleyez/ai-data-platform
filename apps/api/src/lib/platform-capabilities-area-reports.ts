import type { PlatformCapabilityArea } from './platform-capabilities-types.js';

export const PLATFORM_REPORT_CAPABILITY_AREA: PlatformCapabilityArea = {
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
    { key: 'reports.generate', command: 'pnpm system:control -- reports generate --library "<library>" --format table|page|doc|md|pdf|ppt [--template "<template>"] [--time-range "<range>"] [--focus "<focus>"] [--request "<request>"]', description: 'Generate one report output from a library request.' },
    { key: 'reports.templates', command: 'pnpm system:control -- reports templates [--type table|static-page|ppt|document] [--limit 20]', description: 'List reusable report templates that can be passed to report generation.' },
    { key: 'reports.template-from-document', command: 'pnpm system:control -- reports template-from-document --document "<document-id>" [--label "<template-name>"] [--type table|static-page|ppt|document] [--layout insight-brief|risk-brief|operations-cockpit|talent-showcase|research-brief|solution-overview] [--default true]', description: 'Promote one dataset file into a reusable report template reference.' },
    { key: 'reports.create-template', command: 'pnpm system:control -- reports create-template --label "<template-name>" [--type table|static-page|ppt|document] [--description "<description>"] [--layout insight-brief|risk-brief|operations-cockpit|talent-showcase|research-brief|solution-overview] [--default true]', description: 'Create one reusable report template shell.' },
    { key: 'reports.update-template', command: 'pnpm system:control -- reports update-template --template "<template-key>" [--label "<template-name>"] [--description "<description>"] [--layout insight-brief|risk-brief|operations-cockpit|talent-showcase|research-brief|solution-overview] [--default true|false]', description: 'Update one reusable report template.' },
    { key: 'reports.delete-template', command: 'pnpm system:control -- reports delete-template --template "<template-key>"', description: 'Delete one user-created reusable report template.' },
    { key: 'reports.group-templates', command: 'pnpm system:control -- reports group-templates --library "<library>"', description: 'List built-in templates currently available to one library/group.' },
    { key: 'reports.set-group-template', command: 'pnpm system:control -- reports set-group-template --library "<library>" --template "<template-key>"', description: 'Set the default output template for one library/group.' },
    { key: 'reports.template-reference-file', command: 'pnpm system:control -- reports template-reference-file --template "<template-key>" --path "<file-path>" [--name "<display-name>"]', description: 'Attach one local file as a reusable template reference.' },
    { key: 'reports.template-reference-link', command: 'pnpm system:control -- reports template-reference-link --template "<template-key>" --url "<url>" [--label "<display-name>"]', description: 'Attach one public URL as a reusable template reference.' },
    { key: 'reports.outputs', command: 'pnpm system:control -- reports outputs [--library "<library>"] [--limit 10]', description: 'List saved outputs, optionally scoped to one library/group.' },
    { key: 'reports.revise', command: 'pnpm system:control -- reports revise --output "<output-id>" --instruction "<instruction>"', description: 'Revise one saved output in place.' },
    { key: 'reports.revise-draft-module', command: 'pnpm system:control -- reports revise-draft-module --output "<output-id>" --module "<module-id>" --instruction "<instruction>"', description: 'Regenerate one draft module without rewriting the whole static page.' },
    { key: 'reports.revise-draft-structure', command: 'pnpm system:control -- reports revise-draft-structure --output "<output-id>" --instruction "<instruction>"', description: 'Rewrite the draft module structure for one static page without touching all copy manually.' },
    { key: 'reports.revise-draft-copy', command: 'pnpm system:control -- reports revise-draft-copy --output "<output-id>" --instruction "<instruction>"', description: 'Rewrite all draft module copy for one static page while keeping the structure stable.' },
    { key: 'reports.finalize-page', command: 'pnpm system:control -- reports finalize-page --output "<output-id>"', description: 'Finalize one reviewed static-page draft into a ready report output.' },
    { key: 'reports.delete-output', command: 'pnpm system:control -- reports delete-output --output "<output-id>"', description: 'Delete one saved output from the report center.' },
  ],
};
