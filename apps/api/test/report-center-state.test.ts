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
        type: 'static-page',
        description: 'legacy uploaded template',
        preferredLayoutVariant: 'research-brief',
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
  assert.equal(normalized.templates[0]?.preferredLayoutVariant, 'research-brief');
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
        preferredLayoutVariant: 'risk-brief',
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
  assert.equal(normalized.templates[0]?.preferredLayoutVariant, 'risk-brief');
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
        page: {
          summary: 'ok',
          datavizSlots: [
            {
              key: 'risk-clusters',
              title: '风险主题分布',
              purpose: '风险主题聚类',
              preferredChartType: 'horizontal-bar',
              placement: 'hero',
              evidenceFocus: '风险主题聚类',
              minItems: 2,
              maxItems: 8,
            },
          ],
          pageSpec: {
            layoutVariant: 'risk-brief',
            heroCardLabels: ['资料覆盖', '高风险主题'],
            heroDatavizSlotKeys: ['risk-clusters'],
            sections: [
              {
                title: '风险概览',
                purpose: 'Open with a clear conclusion.',
                completionMode: 'knowledge-plus-model',
                datavizSlotKeys: ['risk-clusters'],
              },
            ],
          },
        },
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
          planMustHaveModules: ['页面摘要', '核心风险', '应答建议'],
          planOptionalModules: ['风险矩阵'],
          planEvidencePriority: ['高风险主题', '核心风险'],
          planAudienceTone: 'client-facing',
          planRiskNotes: ['Do not finalize if risk sections lack evidence-backed details.'],
          planVisualMixTargets: [
            { moduleType: 'hero', minCount: 1, targetCount: 1, maxCount: 1 },
            { moduleType: 'chart', minCount: 1, targetCount: 1, maxCount: 1 },
          ],
          planDatavizSlots: [
            {
              key: 'risk-clusters',
              title: '风险主题分布',
              purpose: '风险主题聚类',
              preferredChartType: 'horizontal-bar',
              placement: 'hero',
              evidenceFocus: '风险主题聚类',
              minItems: 2,
              maxItems: 8,
            },
          ],
          planPageSpec: {
            layoutVariant: 'risk-brief',
            heroCardLabels: ['资料覆盖', '高风险主题'],
            heroDatavizSlotKeys: ['risk-clusters'],
            sections: [
              {
                title: '风险概览',
                purpose: 'Open with a clear conclusion.',
                completionMode: 'knowledge-plus-model',
                datavizSlotKeys: ['risk-clusters'],
              },
              {
                title: '资格风险',
                purpose: 'Highlight blocking risks.',
                completionMode: 'knowledge-first',
                datavizSlotKeys: [],
              },
            ],
          },
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
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planMustHaveModules, ['页面摘要', '核心风险', '应答建议']);
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planOptionalModules, ['风险矩阵']);
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planEvidencePriority, ['高风险主题', '核心风险']);
  assert.equal(normalized.outputs[0]?.dynamicSource?.planAudienceTone, 'client-facing');
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planRiskNotes, ['Do not finalize if risk sections lack evidence-backed details.']);
  assert.equal(normalized.outputs[0]?.dynamicSource?.planVisualMixTargets?.[1]?.moduleType, 'chart');
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planDatavizSlots, [
    {
      key: 'risk-clusters',
      title: '风险主题分布',
      purpose: '风险主题聚类',
      preferredChartType: 'horizontal-bar',
      placement: 'hero',
      sectionTitle: '',
      evidenceFocus: '风险主题聚类',
      minItems: 2,
      maxItems: 8,
    },
  ]);
  assert.deepEqual(normalized.outputs[0]?.dynamicSource?.planPageSpec, {
    layoutVariant: 'risk-brief',
    heroCardLabels: ['资料覆盖', '高风险主题'],
    heroDatavizSlotKeys: ['risk-clusters'],
    sections: [
      {
        title: '风险概览',
        purpose: 'Open with a clear conclusion.',
        completionMode: 'knowledge-plus-model',
        displayMode: 'summary',
        datavizSlotKeys: ['risk-clusters'],
      },
      {
        title: '资格风险',
        purpose: 'Highlight blocking risks.',
        completionMode: 'knowledge-first',
        displayMode: 'insight-list',
        datavizSlotKeys: [],
      },
    ],
  });
  assert.deepEqual(normalized.outputs[0]?.page?.datavizSlots, [
    {
      key: 'risk-clusters',
      title: '风险主题分布',
      purpose: '风险主题聚类',
      preferredChartType: 'horizontal-bar',
      placement: 'hero',
      sectionTitle: '',
      evidenceFocus: '风险主题聚类',
      minItems: 2,
      maxItems: 8,
    },
  ]);
  assert.deepEqual(normalized.outputs[0]?.page?.pageSpec, {
    layoutVariant: 'risk-brief',
    heroCardLabels: ['资料覆盖', '高风险主题'],
    heroDatavizSlotKeys: ['risk-clusters'],
    sections: [
      {
        title: '风险概览',
        purpose: 'Open with a clear conclusion.',
        completionMode: 'knowledge-plus-model',
        displayMode: 'summary',
        datavizSlotKeys: ['risk-clusters'],
      },
    ],
  });
});

test('normalizePersistedReportState should preserve draft history entries', () => {
  const normalized = normalizePersistedReportState({
    version: REPORT_STATE_VERSION,
    outputs: [
      {
        id: 'output-draft-history-1',
        groupKey: 'resume',
        groupLabel: 'resume',
        title: '草稿历史页',
        outputType: 'page',
        kind: 'page',
        summary: 'ok',
        draft: {
          reviewStatus: 'draft_reviewing',
          version: 3,
          modules: [
            {
              moduleId: 'm-1',
              moduleType: 'summary',
              title: '摘要',
              purpose: '概览',
              contentDraft: '当前草稿正文',
              evidenceRefs: [],
              cards: [],
              bullets: [],
              enabled: true,
              status: 'edited',
              order: 0,
              layoutType: 'summary',
            },
          ],
          history: [
            {
              id: 'hist-1',
              action: 'saved',
              label: '保存草稿',
              detail: '当前共 1 个模块。',
              createdAt: '2026-04-13T10:00:00.000Z',
            },
          ],
        },
      },
    ],
  });

  assert.equal(normalized.outputs[0]?.draft?.history?.[0]?.action, 'saved');
  assert.equal(normalized.outputs[0]?.draft?.history?.[0]?.label, '保存草稿');
  assert.equal(normalized.outputs[0]?.draft?.history?.[0]?.detail, '当前共 1 个模块。');
});

test('normalizePersistedReportState should preserve draft workflow metadata for page outputs', () => {
  const normalized = normalizePersistedReportState({
    version: REPORT_STATE_VERSION,
    outputs: [
      {
        id: 'output-draft-1',
        groupKey: 'bids',
        groupLabel: 'bids',
        title: '草稿静态页',
        outputType: 'page',
        kind: 'page',
        status: 'draft_reviewing',
        summary: 'draft summary',
        page: {
          summary: '经营总览',
          visualStyle: 'signal-board',
          sections: [
            { title: '经营概览', body: '收入稳定。', bullets: ['转化率提升'] },
          ],
        },
        draft: {
          reviewStatus: 'draft_reviewing',
          version: 3,
          lastEditedAt: '2026-04-13T08:00:00.000Z',
          visualStyle: 'signal-board',
          visualMixTargets: [
            { moduleType: 'hero', minCount: 1, targetCount: 1, maxCount: 1 },
            { moduleType: 'chart', minCount: 1, targetCount: 1, maxCount: 2 },
          ],
          modules: [
            {
              moduleId: 'hero-1',
              moduleType: 'hero',
              title: '经营总览',
              purpose: '开场摘要',
              contentDraft: '收入稳定。',
              enabled: true,
              status: 'edited',
              order: 0,
            },
            {
              moduleId: 'summary-1',
              moduleType: 'summary',
              title: '经营概览',
              purpose: '解释重点变化',
              contentDraft: '转化率提升。',
              bullets: ['转化率提升'],
              enabled: true,
              status: 'edited',
              order: 1,
            },
          ],
        },
      },
    ],
  });

  assert.equal(normalized.outputs[0]?.status, 'draft_reviewing');
  assert.equal(normalized.outputs[0]?.draft?.reviewStatus, 'draft_reviewing');
  assert.equal(normalized.outputs[0]?.draft?.version, 3);
  assert.equal(normalized.outputs[0]?.draft?.visualStyle, 'signal-board');
  assert.equal(normalized.outputs[0]?.draft?.readiness, 'needs_attention');
  assert.ok((normalized.outputs[0]?.draft?.qualityChecklist || []).length >= 3);
  assert.equal(normalized.outputs[0]?.draft?.visualMixTargets?.[1]?.moduleType, 'chart');
  assert.equal(normalized.outputs[0]?.page?.visualStyle, 'signal-board');
  assert.equal(normalized.outputs[0]?.draft?.modules?.length, 2);
  assert.equal(normalized.outputs[0]?.draft?.modules?.[1]?.title, '经营概览');
});
