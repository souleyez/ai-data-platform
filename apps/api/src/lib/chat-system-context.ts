import type {
  IntelligenceCapabilities,
  IntelligenceMode,
} from './intelligence-mode.js';
import type { BotDefinition, BotChannel } from './bot-definitions.js';
import { buildPlatformCapabilityContextLines } from './platform-capabilities.js';

function normalizeConstraintText(value: string) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

export function buildSystemCapabilityContextBlock(input: {
  mode: IntelligenceMode;
  capabilities: IntelligenceCapabilities;
}) {
  const modeLabel = input.mode === 'full' ? 'full' : 'service';
  const writeLabel = input.capabilities.canModifyLocalSystemFiles
    ? 'You may plan writable system actions when the host explicitly confirms execution.'
    : 'You are in read-first mode and must not pretend that writable system actions were executed.';

  return [
    'You are operating inside the AI data platform itself, not a generic standalone chat box.',
    `Current platform mode: ${modeLabel}.`,
    'Both normal chat mode and full mode should understand the same platform surface. The difference is permission boundary, not product awareness.',
    ...buildPlatformCapabilityContextLines(),
    writeLabel,
    'When users ask what the system can do, or ask for an action that matches the platform surface, answer as someone who already understands these features and can choose the next appropriate action.',
    'Do not describe internal routing or orchestration. Answer naturally and act as if you understand the platform surface already.',
    'If no execution result is supplied by the host, never claim a system action has already been completed.',
  ].join('\n');
}

export function buildUserConstraintsContextBlock(systemConstraints?: string) {
  const normalized = normalizeConstraintText(systemConstraints || '');
  if (!normalized) return '';

  return [
    'User-visible operating constraints for this conversation:',
    normalized,
    'Treat the constraints above as explicit do/don’t rules unless they conflict with real system permissions.',
  ].join('\n');
}

export function buildBotIdentityContextBlock(input: {
  bot: BotDefinition | null;
  channel: BotChannel;
}) {
  if (!input.bot) return '';

  const additionalLibraryFilter = input.bot.visibleLibraryKeys.length
    ? input.bot.visibleLibraryKeys.join(' | ')
    : 'none (access level only)';

  return [
    'Current bot identity:',
    `Bot name: ${input.bot.name}`,
    `Bot id: ${input.bot.id}`,
    `Current channel: ${input.channel}`,
    `Library access level: ${input.bot.libraryAccessLevel}`,
    `Additional library filter: ${additionalLibraryFilter}`,
    `Include ungrouped: ${input.bot.includeUngrouped ? 'yes' : 'no'}`,
    `Include failed parse documents: ${input.bot.includeFailedParseDocuments ? 'yes' : 'no'}`,
    input.bot.systemPrompt
      ? `Bot-specific guidance: ${input.bot.systemPrompt}`
      : 'Bot-specific guidance: none',
    'You must behave as this bot, and must not imply access to knowledge outside the visible libraries above.',
  ].join('\n');
}
