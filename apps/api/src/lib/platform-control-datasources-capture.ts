import { syncWebCaptureTaskToDatasource } from './datasource-web-bridge.js';
import { ingestWebCaptureTaskDocument } from './datasource-web-ingest.js';
import { createAndRunWebCaptureTask } from './web-capture.js';
import {
  buildWebCaptureCredentialSummary,
  loadWebCaptureCredential,
  saveWebCaptureCredential,
} from './web-capture-credentials.js';
import {
  clampLimit,
  resolveBooleanFlag,
  resolveTargetLibrariesFromFlags,
} from './platform-control-datasources-support.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-datasources-types.js';

export async function runDatasourceCaptureCommand(
  subcommand: string,
  flags: CommandFlags,
): Promise<PlatformControlResult | null> {
  if (subcommand === 'capture-url') {
    const url = String(flags.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Missing valid --url for datasources capture-url.');
    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const task = await createAndRunWebCaptureTask({
      url,
      focus: String(flags.focus || '').trim(),
      frequency: 'manual',
      note: String(flags.note || '').trim(),
      maxItems: clampLimit(flags['max-items'], 1, 20),
      keepOriginalFiles: resolveBooleanFlag(flags['keep-original']),
    });
    const definition = await syncWebCaptureTaskToDatasource(task, {
      name: String(flags.name || '').trim() || undefined,
      targetLibraries: targetLibraries.length ? targetLibraries : undefined,
      notes: String(flags.note || '').trim() || undefined,
    });
    const webIngest = task.lastStatus === 'success' ? await ingestWebCaptureTaskDocument({ task, targetLibraries: definition.targetLibraries }) : null;
    const successCount = webIngest?.ingestResult.summary.successCount || 0;
    const failedCount = webIngest?.ingestResult.summary.failedCount || (successCount > 0 ? 0 : (task.lastStatus === 'error' ? 1 : 0));
    return {
      ok: true,
      action: 'datasources.capture-url',
      summary: task.lastStatus === 'success' && successCount > 0
        ? `Captured URL "${url}" and ingested it into ${definition.targetLibraries.map((item) => item.label).join(', ') || 'the target library'}.`
        : `Capture executed for "${url}", but ingestion did not complete successfully.`,
      data: {
        datasource: { id: definition.id, name: definition.name, kind: definition.kind, targetLibraries: definition.targetLibraries },
        task,
        ingest: webIngest ? { ingestPath: webIngest.ingestPath, summary: webIngest.ingestResult.summary, libraryKeys: webIngest.ingestResult.confirmedLibraryKeys } : null,
        captureStatus: task.lastStatus || 'idle',
        captureSummary: task.lastSummary || '',
        successCount,
        failedCount,
      },
    };
  }
  if (subcommand === 'login-capture') {
    const url = String(flags.url || '').trim();
    if (!/^https?:\/\//i.test(url)) throw new Error('Missing valid --url for datasources login-capture.');
    const username = String(flags.username || '').trim();
    const password = String(flags.password || '').trim();
    const remember = resolveBooleanFlag(flags.remember);
    let stored = await loadWebCaptureCredential(url);
    if (!username || !password) {
      if (!stored) throw new Error('Missing login credential. Provide --username and --password, or store one first.');
    } else if (remember) {
      const savedCredential = await saveWebCaptureCredential({ url, username, password });
      stored = {
        id: savedCredential.id,
        origin: savedCredential.origin,
        username,
        password,
        maskedUsername: savedCredential.maskedUsername,
        updatedAt: savedCredential.updatedAt,
        sessionCookies: savedCredential.sessionCookies,
        sessionUpdatedAt: savedCredential.sessionUpdatedAt,
      };
    } else {
      stored = {
        id: '',
        origin: new URL(url).origin.toLowerCase(),
        username,
        password,
        maskedUsername: buildWebCaptureCredentialSummary(url, { maskedUsername: username, origin: new URL(url).origin.toLowerCase() }).maskedUsername || `${username.slice(0, 2)}***`,
        updatedAt: new Date().toISOString(),
        sessionCookies: {},
        sessionUpdatedAt: '',
      };
    }
    const targetLibraries = await resolveTargetLibrariesFromFlags(flags);
    const task = await createAndRunWebCaptureTask({
      url,
      focus: String(flags.focus || '').trim(),
      note: String(flags.note || '').trim(),
      frequency: 'manual',
      maxItems: clampLimit(flags['max-items'], 5, 50),
      auth: stored?.username && stored?.password ? { username: stored.username, password: stored.password } : undefined,
      credentialRef: remember ? (stored?.id || '') : '',
      credentialLabel: stored?.maskedUsername || '',
      keepOriginalFiles: resolveBooleanFlag(flags['keep-original']),
    });
    const definition = await syncWebCaptureTaskToDatasource(task, {
      name: String(flags.name || '').trim() || undefined,
      targetLibraries: targetLibraries.length ? targetLibraries : undefined,
      notes: String(flags.note || '').trim() || undefined,
    });
    const webIngest = task.lastStatus === 'success' ? await ingestWebCaptureTaskDocument({ task, targetLibraries: definition.targetLibraries }) : null;
    const latestStored = remember ? await loadWebCaptureCredential(url) : stored;
    const successCount = webIngest?.ingestResult.summary.successCount || 0;
    const failedCount = webIngest?.ingestResult.summary.failedCount || (successCount > 0 ? 0 : (task.lastStatus === 'error' ? 1 : 0));
    return {
      ok: true,
      action: 'datasources.login-capture',
      summary: task.lastStatus === 'success' && successCount > 0
        ? `Captured authenticated URL "${url}" and ingested it into ${definition.targetLibraries.map((item) => item.label).join(', ') || 'the target library'}.`
        : `Authenticated capture executed for "${url}", but ingestion did not complete successfully.`,
      data: {
        datasource: { id: definition.id, name: definition.name, kind: definition.kind, targetLibraries: definition.targetLibraries },
        credentialSummary: buildWebCaptureCredentialSummary(url, latestStored),
        task,
        ingest: webIngest ? { ingestPath: webIngest.ingestPath, summary: webIngest.ingestResult.summary, libraryKeys: webIngest.ingestResult.confirmedLibraryKeys } : null,
        captureStatus: task.lastStatus || 'idle',
        captureSummary: task.lastSummary || '',
        successCount,
        failedCount,
      },
    };
  }
  return null;
}
