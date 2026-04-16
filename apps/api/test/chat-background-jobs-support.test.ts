import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBackgroundJobRequest } from '../src/lib/chat-background-jobs-support.js';

test('normalizeBackgroundJobRequest should map legacy template output action to dataset static page', () => {
  const request = normalizeBackgroundJobRequest({
    prompt: '请基于合同库输出一个合同风险 PPT',
    confirmedAction: 'template_output',
  });

  assert.equal(request.confirmedAction, 'dataset_static_page');
});

test('normalizeBackgroundJobRequest should preserve dataset static page action', () => {
  const request = normalizeBackgroundJobRequest({
    prompt: '请基于合同数据集输出静态页',
    confirmedAction: 'dataset_static_page',
  });

  assert.equal(request.confirmedAction, 'dataset_static_page');
});
