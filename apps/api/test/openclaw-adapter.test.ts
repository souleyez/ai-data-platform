import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGatewayRequestModel,
  isRetryableCloudGatewayError,
  looksLikeLeakedToolCallContent,
  resolveOpenClawModelOverride,
} from '../src/lib/openclaw-adapter.js';

test('buildGatewayRequestModel should always emit OpenClaw-scoped gateway model ids', () => {
  assert.equal(buildGatewayRequestModel('main'), 'openclaw');
  assert.equal(buildGatewayRequestModel(''), 'openclaw');
  assert.equal(buildGatewayRequestModel('planner'), 'openclaw/planner');
});

test('resolveOpenClawModelOverride should normalize explicit provider/model overrides', () => {
  assert.equal(resolveOpenClawModelOverride(' minimax/MiniMax-VL-01 '), 'minimax/MiniMax-VL-01');
  assert.equal(resolveOpenClawModelOverride(''), '');
});

test('isRetryableCloudGatewayError should treat provider 500 and 520 failures as retryable', () => {
  assert.equal(
    isRetryableCloudGatewayError(new Error('Cloud gateway request failed (500): {"type":"error","error":{"type":"server_error","message":"unknown error, 520 (1000)"}}')),
    true,
  );
  assert.equal(
    isRetryableCloudGatewayError(new Error('Cloud gateway request failed (502): upstream connect error or disconnect/reset before headers')),
    true,
  );
  assert.equal(
    isRetryableCloudGatewayError(new Error('OpenResponses request failed (503): upstream temporarily unavailable')),
    true,
  );
});

test('isRetryableCloudGatewayError should not retry prompt or auth errors', () => {
  assert.equal(
    isRetryableCloudGatewayError(new Error('Cloud gateway request failed (400): {"error":"bad request"}')),
    false,
  );
  assert.equal(
    isRetryableCloudGatewayError(new Error('Cloud gateway request failed (401): {"error":"unauthorized"}')),
    false,
  );
});

test('looksLikeLeakedToolCallContent should detect leaked tool markup and ignore normal answers', () => {
  assert.equal(
    looksLikeLeakedToolCallContent('<tool_call><invoke name="Bash"><parameter name="command">pnpm system:control -- documents list</parameter></invoke></tool_call>'),
    true,
  );
  assert.equal(
    looksLikeLeakedToolCallContent('我来根据招标文件先提炼要点，再输出一份投标草稿。'),
    false,
  );
});
