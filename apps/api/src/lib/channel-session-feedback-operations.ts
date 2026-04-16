import type {
  ChannelFeedbackSession,
  ChannelSessionFeedbackContext,
} from './channel-session-feedback-types.js';
import {
  buildSessionId,
  buildTimestamp,
  parseStarRating,
  recordRating,
  truncateAnswerExcerpt,
} from './channel-session-feedback-support.js';
import {
  DEFAULT_AUTO_FIVE_STAR_MINUTES,
  DEFAULT_IDLE_MINUTES,
  readFeedbackState,
  writeFeedbackState,
} from './channel-session-feedback-storage.js';

let mutationQueue: Promise<void> = Promise.resolve();

async function mutateFeedbackState<T>(mutator: (state: Awaited<ReturnType<typeof readFeedbackState>>) => Promise<T>) {
  let result!: T;
  const run = mutationQueue.then(async () => {
    const state = await readFeedbackState();
    result = await mutator(state);
  });
  mutationQueue = run.then(() => undefined, () => undefined);
  await run;
  return result;
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
