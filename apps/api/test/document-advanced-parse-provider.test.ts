import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocumentAdvancedParseSystemPrompt,
  getDocumentAdvancedParseProvider,
  getDocumentAdvancedParseProviderMode,
  resolveDocumentAdvancedParseProviderMode,
  runDocumentAdvancedParse,
} from '../src/lib/document-advanced-parse-provider.js';

test('resolveDocumentAdvancedParseProviderMode should normalize supported values', () => {
  assert.equal(resolveDocumentAdvancedParseProviderMode('disabled'), 'disabled');
  assert.equal(resolveDocumentAdvancedParseProviderMode('openclaw-skill'), 'openclaw-skill');
  assert.equal(resolveDocumentAdvancedParseProviderMode('OPENCLAW-CHAT'), 'openclaw-chat');
  assert.equal(resolveDocumentAdvancedParseProviderMode(''), 'openclaw-chat');
});

test('getDocumentAdvancedParseProviderMode should default to openclaw-chat', () => {
  const previous = process.env.DOCUMENT_DEEP_PARSE_PROVIDER;
  delete process.env.DOCUMENT_DEEP_PARSE_PROVIDER;

  try {
    assert.equal(getDocumentAdvancedParseProviderMode(), 'openclaw-chat');
  } finally {
    if (previous === undefined) delete process.env.DOCUMENT_DEEP_PARSE_PROVIDER;
    else process.env.DOCUMENT_DEEP_PARSE_PROVIDER = previous;
  }
});

test('disabled provider should return null without touching external services', async () => {
  const provider = getDocumentAdvancedParseProvider('disabled');
  const result = await provider.run({ prompt: 'any prompt' });
  assert.equal(result, null);
});

test('buildDocumentAdvancedParseSystemPrompt should include workspace skill contract for openclaw-skill mode', async () => {
  const chatPrompt = await buildDocumentAdvancedParseSystemPrompt('openclaw-chat');
  const skillPrompt = await buildDocumentAdvancedParseSystemPrompt('openclaw-skill');

  assert.match(chatPrompt, /document-structuring assistant/i);
  assert.match(chatPrompt, /resumeFields/);
  assert.doesNotMatch(chatPrompt, /Workspace skill: document-deep-parse/);
  assert.match(skillPrompt, /Workspace skill: document-deep-parse/);
  assert.match(skillPrompt, /Document Deep Parse/);
  assert.match(skillPrompt, /Output Schema/);
  assert.match(skillPrompt, /resumeFields/);
});

test('openclaw-skill provider should stay project-side and return null when gateway is not configured', async () => {
  const provider = getDocumentAdvancedParseProvider('openclaw-skill');
  assert.equal(provider.mode, 'openclaw-skill');
  const result = await provider.run({ prompt: 'skill prompt' });
  assert.equal(result, null);
});

test('runDocumentAdvancedParse should honor explicit provider overrides', async () => {
  const disabled = await runDocumentAdvancedParse({ prompt: 'disabled prompt' }, { mode: 'disabled' });
  const skill = await runDocumentAdvancedParse({ prompt: 'skill prompt' }, { mode: 'openclaw-skill' });

  assert.equal(disabled, null);
  assert.equal(skill, null);
});

test('openclaw-chat provider should return null when gateway is not configured', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const result = await runDocumentAdvancedParse({ prompt: 'missing gateway prompt' }, { mode: 'openclaw-chat' });
    assert.equal(result, null);
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;

    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
