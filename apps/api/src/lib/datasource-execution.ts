import {
  appendDatasourceRun,
  getDatasourceDefinition,
  listDatasourceDefinitions,
  upsertDatasourceDefinition,
  type DatasourceDefinition,
} from './datasource-definitions.js';
import {
  deleteWebCaptureTask,
  updateWebCaptureTaskStatus,
} from './web-capture.js';
import { computeNextRunAt } from './datasource-schedule.js';
import {
  runDatabaseDatasourceDefinition,
  runErpDatasourceDefinition,
  runWebDatasourceDefinition,
} from './datasource-execution-connected.js';
import {
  runLocalDirectoryDatasourceDefinition,
  runUploadPublicDatasourceDefinition,
} from './datasource-execution-local.js';
import {
  activateDatasourceWebTask,
  appendFailedRunForDefinition,
  findLinkedWebTask,
} from './datasource-execution-support.js';

export async function activateDatasourceDefinition(id: string) {
  const definition = await getDatasourceDefinition(id);
  if (!definition) throw new Error('datasource definition not found');

  if (definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery') {
    await activateDatasourceWebTask(definition);
  }

  return upsertDatasourceDefinition({
    ...definition,
    status: 'active',
    nextRunAt: computeNextRunAt(definition.schedule.kind, 'active'),
  });
}

export async function pauseDatasourceDefinition(id: string) {
  const definition = await getDatasourceDefinition(id);
  if (!definition) throw new Error('datasource definition not found');

  if (definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery') {
    const task = await findLinkedWebTask(definition);
    if (task) {
      await updateWebCaptureTaskStatus(task.id, 'paused');
    }
  }

  return upsertDatasourceDefinition({
    ...definition,
    status: 'paused',
    nextRunAt: '',
  });
}

export async function runDatasourceDefinition(id: string) {
  const definition = await getDatasourceDefinition(id);
  if (!definition) throw new Error('datasource definition not found');
  if (definition.status === 'paused') {
    throw new Error('paused datasource definition cannot be run until activated');
  }

  if (definition.kind === 'local_directory') {
    return runLocalDirectoryDatasourceDefinition(definition);
  }

  if (definition.kind === 'upload_public') {
    return runUploadPublicDatasourceDefinition(definition);
  }

  if (definition.kind === 'database') {
    return runDatabaseDatasourceDefinition(definition);
  }

  if (definition.kind === 'erp') {
    return runErpDatasourceDefinition(definition);
  }

  if (!(definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery')) {
    throw new Error('datasource run is not implemented for this provider yet');
  }

  return runWebDatasourceDefinition(definition);
}

export async function deleteDatasourceExecutionArtifacts(definition: DatasourceDefinition) {
  if (!(definition.kind === 'web_public' || definition.kind === 'web_login' || definition.kind === 'web_discovery')) {
    return;
  }
  const task = await findLinkedWebTask(definition);
  if (task) {
    await deleteWebCaptureTask(task.id);
  }
}

export async function runDueDatasourceDefinitions() {
  const definitions = await listDatasourceDefinitions();
  const now = Date.now();
  const due = definitions.filter((definition) => {
    if (definition.status !== 'active') return false;
    if (definition.schedule.kind === 'manual') return false;
    if (definition.kind !== 'local_directory') return false;
    const nextRunAt = definition.nextRunAt || '';
    if (!nextRunAt) return false;
    return Date.parse(nextRunAt) <= now;
  });

  const results = [];
  for (const definition of due) {
    try {
      results.push(await runDatasourceDefinition(definition.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'run due datasource failed';
      const run = await appendFailedRunForDefinition(definition, message);
      results.push({ definition, task: null, run });
    }
  }

  return {
    executedCount: results.length,
    items: results,
  };
}
