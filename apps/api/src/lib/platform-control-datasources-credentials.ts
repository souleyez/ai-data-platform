import {
  deleteDatasourceCredential,
  listDatasourceCredentials,
  upsertDatasourceCredential,
} from './datasource-credentials.js';
import {
  parseHeadersFlag,
  resolveDatasourceCredentialKindFlag,
} from './platform-control-datasources-support.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-datasources-types.js';

export async function runDatasourceCredentialCommand(
  subcommand: string,
  flags: CommandFlags,
): Promise<PlatformControlResult | null> {
  if (subcommand === 'credentials') {
    const items = await listDatasourceCredentials();
    return { ok: true, action: 'datasources.credentials', summary: `Loaded ${items.length} datasource credentials.`, data: { items } };
  }
  if (subcommand === 'save-credential') {
    const label = String(flags.label || flags.name || '').trim();
    if (!label) throw new Error('Missing --label for datasources save-credential.');
    const secret = {
      username: String(flags.username || '').trim() || undefined,
      password: String(flags.password || '').trim() || undefined,
      token: String(flags.token || flags['api-key'] || '').trim() || undefined,
      connectionString: String(flags['connection-string'] || '').trim() || undefined,
      cookies: String(flags.cookies || '').trim() || undefined,
      headers: parseHeadersFlag(flags.headers),
    };
    const item = await upsertDatasourceCredential({
      id: String(flags.id || '').trim() || `cred-${Date.now()}`,
      kind: resolveDatasourceCredentialKindFlag(flags.kind),
      label,
      origin: String(flags.origin || '').trim(),
      notes: String(flags.note || flags.notes || '').trim(),
      secret,
    });
    return { ok: true, action: 'datasources.save-credential', summary: `Saved datasource credential "${item.label}".`, data: { item } };
  }
  if (subcommand === 'delete-credential') {
    const id = String(flags.credential || flags.id || '').trim();
    if (!id) throw new Error('Missing --credential for datasources delete-credential.');
    const item = await deleteDatasourceCredential(id);
    if (!item) throw new Error(`Datasource credential "${id}" not found.`);
    return { ok: true, action: 'datasources.delete-credential', summary: `Deleted datasource credential "${item.label}".`, data: { item } };
  }
  return null;
}
