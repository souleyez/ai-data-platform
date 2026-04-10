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

function summarizeBotChannels(bot: BotDefinition) {
  const channels = bot.channelBindings
    .filter((binding) => binding.enabled)
    .map((binding) => {
      const suffix = binding.externalBotId || binding.routeKey || binding.tenantId || '';
      return suffix ? `${binding.channel}(${suffix})` : binding.channel;
    });
  return channels.length ? channels.join(' | ') : 'none';
}

function summarizeBotPrompt(prompt: string) {
  const normalized = normalizeConstraintText(prompt || '');
  if (!normalized) return 'none';
  return normalized.length > 200 ? `${normalized.slice(0, 200)}...` : normalized;
}

export function buildSystemCapabilityContextBlock(input: {
  mode: IntelligenceMode;
  capabilities: IntelligenceCapabilities;
}) {
  const modeLabel = input.mode === 'full' ? 'full' : 'service';
  const writeLabel = input.capabilities.canModifyLocalSystemFiles
    ? 'You are in full intelligence mode. Keep host-side restrictions light and let OpenClaw decide when to inspect, search, capture, generate, or continue multi-step work through the platform surface.'
    : 'You are in read-first mode and must not pretend that writable system actions were executed.';
  const actionStyleLabel = input.mode === 'full'
    ? 'In full mode, avoid leaking raw tool-call markup or internal command tags, but otherwise prefer completing the task end-to-end instead of narrowing it to plain Q&A.'
    : 'Capability awareness is descriptive. In ordinary service chat, do not emit raw tool-call markup, invoke tags, Bash plans, or CLI command blocks unless the user explicitly asks for command text.';
  const executionBoundaryLabel = input.mode === 'full'
    ? 'If the host has not yet supplied an execution result, continue from the available context and choose the next useful platform-aware step, but never claim a system action has already completed without a real result.'
    : 'If the host has not supplied an execution result, answer directly from the available context instead of planning commands.';

  return [
    'You are operating inside the AI data platform itself, not a generic standalone chat box.',
    `Current platform mode: ${modeLabel}.`,
    'Both normal chat mode and full mode should understand the same platform surface. The difference is permission boundary, not product awareness.',
    ...buildPlatformCapabilityContextLines(),
    writeLabel,
    'When users ask what the system can do, or ask for an action that matches the platform surface, answer as someone who already understands these features and can choose the next appropriate action.',
    actionStyleLabel,
    executionBoundaryLabel,
    'Do not describe internal routing or orchestration. Answer naturally and act as if you understand the platform surface already.',
    'If no execution result is supplied by the host, never claim a system action has already been completed.',
  ].join('\n');
}

export function buildBotConfigurationMemoryContextBlock(input: {
  mode: IntelligenceMode;
  bots: BotDefinition[];
  libraries: Array<{ key: string; label?: string; name?: string; permissionLevel?: number }>;
}) {
  const bots = Array.isArray(input.bots) ? input.bots.filter((item) => item.enabled) : [];
  const libraries = Array.isArray(input.libraries) ? input.libraries : [];
  const botLines = bots.length
    ? bots.map((bot) => {
      const visibleLibraries = bot.visibleLibraryKeys.length
        ? bot.visibleLibraryKeys.join(' | ')
        : 'access-level only';
      return `- ${bot.name} [${bot.id}] | channels: ${summarizeBotChannels(bot)} | access level: L${bot.libraryAccessLevel}+ | visible libraries: ${visibleLibraries} | guidance: ${summarizeBotPrompt(bot.systemPrompt)}`;
    })
    : ['- No bots are configured yet.'];
  const libraryLines = libraries.length
    ? libraries
      .map((library) => {
        const label = library.label || library.name || library.key;
        const level = Number.isFinite(Number(library.permissionLevel))
          ? Math.max(0, Math.floor(Number(library.permissionLevel)))
          : 0;
        return `${label}=L${level}`;
      })
      .join(' | ')
    : 'No knowledge libraries are configured yet.';

  const lines = [
    'Platform bot configuration memory:',
    ...botLines,
    `Knowledge library permission levels: ${libraryLines}`,
  ];

  if (input.mode === 'full') {
    lines.push(
      'In full mode, robot onboarding and permission changes should be handled conversationally instead of sending the user to a form.',
      'If the user wants to connect or modify a bot, guide them step by step to collect: bot name, target channel, channel-specific identifiers or credentials, library access level, and natural-language constraints.',
      'A bot with access level N may view knowledge libraries whose permissionLevel is greater than or equal to N. Level 0 can view all libraries.',
      'After collecting the configuration, summarize it clearly for confirmation before assuming it will be persisted by the host.',
      'Do not ask the user to fill a manual configuration form unless they explicitly request manual editing.',
    );
  }

  return lines.join('\n');
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
