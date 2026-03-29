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
