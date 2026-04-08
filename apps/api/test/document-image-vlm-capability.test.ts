import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readDocumentImageVlmCapability,
  resolveDocumentImageParseMode,
  resolveDocumentImageVlmProviderMode,
} from '../src/lib/document-image-vlm-capability.js';

test('resolveDocumentImageVlmProviderMode should normalize supported values', () => {
  assert.equal(resolveDocumentImageVlmProviderMode('disabled'), 'disabled');
  assert.equal(resolveDocumentImageVlmProviderMode('OPENCLAW-SKILL'), 'openclaw-skill');
  assert.equal(resolveDocumentImageVlmProviderMode(''), 'openclaw-skill');
});

test('resolveDocumentImageParseMode should default to ocr-plus-vlm', () => {
  assert.equal(resolveDocumentImageParseMode('ocr-only'), 'ocr-only');
  assert.equal(resolveDocumentImageParseMode('disabled'), 'ocr-only');
  assert.equal(resolveDocumentImageParseMode(''), 'ocr-plus-vlm');
});

test('readDocumentImageVlmCapability should report gateway-not-configured by default', () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const previousMode = process.env.DOCUMENT_IMAGE_PARSE_MODE;

  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.DOCUMENT_IMAGE_PARSE_MODE;

  try {
    const capability = readDocumentImageVlmCapability();
    assert.equal(capability.available, false);
    assert.equal(capability.reason, 'gateway-not-configured');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
    if (previousMode === undefined) delete process.env.DOCUMENT_IMAGE_PARSE_MODE;
    else process.env.DOCUMENT_IMAGE_PARSE_MODE = previousMode;
  }
});

test('readDocumentImageVlmCapability should report available when local gateway and tool are configured', () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  const previousTool = process.env.DOCUMENT_IMAGE_VLM_TOOL;

  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:3101';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;
  process.env.DOCUMENT_IMAGE_VLM_TOOL = 'image';

  try {
    const capability = readDocumentImageVlmCapability();
    assert.equal(capability.available, true);
    assert.equal(capability.reason, 'ready');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
    if (previousTool === undefined) delete process.env.DOCUMENT_IMAGE_VLM_TOOL;
    else process.env.DOCUMENT_IMAGE_VLM_TOOL = previousTool;
  }
});
