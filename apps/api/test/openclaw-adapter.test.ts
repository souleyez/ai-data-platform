import test from 'node:test';
import assert from 'node:assert/strict';
import { isRetryableCloudGatewayError } from '../src/lib/openclaw-adapter.js';

test('isRetryableCloudGatewayError should treat provider 500 and 520 failures as retryable', () => {
  assert.equal(
    isRetryableCloudGatewayError(new Error('Cloud gateway request failed (500): {"type":"error","error":{"type":"server_error","message":"unknown error, 520 (1000)"}}')),
    true,
  );
  assert.equal(
    isRetryableCloudGatewayError(new Error('Cloud gateway request failed (502): upstream connect error or disconnect/reset before headers')),
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
