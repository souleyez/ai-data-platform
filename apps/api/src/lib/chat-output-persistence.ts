import type { ChatOutput } from './knowledge-output.js';
import {
  createReportOutput,
  findReportGroupForPrompt,
  loadReportCenterState,
  resolveReportGroup,
  type ReportDynamicSource,
  type ReportGroup,
  type ReportOutputRecord,
} from './report-center.js';

type ChatLibraryRef = { key?: string; label?: string };
type ChatReportTemplateRef = { key: string; label: string; type: string } | null | undefined;

function normalizeLibraries(libraries: ChatLibraryRef[] = []) {
  return libraries
    .map((item) => ({
      key: String(item?.key || '').trim(),
      label: String(item?.label || '').trim(),
    }))
    .filter((item) => item.key || item.label);
}

export function shouldPersistChatOutput(output: ChatOutput | null | undefined) {
  return Boolean(output && output.type !== 'answer');
}

export function resolveChatOutputReportGroup(
  groups: ReportGroup[],
  libraries: ChatLibraryRef[] = [],
  prompt = '',
) {
  const normalizedLibraries = normalizeLibraries(libraries);
  for (const library of normalizedLibraries) {
    const references = [library.key, library.label].map((item) => String(item || '').trim()).filter(Boolean);
    for (const reference of references) {
      const match = resolveReportGroup(groups, reference);
      if (match) return match;
    }
  }

  return findReportGroupForPrompt(groups, prompt) || null;
}

export function buildChatOutputDynamicSource(input: {
  prompt: string;
  output: ChatOutput;
  libraries: ChatLibraryRef[];
  reportTemplate?: ChatReportTemplateRef;
}) {
  if (input.output.type !== 'page') return null;

  const libraries = normalizeLibraries(input.libraries);
  if (!libraries.length) return null;

  const now = new Date().toISOString();
  const templateKey = String(input.reportTemplate?.key || '').trim();
  const templateLabel = String(input.reportTemplate?.label || '').trim();
  const conceptMode = !templateKey;

  const dynamicSource: ReportDynamicSource = {
    enabled: true,
    request: String(input.prompt || input.output.title || '').trim(),
    outputType: 'page',
    conceptMode,
    templateKey: conceptMode ? '' : templateKey,
    templateLabel: conceptMode ? '' : templateLabel,
    libraries,
    updatedAt: now,
    lastRenderedAt: '',
    sourceFingerprint: '',
    sourceDocumentCount: 0,
    sourceUpdatedAt: '',
  };

  return dynamicSource;
}

export async function persistChatOutputIfNeeded(input: {
  prompt: string;
  output: ChatOutput | null | undefined;
  libraries: ChatLibraryRef[];
  reportTemplate?: ChatReportTemplateRef;
}) {
  if (!shouldPersistChatOutput(input.output)) return null;

  const state = await loadReportCenterState();
  const group = resolveChatOutputReportGroup(state.groups, input.libraries, input.prompt);
  if (!group) return null;

  const output = input.output as Exclude<ChatOutput, { type: 'answer' }>;
  const dynamicSource = buildChatOutputDynamicSource({
    prompt: input.prompt,
    output,
    libraries: input.libraries,
    reportTemplate: input.reportTemplate,
  });

  const record = await createReportOutput({
    groupKey: group.key,
    templateKey: String(input.reportTemplate?.key || '').trim(),
    title: output.title,
    triggerSource: 'chat',
    kind: output.type,
    format: output.format,
    content: output.content,
    table: output.table
      ? {
          title: output.table.title,
          columns: output.table.columns,
          rows: output.table.rows,
        }
      : null,
    page: output.page || null,
    libraries: normalizeLibraries(input.libraries),
    dynamicSource,
  });

  return record;
}
