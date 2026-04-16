import type {
  ChannelFeedbackEvent,
  ChannelFeedbackSession,
  ChannelSessionFeedbackContext,
  ChannelSessionFeedbackState,
  ChannelSessionFeedbackStatus,
} from './channel-session-feedback-types.js';

export const MAX_FEEDBACK_EVENTS = 500;

export function buildTimestamp(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000).toISOString();
}

export function buildSessionId(input: ChannelSessionFeedbackContext) {
  return [
    input.channel,
    input.botId,
    input.recipientId,
    String(input.senderId || ''),
  ].join(':');
}

export function buildFeedbackEventId() {
  return `channel-feedback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function truncateAnswerExcerpt(value: string) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function normalizeRatingText(value: string) {
  return String(value || '').trim();
}

export function parseStarRating(value: string) {
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

export function normalizeSessionStatus(value: unknown): ChannelSessionFeedbackStatus {
  return value === 'prompted' ? 'prompted' : 'idle';
}

export function createEmptyFeedbackState(): ChannelSessionFeedbackState {
  return {
    updatedAt: new Date().toISOString(),
    sessions: [],
    ratings: [],
  };
}

export function recordRating(
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
