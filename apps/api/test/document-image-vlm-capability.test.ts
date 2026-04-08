import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDocumentImageVlmCapability,
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

test('loadDocumentImageVlmCapability should report gateway-unreachable when gateway health probe fails', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const capability = await loadDocumentImageVlmCapability({
      gatewayReachable: async () => false,
      readImageModelId: async () => '',
      loadModelState: async () => ({
        openclaw: { installed: true, running: true, installMode: 'wsl', installedVersion: '', gatewayUrl: '', needsInstall: false, usesDevBridge: true },
        currentModel: { id: 'github-copilot/gpt-5.4', label: 'gpt-5.4', provider: 'GitHub Copilot', source: 'project' },
        availableModels: [],
        providers: [],
      }),
    });
    assert.equal(capability.available, false);
    assert.equal(capability.reason, 'gateway-unreachable');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

test('loadDocumentImageVlmCapability should require a configured minimax provider', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const capability = await loadDocumentImageVlmCapability({
      gatewayReachable: async () => true,
      readImageModelId: async () => '',
      loadModelState: async () => ({
        openclaw: { installed: true, running: true, installMode: 'wsl', installedVersion: '', gatewayUrl: '', needsInstall: false, usesDevBridge: true },
        currentModel: { id: 'github-copilot/gpt-5.4', label: 'gpt-5.4', provider: 'GitHub Copilot', source: 'project' },
        availableModels: [
          { id: 'github-copilot/gpt-5.4', label: 'gpt-5.4', provider: 'GitHub Copilot', familyId: 'github-copilot', source: 'openclaw', configured: true },
        ],
        providers: [
          { id: 'github-copilot', label: 'GitHub Copilot', description: '', configured: true, configuredMethodId: 'device', statusText: '已配置', models: [], methods: [] },
        ],
      }),
    });
    assert.equal(capability.available, false);
    assert.equal(capability.reason, 'minimax-not-configured');
    assert.equal(capability.currentModelId, 'github-copilot/gpt-5.4');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

test('loadDocumentImageVlmCapability should report ready when minimax is configured and gateway is reachable', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const capability = await loadDocumentImageVlmCapability({
      gatewayReachable: async () => true,
      readImageModelId: async () => 'MiniMax-VL-01',
      loadModelState: async () => ({
        openclaw: { installed: true, running: true, installMode: 'wsl', installedVersion: '', gatewayUrl: '', needsInstall: false, usesDevBridge: true },
        currentModel: { id: 'github-copilot/gpt-5.4', label: 'gpt-5.4', provider: 'GitHub Copilot', source: 'project' },
        availableModels: [
          { id: 'github-copilot/gpt-5.4', label: 'gpt-5.4', provider: 'GitHub Copilot', familyId: 'github-copilot', source: 'openclaw', configured: true },
          { id: 'minimax-cn/MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed（CN）', provider: 'MiniMax', familyId: 'minimax', source: 'openclaw', configured: true },
        ],
        providers: [
          { id: 'minimax', label: 'MiniMax', description: '', configured: true, configuredMethodId: 'api-cn', statusText: '已配置', models: [], methods: [] },
        ],
      }),
    });
    assert.equal(capability.available, true);
    assert.equal(capability.reason, 'ready');
    assert.equal(capability.minimaxConfigured, true);
    assert.equal(capability.currentModelId, 'github-copilot/gpt-5.4');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

test('loadDocumentImageVlmCapability should fall back to runtime gateway info when env is not injected', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  delete process.env.OPENCLAW_GATEWAY_URL;
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const capability = await loadDocumentImageVlmCapability({
      gatewayReachable: async () => false,
      readImageModelId: async () => 'MiniMax-VL-01',
      loadModelState: async () => ({
        openclaw: {
          installed: true,
          running: true,
          installMode: 'wsl',
          installedVersion: 'OpenClaw 2026.4.2',
          gatewayUrl: 'http://127.0.0.1:18789',
          needsInstall: false,
          usesDevBridge: true,
        },
        currentModel: { id: 'github-copilot/gpt-5.4', label: 'gpt-5.4', provider: 'GitHub Copilot', source: 'project' },
        availableModels: [
          { id: 'minimax-cn/MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed（CN）', provider: 'MiniMax', familyId: 'minimax', source: 'openclaw', configured: true },
        ],
        providers: [
          { id: 'minimax', label: 'MiniMax', description: '', configured: true, configuredMethodId: 'api-cn', statusText: '已配置', models: [], methods: [] },
        ],
      }),
    });
    assert.equal(capability.available, true);
    assert.equal(capability.reason, 'ready');
    assert.equal(capability.gatewayUrl, 'http://127.0.0.1:18789');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});

test('loadDocumentImageVlmCapability should require an image-capable minimax model', async () => {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const previousToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  process.env.OPENCLAW_GATEWAY_URL = 'http://127.0.0.1:18789';
  delete process.env.OPENCLAW_GATEWAY_TOKEN;

  try {
    const capability = await loadDocumentImageVlmCapability({
      gatewayReachable: async () => true,
      readImageModelId: async () => '',
      loadModelState: async () => ({
        openclaw: { installed: true, running: true, installMode: 'wsl', installedVersion: '', gatewayUrl: '', needsInstall: false, usesDevBridge: true },
        currentModel: { id: 'github-copilot/gpt-5.4', label: 'gpt-5.4', provider: 'GitHub Copilot', source: 'project' },
        availableModels: [
          { id: 'minimax-cn/MiniMax-M2.5-highspeed', label: 'MiniMax M2.5 Highspeed（CN）', provider: 'MiniMax', familyId: 'minimax', source: 'openclaw', configured: true },
        ],
        providers: [
          { id: 'minimax', label: 'MiniMax', description: '', configured: true, configuredMethodId: 'api-cn', statusText: '已配置', models: [], methods: [] },
        ],
      }),
    });
    assert.equal(capability.available, false);
    assert.equal(capability.reason, 'image-model-missing');
  } finally {
    if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
    else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    if (previousToken === undefined) delete process.env.OPENCLAW_GATEWAY_TOKEN;
    else process.env.OPENCLAW_GATEWAY_TOKEN = previousToken;
  }
});
