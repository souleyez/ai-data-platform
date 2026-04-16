import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BotChannel } from './bot-definitions.js';
import { STORAGE_CONFIG_DIR } from './paths.js';
import type {
  ChannelFeedbackEvent,
  ChannelFeedbackSession,
  ChannelSessionFeedbackState,
} from './channel-session-feedback-types.js';
import {
  createEmptyFeedbackState,
  normalizeSessionStatus,
} from './channel-session-feedback-support.js';

const CHANNEL_FEEDBACK_FILE = path.join(STORAGE_CONFIG_DIR, 'channel-session-feedback.json');
export const DEFAULT_IDLE_MINUTES = Number(process.env.CHANNEL_FEEDBACK_IDLE_MINUTES || 10);
export const DEFAULT_AUTO_FIVE_STAR_MINUTES = Number(process.env.CHANNEL_FEEDBACK_AUTO_FIVE_MINUTES || 30);

async function ensureFeedbackDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

export async function readFeedbackState(): Promise<ChannelSessionFeedbackState> {
  try {
    const parsed = JSON.parse(await fs.readFile(CHANNEL_FEEDBACK_FILE, 'utf8')) as Partial<ChannelSessionFeedbackState>;
    return {
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions
            .map((session): ChannelFeedbackSession => ({
              id: String(session.id || ''),
              channel: String(session.channel || 'wecom') as BotChannel,
              botId: String(session.botId || ''),
              botName: String(session.botName || ''),
              externalBotId: String(session.externalBotId || ''),
              routeKey: String(session.routeKey || ''),
              tenantId: String(session.tenantId || ''),
              sessionUser: String(session.sessionUser || ''),
              recipientId: String(session.recipientId || ''),
              senderId: String(session.senderId || ''),
              senderName: String(session.senderName || ''),
              status: normalizeSessionStatus(session.status),
              lastAssistantReplyAt: String(session.lastAssistantReplyAt || ''),
              lastAnswerExcerpt: String(session.lastAnswerExcerpt || ''),
              promptDueAt: String(session.promptDueAt || ''),
              promptSentAt: String(session.promptSentAt || ''),
              autoFiveStarDueAt: String(session.autoFiveStarDueAt || ''),
            }))
            .filter((session) => session.id)
        : [],
      ratings: Array.isArray(parsed.ratings)
        ? parsed.ratings
            .map((rating): ChannelFeedbackEvent => ({
              id: String(rating.id || ''),
              sessionId: String(rating.sessionId || ''),
              channel: String(rating.channel || 'wecom') as BotChannel,
              botId: String(rating.botId || ''),
              sessionUser: String(rating.sessionUser || ''),
              recipientId: String(rating.recipientId || ''),
              senderId: String(rating.senderId || ''),
              senderName: String(rating.senderName || ''),
              rating: Number(rating.rating || 0),
              source: (rating.source || 'user_text') as ChannelFeedbackEvent['source'],
              responseText: String(rating.responseText || ''),
              createdAt: String(rating.createdAt || ''),
            }))
            .filter((rating) => rating.id)
        : [],
    };
  } catch {
    return createEmptyFeedbackState();
  }
}

export async function writeFeedbackState(state: ChannelSessionFeedbackState) {
  await ensureFeedbackDir();
  await fs.writeFile(CHANNEL_FEEDBACK_FILE, JSON.stringify(state, null, 2), 'utf8');
}
