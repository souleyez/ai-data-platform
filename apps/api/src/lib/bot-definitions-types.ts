export type BotChannel = 'web' | 'wecom' | 'teams' | 'qq' | 'feishu';

export type BotChannelBinding = {
  channel: BotChannel;
  enabled: boolean;
  externalBotId?: string;
  tenantId?: string;
  routeKey?: string;
  directorySourceId?: string;
};

export type BotDefinition = {
  id: string;
  name: string;
  slug: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  systemPrompt: string;
  libraryAccessLevel: number;
  visibleLibraryKeys: string[];
  includeUngrouped: boolean;
  includeFailedParseDocuments: boolean;
  channelBindings: BotChannelBinding[];
  updatedAt: string;
};

export type PersistedBotConfig = {
  version: number;
  updatedAt: string;
  items: BotDefinition[];
};

export type PublicBotSummary = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  isDefault: boolean;
  libraryAccessLevel: number;
  systemPromptSummary: string;
  channelBindings: Array<{ channel: BotChannel; enabled: boolean; configured: boolean }>;
};

export const BOT_CONFIG_VERSION = 1;
export const BOT_CHANNELS: BotChannel[] = ['web', 'wecom', 'teams', 'qq', 'feishu'];
