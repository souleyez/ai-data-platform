import type { ReportTemplateEnvelope } from './report-center.js';
import {
  formatFootfallValue,
  type FootfallDeps,
  type FootfallPageStats,
} from './knowledge-output-footfall-support.js';

export function buildFootfallPageTitle(
  envelope: ReportTemplateEnvelope | null | undefined,
  deps: Pick<FootfallDeps, 'sanitizeText'>,
) {
  return deps.sanitizeText(envelope?.title) || '商场客流分区驾驶舱';
}

export function buildFootfallPageSummary(stats: FootfallPageStats) {
  const topZones = stats.mallZoneBreakdown
    .slice(0, 3)
    .map((entry) => `${entry.label} ${formatFootfallValue(entry.value)}`)
    .join('、');
  const lead = topZones
    ? `当前客流重心主要集中在 ${topZones}。`
    : '当前已识别到商场客流资料，但分区贡献仍需继续积累。';
  return [
    `本次共汇总 ${stats.documentCount} 份客流资料，累计识别 ${formatFootfallValue(stats.totalFootfall)}。`,
    lead,
    '报表已统一按商场分区汇总，楼层分区和单间明细不单独展开。',
  ].join('');
}

export function buildFootfallPageCards(stats: FootfallPageStats) {
  const topZone = stats.mallZoneBreakdown[0];
  return [
    { label: '总客流', value: formatFootfallValue(stats.totalFootfall), note: '已按商场分区汇总' },
    { label: '商场分区数', value: `${Math.max(stats.mallZoneBreakdown.length, 1)} 个`, note: '只展示商场分区口径' },
    {
      label: '头部分区',
      value: topZone ? `${topZone.label}` : '待补充',
      note: topZone ? formatFootfallValue(topZone.value) : '暂无稳定分区',
    },
    { label: '展示口径', value: '商场分区', note: '楼层与单间明细已折叠' },
  ];
}

export function buildFootfallPageSections(
  summary: string,
  stats: FootfallPageStats,
  envelope: ReportTemplateEnvelope | null | undefined,
) {
  const sectionTitles = envelope?.pageSections?.length
    ? envelope.pageSections
    : ['客流总览', '商场分区贡献', '高客流分区', '低效分区提醒', '口径说明', 'AI综合分析'];
  const topZoneBullets = stats.mallZoneBreakdown
    .slice(0, 5)
    .map((entry) => `${entry.label}：${formatFootfallValue(entry.value)}`);
  const lowZoneBullets = stats.lowZoneHighlights.length
    ? stats.lowZoneHighlights
    : ['当前低位分区样本仍有限，建议持续按商场分区追踪波动。'];
  const blueprints = [
    {
      body: summary,
      bullets: stats.supportingLines.slice(0, 3),
    },
    {
      body: topZoneBullets.length
        ? '当前展示层统一落在商场分区，不继续展开楼层或单间。先看分区贡献，再决定需要深挖的具体点位。'
        : '当前分区贡献仍在补齐中，建议继续累积同口径链接。',
      bullets: topZoneBullets,
    },
    {
      body: topZoneBullets[0]
        ? `高客流焦点当前主要落在 ${stats.mallZoneBreakdown[0]?.label}${stats.mallZoneBreakdown[1] ? `，以及 ${stats.mallZoneBreakdown[1]?.label}` : ''}。`
        : '高客流分区尚未形成稳定排序。',
      bullets: topZoneBullets.slice(0, 3),
    },
    {
      body: '低位分区更适合做经营提醒而不是明细堆砌，保持在商场分区口径即可。',
      bullets: lowZoneBullets,
    },
    {
      body: '本页统一按商场分区汇总客流；楼层分区和单间数据只参与聚合，不在展示层逐条展开。',
      bullets: [
        '适合直接给商场运营、招商或现场团队看整体分区热度',
        '需要深挖时再回到明细，不把展示层拉回到点位级列表',
      ],
    },
    {
      body: 'AI 综合分析保持克制：先看客流是否持续集中到少数商场分区，再决定活动、导流或点位优化动作，不补写无证据的经营结论。',
      bullets: [
        '优先围绕高客流分区安排活动承接和资源配置',
        '低位分区只做提醒，不把页面退回到明细表展示',
      ],
    },
  ];

  return sectionTitles.map((title, index) => ({
    title,
    body: blueprints[index]?.body || (index === 0 ? summary : ''),
    bullets: blueprints[index]?.bullets || [],
  }));
}

export function buildFootfallPageCharts(stats: FootfallPageStats) {
  const topItems = stats.mallZoneBreakdown.slice(0, 6).map((entry) => ({ label: entry.label, value: entry.value }));
  return [
    { title: '商场分区客流贡献', items: topItems },
    { title: '商场分区客流梯队', items: topItems },
  ].filter((item) => item.items.length);
}
