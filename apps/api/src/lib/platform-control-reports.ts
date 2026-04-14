import { runReportOutputCommand } from './platform-control-reports-outputs.js';
import { runReportTemplateCommand } from './platform-control-reports-templates.js';
import type { CommandFlags, PlatformControlResult } from './platform-control-reports-types.js';

export type { CommandFlags, PlatformControlResult } from './platform-control-reports-types.js';

export async function runReportCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  const templateResult = await runReportTemplateCommand(subcommand, flags);
  if (templateResult) return templateResult;

  const outputResult = await runReportOutputCommand(subcommand, flags);
  if (outputResult) return outputResult;

  throw new Error(`Unsupported reports subcommand: ${subcommand}`);
}
