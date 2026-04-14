import {
  deleteDatasourceDefinition,
  listDatasourceDefinitions,
  upsertDatasourceDefinition,
} from './datasource-definitions.js';
import { deleteDatasourceExecutionArtifacts } from './datasource-execution.js';
import {
  buildDatasourceConfigPatch,
  clampLimit,
  resolveDatasourceAuthModeFlag,
  resolveDatasourceKindFlag,
  resolveDatasourceReference,
  resolveDatasourceScheduleFlag,
  resolveDatasourceStatusFlag,
  resolveTargetLibrariesFromFlags,
} from './platform-control-datasources-support.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-datasources-types.js';

export async function runDatasourceDefinitionCommand(
  subcommand: string,
  flags: CommandFlags,
): Promise<PlatformControlResult | null> {
  if (subcommand === 'create') {
    const name = String(flags.name || '').trim();
    if (!name) throw new Error('Missing --name for datasources create.');
    const kind = resolveDatasourceKindFlag(flags.kind);
    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const authMode = resolveDatasourceAuthModeFlag(flags.auth, kind);
    const credentialId = String(flags.credential || flags['credential-id'] || '').trim();
    const credentialLabel = String(flags['credential-label'] || '').trim();
    const item = await upsertDatasourceDefinition({
      id: String(flags.id || '').trim() || `ds-${Date.now()}`,
      name,
      kind,
      status: resolveDatasourceStatusFlag(flags.status),
      targetLibraries,
      schedule: {
        kind: resolveDatasourceScheduleFlag(flags.schedule),
        timezone: String(flags.timezone || process.env.TZ || 'Asia/Shanghai').trim(),
        maxItemsPerRun: flags['max-items'] !== undefined ? clampLimit(flags['max-items'], 5, 200) : undefined,
      },
      authMode,
      credentialRef: credentialId ? { id: credentialId, kind: authMode, label: credentialLabel, origin: String(flags.origin || flags.url || '').trim(), updatedAt: new Date().toISOString() } : null,
      config: buildDatasourceConfigPatch(flags, kind),
      notes: String(flags.note || '').trim(),
    });
    return { ok: true, action: 'datasources.create', summary: `Created datasource "${item.name}".`, data: { item } };
  }
  if (subcommand === 'update') {
    const definition = await resolveDatasourceReference(flags.datasource || flags.id || '');
    const kind = flags.kind !== undefined ? resolveDatasourceKindFlag(flags.kind) : definition.kind;
    const targetLibraries = (flags.library !== undefined || flags.libraries !== undefined) ? await resolveTargetLibrariesFromFlags(flags) : definition.targetLibraries;
    const authMode = flags.auth !== undefined ? resolveDatasourceAuthModeFlag(flags.auth, kind) : definition.authMode;
    const credentialId = flags.credential !== undefined || flags['credential-id'] !== undefined ? String(flags.credential || flags['credential-id'] || '').trim() : (definition.credentialRef?.id || '');
    const credentialLabel = flags['credential-label'] !== undefined ? String(flags['credential-label'] || '').trim() : (definition.credentialRef?.label || '');
    const item = await upsertDatasourceDefinition({
      ...definition,
      name: flags.name !== undefined ? String(flags.name || '').trim() || definition.name : definition.name,
      kind,
      status: flags.status !== undefined ? resolveDatasourceStatusFlag(flags.status) : definition.status,
      targetLibraries,
      schedule: {
        kind: flags.schedule !== undefined ? resolveDatasourceScheduleFlag(flags.schedule) : definition.schedule.kind,
        timezone: flags.timezone !== undefined ? String(flags.timezone || '').trim() : definition.schedule.timezone,
        maxItemsPerRun: flags['max-items'] !== undefined ? clampLimit(flags['max-items'], 5, 200) : definition.schedule.maxItemsPerRun,
      },
      authMode,
      credentialRef: credentialId ? { id: credentialId, kind: authMode, label: credentialLabel, origin: String(flags.origin || flags.url || definition.credentialRef?.origin || '').trim(), updatedAt: new Date().toISOString() } : null,
      config: buildDatasourceConfigPatch(flags, kind, definition.config),
      notes: flags.note !== undefined ? String(flags.note || '').trim() : definition.notes,
    });
    return { ok: true, action: 'datasources.update', summary: `Updated datasource "${item.name}".`, data: { item } };
  }
  if (subcommand === 'delete') {
    const definition = await resolveDatasourceReference(flags.datasource || flags.id || '');
    await deleteDatasourceExecutionArtifacts(definition);
    const item = await deleteDatasourceDefinition(definition.id);
    if (!item) throw new Error(`Datasource "${definition.name}" could not be deleted.`);
    return { ok: true, action: 'datasources.delete', summary: `Deleted datasource "${definition.name}".`, data: { item } };
  }
  if (!subcommand || subcommand === 'list') {
    const definitions = await listDatasourceDefinitions();
    return {
      ok: true,
      action: 'datasources.list',
      summary: `Loaded ${definitions.length} managed datasources.`,
      data: {
        items: definitions.map((item) => ({
          id: item.id,
          name: item.name,
          kind: item.kind,
          status: item.status,
          targetLibraries: item.targetLibraries,
          lastRunAt: item.lastRunAt || '',
          lastStatus: item.lastStatus || '',
        })),
      },
    };
  }
  return null;
}
