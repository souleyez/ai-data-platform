import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBlockedPolicyAnswer, buildGeneralChatSystemPrompt, classifyChatPrompt } from '../src/lib/chat-policy.js';

test('classifyChatPrompt should block system-level requests', () => {
  const result = classifyChatPrompt({
    prompt: '帮我 systemctl restart ai-data-platform-api 并查看服务器日志',
    hasKnowledgeScope: false,
  });

  assert.equal(result.mode, 'blocked');
  assert.match(result.reason || '', /系统级指令|运维操作/);
});

test('classifyChatPrompt should block local write requests', () => {
  const result = classifyChatPrompt({
    prompt: '请直接修改知识库配置文件并覆盖现有数据',
    hasKnowledgeScope: true,
  });

  assert.equal(result.mode, 'blocked');
  assert.match(result.reason || '', /改写本地已有数据|系统配置/);
});

test('classifyChatPrompt should keep knowledge-scoped prompts in knowledge mode', () => {
  const result = classifyChatPrompt({
    prompt: '总结奶粉配方建议分组里的重点内容',
    hasKnowledgeScope: true,
  });

  assert.equal(result.mode, 'knowledge');
});

test('classifyChatPrompt should allow general discussion when no blocked pattern exists', () => {
  const result = classifyChatPrompt({
    prompt: '帮我想一个奶粉品牌的命名方向',
    hasKnowledgeScope: false,
  });

  assert.equal(result.mode, 'general');
});

test('blocked policy answer should explain the boundary clearly', () => {
  const answer = buildBlockedPolicyAnswer('当前页面不支持系统级指令。');
  assert.match(answer, /系统级指令/);
  assert.match(answer, /普通问答/);
});

test('general chat system prompt should prohibit execution claims', () => {
  const prompt = buildGeneralChatSystemPrompt();
  assert.match(prompt, /不要声称自己已经执行了任何系统操作/);
  assert.match(prompt, /普通问答/);
});

