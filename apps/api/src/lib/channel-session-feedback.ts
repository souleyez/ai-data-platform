import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BotChannel } from './bot-definitions.js';
import { STORAGE_CONFIG_DIR } from './paths.js';

const CHANNEL_FEEDBACK_FILE = path.join(STORAGE_CONFIG_DIR, 'channel-session-feedback.json');
const DEFAULT_IDLE_MINUTES = Number(process.env.CHANNEL_FEEDBACK_IDLE_MINUTES || 10);
const DEFAULT_AUTO_FIVE_STAR_MINUTES = Number(process.env.CHANNEL_FEEDBACK_AUTO_FIVE_MINUTES || 30);
const MAX_FEEDBACK_EVENTS = 500;

type ChannelSessionFeedbackStatus = 'idle' | 'prompted';

type ChannelFeedbackSession = {
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

type ChannelFeedbackEvent = {
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

type ChannelSessionFeedbackState = {
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

let mutationQueue: Promise<void> = Promise.resolve();

function buildTimestamp(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

function buildSessionId(input: ChannelSessionFeedbackContext) {
  return [
    input.channel,
    input.botId,
    input.recipientId,
    String(input.senderId || ''),
  ].join(':');
}

function buildFeedbackEventId() {
  return `channel-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyState(): ChannelSessionFeedbackState {
  return {
    updatedAt: new Date().toISOString(),
    sessions: [],
    ratings: [],
  };
}

function truncateAnswerExcerpt(value: string) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function normalizeRatingText(value: string) {
  return String(value || '').trim();
}

function parseStarRating(value: string) {
  const text = normalizeRatingText(value);
  if (!text) return null;

  const starCount = (text.match(/★/g) || []).length || (text.match(/⭐/g) || []).length;
  if (starCount >= 1 && starCount <= 5) return starCount;

  const explicit = text.match(/([1-5])\s*(?:星|stars?)/i);
  if (explicit) return Number(explicit[1]);

  const plain = text.match(/^[1-5]$/);
  if (plain) return Number(plain[0]);

  return null;
}

async function ensureFeedbackDir() {
  await fs.mkdir(STORAGE_CONFIG_DIR, { recursive: true });
}

function normalizeSessionStatus(value: unknown): ChannelSessionFeedbackStatus {
  return value === 'prompted' ? 'prompted' : 'idle';
}

async function readFeedbackState(): Promise<ChannelSessionFeedbackState> {
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
    return createEmptyState();
  }
}

async function writeFeedbackState(state: ChannelSessionFeedbackState) {
  await ensureFeedbackDir();
  await fs.writeFile(CHANNEL_FEEDBACK_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function mutateFeedbackState<T>(mutator: (state: ChannelSessionFeedbackState) => Promise<T>) {
  let result!: T;
  const run = mutationQueue.then(async () => {
    const state = await readFeedbackState();
    result = await mutator(state);
  });
  mutationQueue = run.then(() => undefined, () => undefined);
  await run;
  return result;
}

function recordRating(
  state: ChannelSessionFeedbackState,
  session: ChannelFeedbackSession,
  rating: number,
  source: ChannelFeedbackEvent['source'],
  responseText: string,
) {
  state.ratings = [
    {
      id: buildFeedbackEventId(),
      sessionId: session.id,
      channel: session.channel,
      botId: session.botId,
      sessionUser: session.sessionUser,
      recipientId: session.recipientId,
      senderId: session.senderId,
      senderName: session.senderName,
      rating,
      source,
      responseText,
      createdAt: new Date().toISOString(),
    },
    ...state.ratings,
  ].slice(0, MAX_FEEDBACK_EVENTS);
}

export async function loadChannelSessionFeedbackState() {
  return readFeedbackState();
}

export async function noteThirdPartyAssistantReply(input: ChannelSessionFeedbackContext & { answerContent?: string }) {
  return mutateFeedbackState(async (state) => {
    const sessionId = buildSessionId(input);
    const session: ChannelFeedbackSession = {
      id: sessionId,
      channel: input.channel,
      botId: input.botId,
      botName: String(input.botName || ''),
      externalBotId: String(input.externalBotId || ''),
      routeKey: String(input.routeKey || ''),
      tenantId: String(input.tenantId || ''),
      sessionUser: String(input.sessionUser || ''),
      recipientId: String(input.recipientId || ''),
      senderId: String(input.senderId || ''),
      senderName: String(input.senderName || ''),
      status: 'idle',
      lastAssistantReplyAt: new Date().toISOString(),
      lastAnswerExcerpt: truncateAnswerExcerpt(String(input.answerContent || '')),
      promptDueAt: buildTimestamp(DEFAULT_IDLE_MINUTES),
      promptSentAt: '',
      autoFiveStarDueAt: '',
    };

    state.sessions = [session, ...state.sessions.filter((item) => item.id !== sessionId)];
    state.updatedAt = new Date().toISOString();
    await writeFeedbackState(state);

    return session;
  });
}

export async function handleThirdPartyInboundFeedback(input: ChannelSessionFeedbackContext & { prompt: string }) {
  return mutateFeedbackState(async (state) => {
    const sessionId = buildSessionId(input);
    const existing = state.sessions.find((session) => session.id === sessionId);
    if (!existing) {
      return {
        handled: false,
        acknowledged: '',
        defaultedExistingSession: false,
      };
    }

    state.sessions = state.sessions.filter((session) => session.id !== sessionId);

    if (existing.status !== 'prompted') {
      state.updatedAt = new Date().toISOString();
      await writeFeedbackState(state);
      return {
        handled: false,
        acknowledged: '',
        defaultedExistingSession: false,
      };
    }

    const parsedRating = parseStarRating(input.prompt);
    if (parsedRating) {
      recordRating(state, existing, parsedRating, 'user_text', input.prompt);
      state.updatedAt = new Date().toISOString();
      await writeFeedbackState(state);
      return {
        handled: true,
        acknowledged: `感谢你的 ${parsedRating} 星评价，已记录。`,
        defaultedExistingSession: false,
      };
    }

    recordRating(state, existing, 5, 'default_next_message', input.prompt);
    state.updatedAt = new Date().toISOString();
    await writeFeedbackState(state);
    return {
      handled: false,
      acknowledged: '',
      defaultedExistingSession: true,
    };
  });
}

export async function completeThirdPartyFeedbackSelection(input: {
  sessionId: string;
  rating: number;
  source?: 'user_card' | 'user_text';
  responseText?: string;
}) {
  return mutateFeedbackState(async (state) => {
    const session = state.sessions.find((item) => item.id === input.sessionId);
    if (!session) return null;

    state.sessions = state.sessions.filter((item) => item.id !== input.sessionId);
    recordRating(
      state,
      session,
      Math.max(1, Math.min(5, Number(input.rating || 5))),
      input.source || 'user_card',
      String(input.responseText || ''),
    );
    state.updatedAt = new Date().toISOString();
    await writeFeedbackState(state);
    return session;
  });
}

export async function listDueThirdPartyFeedbackPrompts() {
  const state = await readFeedbackState();
  const now = Date.now();
  return state.sessions
    .filter((session) => session.status === 'idle' && Date.parse(session.promptDueAt || '') <= now)
    .sort((left, right) => Date.parse(left.promptDueAt || '') - Date.parse(right.promptDueAt || ''));
}

export async function markThirdPartyFeedbackPromptSent(sessionId: string) {
  return mutateFeedbackState(async (state) => {
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) return null;
    session.status = 'prompted';
    session.promptSentAt = new Date().toISOString();
    session.autoFiveStarDueAt = buildTimestamp(DEFAULT_AUTO_FIVE_STAR_MINUTES);
    state.updatedAt = new Date().toISOString();
    await writeFeedbackState(state);
    return session;
  });
}

export async function finalizeDueDefaultFeedbacks() {
  return mutateFeedbackState(async (state) => {
    const now = Date.now();
    const dueSessions = state.sessions.filter((session) => (
      session.status === 'prompted' && Date.parse(session.autoFiveStarDueAt || '') <= now
    ));
    if (!dueSessions.length) {
      return {
        completed: 0,
      };
    }

    state.sessions = state.sessions.filter((session) => !dueSessions.some((item) => item.id === session.id));
    dueSessions.forEach((session) => {
      recordRating(state, session, 5, 'default_timeout', '');
    });
    state.updatedAt = new Date().toISOString();
    await writeFeedbackState(state);
    return {
      completed: dueSessions.length,
    };
  });
}
