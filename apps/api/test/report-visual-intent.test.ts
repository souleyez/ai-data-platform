import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSupplementalVisualModule,
  inferPreferredChartType,
  inferSectionDisplayMode,
  inferSectionDisplayModeFromTitle,
  inferSectionModuleType,
} from '../src/lib/report-visual-intent.js';

test('inferSectionModuleType should classify timeline-like content as timeline', () => {
  const moduleType = inferSectionModuleType({
    title: '交付路径',
    body: '建议按阶段推进',
    bullets: ['阶段一：完成接入', '阶段二：上线试运行', '阶段三：正式交付'],
    fallbackModuleType: 'summary',
  });
  assert.equal(moduleType, 'timeline');
  assert.equal(inferSectionDisplayMode(moduleType), 'timeline');
});

test('buildSupplementalVisualModule should turn metric-like lines into metric grid', () => {
  const supplemental = buildSupplementalVisualModule({
    title: '关键指标',
    body: '',
    bullets: ['文档总量：45', 'Canonical 就绪：41', '动态报表：15'],
    fallbackModuleType: 'summary',
  });
  assert.ok(supplemental);
  assert.equal(supplemental?.moduleType, 'metric-grid');
  assert.equal(supplemental?.cards.length, 3);
});

test('buildSupplementalVisualModule should turn structured numeric comparison into chart', () => {
  const supplemental = buildSupplementalVisualModule({
    title: '渠道结构',
    body: '',
    bullets: ['天猫：52', '京东：31', '抖音：18'],
    fallbackModuleType: 'comparison',
  });
  assert.ok(supplemental);
  assert.equal(supplemental?.moduleType, 'chart');
  assert.equal(supplemental?.chartIntent.items.length, 3);
  assert.equal(inferPreferredChartType('渠道结构', supplemental?.chartIntent.items || []), 'horizontal-bar');
});

test('inferSectionDisplayModeFromTitle should prefer overview and path semantics over generic heuristics', () => {
  assert.equal(inferSectionDisplayModeFromTitle('风险概览'), 'summary');
  assert.equal(inferSectionDisplayModeFromTitle('商场动线提示'), 'timeline');
});
