import { logDatasourceRunDeletion } from './datasource-audit.js';
import {
  deleteDatasourceRun,
  getDatasourceDefinition,
  listDatasourceDefinitions,
  listDatasourceRuns,
} from './datasource-definitions.js';
import {
  activateDatasourceDefinition,
  pauseDatasourceDefinition,
  runDatasourceDefinition,
  runDueDatasourceDefinitions,
} from './datasource-execution.js';
import {
  buildDatasourceLibraryLabelMap,
  buildDatasourceRunReadModels,
} from './datasource-service.js';
import { loadDocumentLibraries } from './document-libraries.js';
import { listWebCaptureTasks, runDueWebCaptureTasks } from './web-capture.js';
import {
  clampLimit,
  resolveDatasourceReference,
} from './platform-control-datasources-support.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-datasources-types.js';

export async function runDatasourceRunCommand(
  subcommand: string,
  flags: CommandFlags,
): Promise<PlatformControlResult | null> {
  if (subcommand === 'runs') {
    const libraries = await loadDocumentLibraries();
    const definitions = await listDatasourceDefinitions();
    const datasource = flags.datasource ? await resolveDatasourceReference(flags.datasource) : null;
    const limit = clampLimit(flags.limit, 6, 20);
    const runs = await listDatasourceRuns(datasource?.id);
    const items = buildDatasourceRunReadModels({
      runs: runs.slice(0, limit),
      definitions,
      libraryLabelMap: buildDatasourceLibraryLabelMap(libraries),
      documentSummaryMap: new Map(),
    });
    return { ok: true, action: 'datasources.runs', summary: `Loaded ${items.length} recent datasource runs.`, data: { datasource: datasource ? { id: datasource.id, name: datasource.name } : null, items } };
  }
  if (subcommand === 'run-due') {
    const result = await runDueDatasourceDefinitions();
    return { ok: true, action: 'datasources.run-due', summary: result.executedCount ? `Ran ${result.executedCount} due datasource definitions.` : 'No datasource definitions were due.', data: result as unknown as Record<string, unknown> };
  }
  if (subcommand === 'web-tasks') {
    const items = await listWebCaptureTasks();
    return { ok: true, action: 'datasources.web-tasks', summary: `Loaded ${items.length} web capture tasks.`, data: { items } };
  }
  if (subcommand === 'web-run-due') {
    const result = await runDueWebCaptureTasks();
    return { ok: true, action: 'datasources.web-run-due', summary: result.executedCount ? `Ran ${result.executedCount} due web capture tasks.` : 'No web capture tasks were due.', data: result as unknown as Record<string, unknown> };
  }
  if (subcommand === 'delete-run') {
    const runId = String(flags.run || flags.id || '').trim();
    if (!runId) throw new Error('Missing --run for datasources delete-run.');
    const removed = await deleteDatasourceRun(runId);
    if (!removed) throw new Error(`Datasource run "${runId}" not found.`);
    await logDatasourceRunDeletion(removed, 'user');
    return { ok: true, action: 'datasources.delete-run', summary: `Deleted datasource run "${runId}".`, data: { item: removed } };
  }
  if (subcommand === 'run') {
    const definition = await resolveDatasourceReference(flags.datasource || '');
    const result = await runDatasourceDefinition(definition.id);
    return { ok: true, action: 'datasources.run', summary: `Ran datasource "${definition.name}".`, data: { datasource: { id: definition.id, name: definition.name }, run: result.run || null } };
  }
  if (subcommand === 'pause') {
    const definition = await resolveDatasourceReference(flags.datasource || '');
    const updated = await pauseDatasourceDefinition(definition.id);
    return { ok: true, action: 'datasources.pause', summary: `Paused datasource "${updated.name}".`, data: { datasource: updated } };
  }
  if (subcommand === 'activate') {
    const definition = await resolveDatasourceReference(flags.datasource || '');
    const updated = await activateDatasourceDefinition(definition.id);
    const reloaded = await getDatasourceDefinition(updated.id);
    return { ok: true, action: 'datasources.activate', summary: `Activated datasource "${updated.name}".`, data: { datasource: reloaded || updated } };
  }
  return null;
}
