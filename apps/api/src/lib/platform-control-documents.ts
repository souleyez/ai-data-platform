import type {
  CommandFlags,
  PlatformControlResult,
} from './platform-control-documents-support.js';
import { runDocumentActionCommand } from './platform-control-documents-document-actions.js';
import { runDocumentLibraryCommand } from './platform-control-documents-library-actions.js';

export type {
  CommandFlags,
  PlatformControlResult,
} from './platform-control-documents-support.js';

export async function runDocumentCommand(subcommand: string, flags: CommandFlags): Promise<PlatformControlResult> {
  const libraryResult = await runDocumentLibraryCommand(subcommand, flags);
  if (libraryResult) return libraryResult;

  const actionResult = await runDocumentActionCommand(subcommand, flags);
  if (actionResult) return actionResult;

  throw new Error(`Unsupported documents subcommand: ${subcommand}`);
}
