import type { BotChannel } from './bot-definitions.js';

export type ChannelSessionFeedbackStatus = 'idle' | 'prompted';

export type ChannelFeedbackSession = {
  id: string;
  channel: BotChannel;
  botId: string;
  botName: string;
  externalBotId: string;
  routeKey: string;
  tenantId: string;
  sessionUser: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  status: ChannelSessionFeedbackStatus;
  lastAssistantReplyAt: string;
  lastAnswerExcerpt: string;
  promptDueAt: string;
  promptSentAt: string;
  autoFiveStarDueAt: string;
};

export type ChannelFeedbackEvent = {
  id: string;
  sessionId: string;
  channel: BotChannel;
  botId: string;
  sessionUser: string;
  recipientId: string;
  senderId: string;
  senderName: string;
  rating: number;
  source: 'user_text' | 'user_card' | 'default_timeout' | 'default_next_message';
  responseText: string;
  createdAt: string;
};

export type ChannelSessionFeedbackState = {
  updatedAt: string;
  sessions: ChannelFeedbackSession[];
  ratings: ChannelFeedbackEvent[];
};

export type ChannelSessionFeedbackContext = {
  channel: BotChannel;
  botId: string;
  botName?: string;
  externalBotId?: string;
  routeKey?: string;
  tenantId?: string;
  sessionUser: string;
  recipientId: string;
  senderId?: string;
  senderName?: string;
};
