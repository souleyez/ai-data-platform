import { persistChatOutputIfNeeded } from './chat-output-persistence.js';
import { executeKnowledgeOutput } from './knowledge-execution.js';
import {
  deleteReportOutput,
  finalizeDraftReportOutput,
  loadReportCenterState,
  reviseReportOutput,
  reviseReportOutputDraftCopy,
  reviseReportOutputDraftModule,
  reviseReportOutputDraftStructure,
} from './report-center.js';
import {
  buildTemplateOutputRequest,
  clampLimit,
  formatOutputKindLabel,
  resolveLibraryReference,
  resolveOutputKind,
} from './platform-control-reports-support.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-reports-types.js';

export async function runReportOutputCommand(
  subcommand: string,
  flags: CommandFlags,
): Promise<PlatformControlResult | null> {
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

  return null;
}
