import { persistChatOutputIfNeeded } from './chat-output-persistence.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { buildDocumentId, loadParsedDocuments } from './document-store.js';
import { executeKnowledgeOutput } from './knowledge-execution.js';
import type { KnowledgeOutputKind } from './knowledge-template.js';
import {
  addSharedTemplateReferenceFileFromPath,
  addSharedTemplateReferenceLink,
  createSharedReportTemplate,
  deleteReportOutput,
  deleteSharedReportTemplate,
  finalizeDraftReportOutput,
  inferReportTemplateTypeFromSource,
  loadReportCenterState,
  reviseReportOutput,
  reviseReportOutputDraftCopy,
  reviseReportOutputDraftModule,
  reviseReportOutputDraftStructure,
  updateReportGroupTemplate,
  updateSharedReportTemplate,
  type ReportTemplateType,
} from './report-center.js';
import type { ReportPlanLayoutVariant } from './report-planner.js';

type CommandFlags = Record<string, string>;

export type PlatformControlResult = {
  ok: boolean;
  action: string;
  summary: string;
  data?: Record<string, unknown>;
};

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampLimit(value: string | undefined, fallback: number, max: number) {
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

async function resolveLibraryReference(reference: string) {
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

function resolveOutputKind(value: string): KnowledgeOutputKind {
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

function resolveReportTemplateType(value: string | undefined): ReportTemplateType | undefined {
  const normalized = normalizeText(value || '');
  if (!normalized) return undefined;
  if (['table', 'sheet', 'spreadsheet'].includes(normalized)) return 'table';
  if (['static-page', 'page', 'html', 'static page'].includes(normalized)) return 'static-page';
  if (['ppt', 'slides', 'pptx'].includes(normalized)) return 'ppt';
  if (['document', 'doc', 'docx', 'word'].includes(normalized)) return 'document';
  throw new Error('Unsupported template type. Supported: table, static-page, ppt, document');
}

function resolveReportLayoutVariant(value: string | undefined): ReportPlanLayoutVariant | undefined {
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

function formatOutputKindLabel(kind: KnowledgeOutputKind) {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'md') return 'markdown document';
  return 'document';
}

function buildTemplateOutputRequest(input: {
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

function summarizeReportTemplateItem(item: {
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

function summarizeDocumentItem(item: Awaited<ReturnType<typeof loadParsedDocuments>>['items'][number]) {
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

async function resolveDocumentSnapshotItem(documentId: string) {
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

function resolveBooleanFlag(value: string | undefined) {
  const normalized = normalizeText(value || '');
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export async function runReportCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  if (subcommand === 'templates') {
    const state = await loadReportCenterState();
    const templateType = resolveReportTemplateType(flags.type);
    const limit = clampLimit(flags.limit, 20, 100);
    const items = state.templates
      .filter((item) => !templateType || item.type === templateType)
      .slice(0, limit)
      .map(summarizeReportTemplateItem);

    return {
      ok: true,
      action: 'reports.templates',
      summary: `Loaded ${items.length} reusable report templates${templateType ? ` of type ${templateType}` : ''}.`,
      data: { items },
    };
  }

  if (subcommand === 'template-from-document') {
    const documentId = String(flags.document || flags.id || '').trim();
    if (!documentId) throw new Error('Missing --document for reports template-from-document.');
    const document = await resolveDocumentSnapshotItem(documentId);
    const templateType = resolveReportTemplateType(flags.type)
      || inferReportTemplateTypeFromSource({ fileName: document.name });
    const templateLabel = String(flags.label || document.title || document.name || '').trim();
    if (!templateLabel) throw new Error('Template label is required.');

    let createdTemplate: Awaited<ReturnType<typeof createSharedReportTemplate>> | null = null;
    try {
      createdTemplate = await createSharedReportTemplate({
        label: templateLabel,
        type: templateType,
        description: String(flags.description || '').trim()
          || `由数据集文件“${document.title || document.name}”创建的输出模板。`,
        preferredLayoutVariant: resolveReportLayoutVariant(flags.layout),
        isDefault: resolveBooleanFlag(flags.default),
      });
      const reference = await addSharedTemplateReferenceFileFromPath(createdTemplate.key, {
        filePath: document.path,
        originalName: document.name,
      });
      return {
        ok: true,
        action: 'reports.template-from-document',
        summary: `Created reusable template "${createdTemplate.label}" from document "${document.title || document.name}".`,
        data: {
          template: {
            key: createdTemplate.key,
            label: createdTemplate.label,
            type: createdTemplate.type,
            description: createdTemplate.description,
            preferredLayoutVariant: createdTemplate.preferredLayoutVariant || '',
            isDefault: createdTemplate.isDefault === true,
          },
          reference,
          document: summarizeDocumentItem(document),
        },
      };
    } catch (error) {
      if (createdTemplate?.key) {
        await deleteSharedReportTemplate(createdTemplate.key).catch(() => undefined);
      }
      throw error;
    }
  }

  if (subcommand === 'create-template') {
    const templateLabel = String(flags.label || flags.name || '').trim();
    if (!templateLabel) throw new Error('Missing --label for reports create-template.');
    const template = await createSharedReportTemplate({
      label: templateLabel,
      type: resolveReportTemplateType(flags.type),
      description: String(flags.description || '').trim() || undefined,
      preferredLayoutVariant: resolveReportLayoutVariant(flags.layout),
      isDefault: resolveBooleanFlag(flags.default),
    });
    return {
      ok: true,
      action: 'reports.create-template',
      summary: `Created reusable template "${template.label}".`,
      data: { template: summarizeReportTemplateItem(template) },
    };
  }

  if (subcommand === 'update-template') {
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports update-template.');
    const patch: { label?: string; description?: string; preferredLayoutVariant?: ReportPlanLayoutVariant; isDefault?: boolean } = {};
    if (flags.label !== undefined) patch.label = String(flags.label || '').trim();
    if (flags.description !== undefined) patch.description = String(flags.description || '').trim();
    if (flags.layout !== undefined) patch.preferredLayoutVariant = resolveReportLayoutVariant(flags.layout);
    if (flags.default !== undefined) patch.isDefault = resolveBooleanFlag(flags.default);
    if (!Object.keys(patch).length) {
      throw new Error('Missing template update fields. Provide --label, --description, --layout, or --default.');
    }
    const template = await updateSharedReportTemplate(templateKey, patch);
    return {
      ok: true,
      action: 'reports.update-template',
      summary: `Updated reusable template "${template.label}".`,
      data: { template: summarizeReportTemplateItem(template) },
    };
  }

  if (subcommand === 'delete-template') {
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports delete-template.');
    const template = await deleteSharedReportTemplate(templateKey);
    return {
      ok: true,
      action: 'reports.delete-template',
      summary: `Deleted reusable template "${template.label}".`,
      data: { template: summarizeReportTemplateItem(template) },
    };
  }

  if (subcommand === 'set-group-template') {
    const library = await resolveLibraryReference(flags.library || flags.group || '');
    const templateKey = String(flags.template || flags.key || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports set-group-template.');
    const result = await updateReportGroupTemplate(library.key, templateKey);
    return {
      ok: true,
      action: 'reports.set-group-template',
      summary: `Set default template for "${result.group.label}" to "${result.template.label}".`,
      data: {
        group: {
          key: result.group.key,
          label: result.group.label,
          defaultTemplateKey: result.group.defaultTemplateKey,
        },
        template: summarizeReportTemplateItem(result.template),
      },
    };
  }

  if (subcommand === 'group-templates') {
    const library = await resolveLibraryReference(flags.library || flags.group || '');
    const state = await loadReportCenterState();
    const group = state.groups.find((item) => item.key === library.key);
    if (!group) throw new Error(`Report group "${library.label}" not found.`);
    const items = (group.templates || []).map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description || '',
      type: item.type,
      isDefault: item.key === group.defaultTemplateKey,
    }));
    return {
      ok: true,
      action: 'reports.group-templates',
      summary: `Loaded ${items.length} group templates for "${group.label}".`,
      data: {
        group: {
          key: group.key,
          label: group.label,
          defaultTemplateKey: group.defaultTemplateKey,
        },
        items,
      },
    };
  }

  if (subcommand === 'template-reference-file') {
    const templateKey = String(flags.template || flags.key || '').trim();
    const filePath = String(flags.path || flags.file || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports template-reference-file.');
    if (!filePath) throw new Error('Missing --path for reports template-reference-file.');
    const reference = await addSharedTemplateReferenceFileFromPath(templateKey, {
      filePath,
      originalName: String(flags.name || flags.label || '').trim() || undefined,
    });
    return {
      ok: true,
      action: 'reports.template-reference-file',
      summary: `Attached file reference "${reference.originalName}" to template "${templateKey}".`,
      data: { templateKey, reference },
    };
  }

  if (subcommand === 'template-reference-link') {
    const templateKey = String(flags.template || flags.key || '').trim();
    const url = String(flags.url || '').trim();
    if (!templateKey) throw new Error('Missing --template for reports template-reference-link.');
    if (!url) throw new Error('Missing --url for reports template-reference-link.');
    const reference = await addSharedTemplateReferenceLink(templateKey, {
      url,
      label: String(flags.label || flags.name || '').trim() || undefined,
    });
    return {
      ok: true,
      action: 'reports.template-reference-link',
      summary: `Attached link reference to template "${templateKey}".`,
      data: { templateKey, reference },
    };
  }

  if (!subcommand || subcommand === 'outputs') {
    const state = await loadReportCenterState();
    const scopeLibrary = flags.library ? await resolveLibraryReference(flags.library) : null;
    const limit = clampLimit(flags.limit, 10, 50);
    const items = state.outputs
      .filter((item) => {
        if (!scopeLibrary) return true;
        return item.groupKey === scopeLibrary.key
          || item.groupLabel === scopeLibrary.label
          || (item.libraries || []).some((entry) => entry.key === scopeLibrary.key || entry.label === scopeLibrary.label);
      })
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        title: item.title,
        groupKey: item.groupKey,
        groupLabel: item.groupLabel,
        status: item.status,
        kind: item.kind || '',
        format: item.format || '',
        outputType: item.outputType,
        createdAt: item.createdAt,
        templateLabel: item.templateLabel,
      }));
    return {
      ok: true,
      action: 'reports.outputs',
      summary: `Loaded ${items.length} saved outputs${scopeLibrary ? ` for ${scopeLibrary.label}` : ''}.`,
      data: { items },
    };
  }

  if (subcommand === 'generate') {
    const library = await resolveLibraryReference(flags.library || '');
    const outputKind = resolveOutputKind(flags.format || flags.kind || '');
    const timeRange = String(flags['time-range'] || '').trim();
    const focus = String(flags.focus || '').trim();
    const templateKey = String(flags.template || '').trim();
    const request = buildTemplateOutputRequest({
      libraryLabel: library.label,
      outputKind,
      timeRange,
      focus,
      templateKey,
      request: String(flags.request || '').trim(),
    });
    const result = await executeKnowledgeOutput({
      prompt: request,
      confirmedRequest: request,
      preferredLibraries: [{ key: library.key, label: library.label }],
      preferredTemplateKey: templateKey,
      timeRange,
      contentFocus: focus,
      chatHistory: [],
    });
    const savedReport = await persistChatOutputIfNeeded({
      prompt: request,
      output: result.output,
      libraries: result.libraries,
      reportTemplate: result.reportTemplate || null,
    });
    return {
      ok: true,
      action: 'reports.generate',
      summary: `Generated a ${formatOutputKindLabel(outputKind)} from library "${library.label}".`,
      data: {
        library: { key: library.key, label: library.label },
        output: result.output,
        reportTemplate: result.reportTemplate || null,
        savedReport: savedReport || null,
      },
    };
  }

  if (subcommand === 'revise') {
    const outputId = String(flags.output || flags.id || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise.');
    if (!instruction) throw new Error('Missing --instruction for reports revise.');
    const item = await reviseReportOutput(outputId, instruction);
    return {
      ok: true,
      action: 'reports.revise',
      summary: `Revised output "${item.title}".`,
      data: { item },
    };
  }

  if (subcommand === 'revise-draft-module') {
    const outputId = String(flags.output || flags.id || '').trim();
    const moduleId = String(flags.module || flags['module-id'] || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise-draft-module.');
    if (!moduleId) throw new Error('Missing --module for reports revise-draft-module.');
    if (!instruction) throw new Error('Missing --instruction for reports revise-draft-module.');
    const item = await reviseReportOutputDraftModule(outputId, moduleId, instruction);
    return {
      ok: true,
      action: 'reports.revise-draft-module',
      summary: `Revised module "${moduleId}" for "${item.title}".`,
      data: { item },
    };
  }

  if (subcommand === 'revise-draft-structure') {
    const outputId = String(flags.output || flags.id || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise-draft-structure.');
    if (!instruction) throw new Error('Missing --instruction for reports revise-draft-structure.');
    const item = await reviseReportOutputDraftStructure(outputId, instruction);
    return {
      ok: true,
      action: 'reports.revise-draft-structure',
      summary: `Updated draft structure for "${item.title}".`,
      data: { item },
    };
  }

  if (subcommand === 'revise-draft-copy') {
    const outputId = String(flags.output || flags.id || '').trim();
    const instruction = String(flags.instruction || '').trim();
    if (!outputId) throw new Error('Missing --output for reports revise-draft-copy.');
    if (!instruction) throw new Error('Missing --instruction for reports revise-draft-copy.');
    const item = await reviseReportOutputDraftCopy(outputId, instruction);
    return {
      ok: true,
      action: 'reports.revise-draft-copy',
      summary: `Updated draft copy for "${item.title}".`,
      data: { item },
    };
  }

  if (subcommand === 'finalize-page') {
    const outputId = String(flags.output || flags.id || '').trim();
    if (!outputId) throw new Error('Missing --output for reports finalize-page.');
    const item = await finalizeDraftReportOutput(outputId);
    return {
      ok: true,
      action: 'reports.finalize-page',
      summary: `Finalized static-page draft "${item.title}".`,
      data: { item },
    };
  }

  if (subcommand === 'delete-output') {
    const outputId = String(flags.output || flags.id || '').trim();
    if (!outputId) throw new Error('Missing --output for reports delete-output.');
    await deleteReportOutput(outputId);
    return {
      ok: true,
      action: 'reports.delete-output',
      summary: `Deleted output "${outputId}".`,
      data: { outputId },
    };
  }

  throw new Error(`Unsupported reports subcommand: ${subcommand}`);
}
