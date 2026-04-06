import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function importFresh<T>(specifier: string): Promise<T> {
  return import(`${specifier}?t=${Date.now()}-${Math.random()}`) as Promise<T>;
}

test('channel session feedback should prompt due sessions and record text ratings', async () => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-feedback-'));
  process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
  process.env.CHANNEL_FEEDBACK_IDLE_MINUTES = '0';
  process.env.CHANNEL_FEEDBACK_AUTO_FIVE_MINUTES = '0';

  try {
    const feedbackModule = await importFresh<typeof import('../src/lib/channel-session-feedback.js')>(
      '../src/lib/channel-session-feedback.js',
    );

    await feedbackModule.noteThirdPartyAssistantReply({
      channel: 'wecom',
      botId: 'wecom-assistant',
      botName: '企业微信助手',
      externalBotId: 'external-bot',
      routeKey: 'corp-default',
      tenantId: 'corp',
      sessionUser: 'wecom:user-1',
      recipientId: 'user-1',
      senderId: 'user-1',
      senderName: '张三',
      answerContent: '这是刚才的回答内容。',
    });

    const due = await feedbackModule.listDueThirdPartyFeedbackPrompts();
    assert.equal(due.length, 1);
    assert.equal(due[0]?.botId, 'wecom-assistant');

    await feedbackModule.markThirdPartyFeedbackPromptSent(due[0].id);
    const handled = await feedbackModule.handleThirdPartyInboundFeedback({
      channel: 'wecom',
      botId: 'wecom-assistant',
      sessionUser: 'wecom:user-1',
      recipientId: 'user-1',
      senderId: 'user-1',
      senderName: '张三',
      prompt: '4',
    });

    assert.equal(handled.handled, true);
    assert.match(handled.acknowledged, /4 星/);

    const state = await feedbackModule.loadChannelSessionFeedbackState();
    assert.equal(state.sessions.length, 0);
    assert.equal(state.ratings[0]?.rating, 4);
    assert.equal(state.ratings[0]?.source, 'user_text');
  } finally {
    await fs.rm(storageRoot, { recursive: true, force: true });
  }
});

test('channel session feedback should default to five stars when prompted session is skipped by a new message', async () => {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-channel-feedback-'));
  process.env.AI_DATA_PLATFORM_STORAGE_ROOT = storageRoot;
  process.env.CHANNEL_FEEDBACK_IDLE_MINUTES = '0';
  process.env.CHANNEL_FEEDBACK_AUTO_FIVE_MINUTES = '0';

  try {
    const feedbackModule = await importFresh<typeof import('../src/lib/channel-session-feedback.js')>(
      '../src/lib/channel-session-feedback.js',
    );

    await feedbackModule.noteThirdPartyAssistantReply({
      channel: 'wecom',
      botId: 'wecom-assistant',
      botName: '企业微信助手',
      externalBotId: 'external-bot',
      routeKey: 'corp-default',
      tenantId: 'corp',
      sessionUser: 'wecom:user-2',
      recipientId: 'user-2',
      senderId: 'user-2',
      senderName: '李四',
      answerContent: '这是第二条回答。',
    });

    const due = await feedbackModule.listDueThirdPartyFeedbackPrompts();
    assert.equal(due.length, 1);
    await feedbackModule.markThirdPartyFeedbackPromptSent(due[0].id);

    const skipped = await feedbackModule.handleThirdPartyInboundFeedback({
      channel: 'wecom',
      botId: 'wecom-assistant',
      sessionUser: 'wecom:user-2',
      recipientId: 'user-2',
      senderId: 'user-2',
      senderName: '李四',
      prompt: '帮我再查一下合同状态',
    });

    assert.equal(skipped.handled, false);
    assert.equal(skipped.defaultedExistingSession, true);

    const state = await feedbackModule.loadChannelSessionFeedbackState();
    assert.equal(state.sessions.length, 0);
    assert.equal(state.ratings[0]?.rating, 5);
    assert.equal(state.ratings[0]?.source, 'default_next_message');
  } finally {
    await fs.rm(storageRoot, { recursive: true, force: true });
  }
});
