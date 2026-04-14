import { loadDocumentLibraries } from './document-libraries.js';
import { buildDocumentId, loadParsedDocuments } from './document-store.js';
import type { KnowledgeOutputKind } from './knowledge-template.js';
import type { ReportTemplateType } from './report-center.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clampLimit(value: string | undefined, fallback: number, max: number) {
  return Math.max(1, Math.min(max, Number(value || fallback) || fallback));
}

function scoreLibraryMatch(reference: string, library: { key: string; label: string; description?: string }) {
  const normalizedReference = normalizeText(reference);
  const haystack = normalizeText(`${library.key} ${library.label} ${library.description || ''}`);
  if (!normalizedReference || !haystack) return 0;
  if (haystack === normalizedReference) return 120;
  if (haystack.includes(normalizedReference)) return 90;
  if (normalizedReference.includes(normalizeText(library.label || ''))) return 60;
  if (normalizedReference.includes(normalizeText(library.key || ''))) return 50;
  return 0;
}

export async function resolveLibraryReference(reference: string) {
  const libraries = await loadDocumentLibraries();
  if (!libraries.length) {
    throw new Error('No knowledge libraries are configured.');
  }

  const normalizedReference = String(reference || '').trim();
  if (!normalizedReference && libraries.length === 1) {
    return libraries[0];
  }
  if (!normalizedReference) {
    throw new Error('Missing --library.');
  }

  const matches = libraries
    .map((library) => ({ library, score: scoreLibraryMatch(normalizedReference, library) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  if (!matches.length) {
    throw new Error(`No library matched "${reference}".`);
  }
  if (matches.length > 1 && matches[0].score === matches[1].score) {
    throw new Error(`Library match is ambiguous: ${matches.slice(0, 5).map((item) => item.library.label).join(', ')}`);
  }
  return matches[0].library;
}

export function resolveOutputKind(value: string): KnowledgeOutputKind {
  const normalized = normalizeText(value);
  if (!normalized) return 'page';
  if (['table', 'sheet', 'csv'].includes(normalized)) return 'table';
  if (['page', 'static page', 'html'].includes(normalized)) return 'page';
  if (['ppt', 'pptx', 'slides'].includes(normalized)) return 'ppt';
  if (['pdf'].includes(normalized)) return 'pdf';
  if (['md', 'markdown'].includes(normalized)) return 'md';
  if (['doc', 'docx', 'docs', 'word'].includes(normalized)) return 'doc';
  throw new Error(`Unsupported output format "${value}". Supported: table, page, ppt, pdf, md, doc`);
}

export function resolveReportTemplateType(value: string | undefined): ReportTemplateType | undefined {
  const normalized = normalizeText(value || '');
  if (!normalized) return undefined;
  if (['table', 'sheet', 'spreadsheet'].includes(normalized)) return 'table';
  if (['static-page', 'page', 'html', 'static page'].includes(normalized)) return 'static-page';
  if (['ppt', 'slides', 'pptx'].includes(normalized)) return 'ppt';
  if (['document', 'doc', 'docx', 'word'].includes(normalized)) return 'document';
  throw new Error('Unsupported template type. Supported: table, static-page, ppt, document');
}

export function resolveReportLayoutVariant(value: string | undefined): ReportPlanLayoutVariant | undefined {
  const normalized = normalizeText(value || '');
  if (!normalized) return undefined;
  if (normalized === 'insight brief') return 'insight-brief';
  if (normalized === 'risk brief') return 'risk-brief';
  if (normalized === 'operations cockpit') return 'operations-cockpit';
  if (normalized === 'talent showcase') return 'talent-showcase';
  if (normalized === 'research brief') return 'research-brief';
  if (normalized === 'solution overview') return 'solution-overview';
  throw new Error('Unsupported layout variant. Supported: insight-brief, risk-brief, operations-cockpit, talent-showcase, research-brief, solution-overview');
}

export function formatOutputKindLabel(kind: KnowledgeOutputKind) {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'md') return 'markdown document';
  return 'document';
}

export function buildTemplateOutputRequest(input: {
  libraryLabel: string;
  outputKind: KnowledgeOutputKind;
  timeRange: string;
  focus: string;
  templateKey: string;
  request: string;
}) {
  if (input.request) return input.request;
  const outputLabel = formatOutputKindLabel(input.outputKind);
  const timeText = input.timeRange ? `${input.timeRange} material` : 'all available material';
  const templateText = input.templateKey ? `using template ${input.templateKey}` : 'using the default template';
  const focusText = input.focus || input.libraryLabel;
  return `Use ${input.libraryLabel} library ${timeText}, ${templateText}, and generate a ${outputLabel} focused on ${focusText}.`;
}

export function summarizeReportTemplateItem(item: {
  key: string;
  label: string;
  type: string;
  description?: string;
  preferredLayoutVariant?: string;
  isDefault?: boolean;
  origin?: string;
  referenceImages?: unknown[];
}) {
  return {
    key: item.key,
    label: item.label,
    type: item.type,
    description: item.description || '',
    preferredLayoutVariant: item.preferredLayoutVariant || '',
    isDefault: item.isDefault === true,
    origin: item.origin || 'system',
    referenceCount: Array.isArray(item.referenceImages) ? item.referenceImages.length : 0,
  };
}

export function summarizeDocumentItem(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
  return {
    id: buildDocumentId(item.path),
    title: item.title || item.name,
    name: item.name,
    path: item.path,
    libraryGroups: Array.isArray(item.groups) ? item.groups : [],
    parseStage: item.parseStage,
    detailParseStatus: item.detailParseStatus,
    summary: item.summary || '',
  };
}

export async function resolveDocumentSnapshotItem(documentId: string) {
  const normalizedId = String(documentId || '').trim();
  if (!normalizedId) {
    throw new Error('Missing --document.');
  }
  const snapshot = await loadParsedDocuments(5000, false);
  const item = snapshot.items.find((entry) => buildDocumentId(entry.path) === normalizedId);
  if (!item) {
    throw new Error(`Document "${normalizedId}" was not found.`);
  }
  return item;
}

export function resolveBooleanFlag(value: string | undefined) {
  const normalized = normalizeText(value || '');
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}
