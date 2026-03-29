import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPORT_STATE_VERSION,
  normalizePersistedReportState,
} from '../src/lib/report-center.js';

test('normalizePersistedReportState should migrate legacy state into the current schema', () => {
  const normalized = normalizePersistedReportState({
    groups: [
      {
        key: 'resume',
        label: 'Resume',
        description: 'legacy group',
        triggerKeywords: ['resume', '', null],
        defaultTemplateKey: 'resume-table-template',
        templates: [
          {
            key: 'resume-table-template',
            label: 'Resume Table',
            type: 'table',
            supported: true,
          },
        ],
      },
    ],
    templates: [
      {
        key: 'template-user-file',
        label: 'User Template',
        type: 'document',
        description: 'legacy uploaded template',
        referenceImages: [
          {
            id: 'tmplref-file',
            originalName: 'resume-template.docx',
            uploadedAt: '2026-03-29T00:00:00.000Z',
            relativePath: 'storage/files/report-references/tmplref-file.docx',
          },
        ],
      },
    ],
    outputs: [
      {
        id: 'output-1',
        groupLabel: 'resume',
        templateLabel: 'User Template',
        title: 'legacy report output',
        outputType: 'page',
        summary: 'legacy summary',
        triggerSource: 'chat',
      },
    ],
  });

  assert.equal(normalized.version, REPORT_STATE_VERSION);
  assert.equal(normalized.groups.length, 1);
  assert.deepEqual(normalized.groups[0]?.triggerKeywords, ['resume']);
  assert.equal(normalized.templates[0]?.origin, 'user');
  assert.equal(normalized.outputs[0]?.groupKey, 'resume');
  assert.equal(normalized.outputs[0]?.status, 'ready');
});

test('normalizePersistedReportState should drop invalid records and keep supported entries', () => {
  const normalized = normalizePersistedReportState({
    version: 99,
    groups: [
      null,
      { label: 'missing-key' },
      { key: 'bids', label: 'bids', triggerKeywords: ['bid', '', null] },
    ],
    templates: [
      { key: '', label: 'invalid-template' },
      {
        key: 'shared-static-page-default',
        label: 'System Page Template',
        type: 'static-page',
        origin: 'system',
        referenceImages: [
          {
            id: 'tmplref-link',
            originalName: 'system link',
            uploadedAt: '2026-03-29T00:00:00.000Z',
            relativePath: '',
            kind: 'link',
            url: 'https://example.com/report-template',
          },
        ],
      },
    ],
    outputs: [
      { id: '', groupKey: 'bids' },
      { id: 'output-2', groupKey: 'bids', groupLabel: 'bids', title: 'valid output', outputType: 'page', summary: 'ok' },
    ],
  });

  assert.equal(normalized.version, REPORT_STATE_VERSION);
  assert.equal(normalized.groups.length, 1);
  assert.deepEqual(normalized.groups[0]?.triggerKeywords, ['bid']);
  assert.equal(normalized.templates.length, 1);
  assert.equal(normalized.templates[0]?.origin, 'system');
  assert.equal(normalized.outputs.length, 1);
  assert.equal(normalized.outputs[0]?.groupKey, 'bids');
});

test('normalizePersistedReportState should preserve dynamic page planner metadata', () => {
  const normalized = normalizePersistedReportState({
    version: REPORT_STATE_VERSION,
    outputs: [
      {
        id: 'output-dynamic-1',
        groupKey: 'bids',
        groupLabel: 'bids',
        title: '动态标书页',
        outputType: 'page',
        kind: 'page',
        summary: 'ok',
        dynamicSource: {
          enabled: true,
          request: '按风险维度生成静态页',
          outputType: 'page',
          conceptMode: true,
          libraries: [{ key: 'bids', label: 'bids' }],
          sourceFingerprint: 'doc-a',
          planAudience: 'client',
          planObjective: 'Create a customer-ready bid analysis page.',
          planTemplateMode: 'concept-page',
          planSectionTitles: ['风险概览', '资格风险', 'AI综合分析'],
          planCardLabels: ['资料覆盖', '高风险主题'],
          planChartTitles: ['风险主题分布'],
          planUpdatedAt: '2026-03-29T10:00:00.000Z',
        },
      },
    ],
  });

  assert.equal(normalized.outputs[0]?.dynamicSource?.planAudience, 'client');
  assert.equal(normalized.outputs[0]?.dynamicSource?.planTemplateMode, 'concept-page');
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planSectionTitles, ['风险概览', '资格风险', 'AI综合分析']);
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planCardLabels, ['资料覆盖', '高风险主题']);
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planChartTitles, ['风险主题分布']);
});
