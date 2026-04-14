import { runDatasourceCaptureCommand } from './platform-control-datasources-capture.js';
import { runDatasourceCredentialCommand } from './platform-control-datasources-credentials.js';
import { runDatasourceDefinitionCommand } from './platform-control-datasources-definitions.js';
import { runDatasourceRunCommand } from './platform-control-datasources-runs.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-datasources-types.js';

export type { CommandFlags, PlatformControlResult } from './platform-control-datasources-types.js';

export async function runDatasourceCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  const handlers = [
    runDatasourceCredentialCommand,
    runDatasourceDefinitionCommand,
    runDatasourceCaptureCommand,
    runDatasourceRunCommand,
  ];

  for (const handler of handlers) {
    const result = await handler(subcommand, flags);
    if (result) return result;
  }

  throw new Error(`Unsupported datasources subcommand: ${subcommand}`);
}
