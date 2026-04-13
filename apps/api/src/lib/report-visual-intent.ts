import type { ReportDraftModuleType } from './report-center.js';
import type { ReportPlanDatavizSlot } from './report-planner.js';

type VisualSignalInput = {
  title?: string;
  body?: string;
  bullets?: string[];
  fallbackModuleType?: ReportDraftModuleType;
};

type MetricCard = { label?: string; value?: string; note?: string };
type ChartItem = { label?: string; value?: number };

export type SupplementalVisualModule =
  | {
      moduleType: 'metric-grid';
      title: string;
      purpose: string;
      cards: MetricCard[];
      layoutType: 'metric-grid';
    }
  | {
      moduleType: 'chart';
      title: string;
      purpose: string;
      chartIntent: {
        title: string;
        preferredChartType: ReportPlanDatavizSlot['preferredChartType'];
        items: ChartItem[];
      };
      layoutType: 'chart';
    };

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeLineList(body: string, bullets: string[]) {
  const lines = [
    ...bullets,
    ...String(body || '')
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ];
  return Array.from(new Set(lines));
}

function normalizeNumberString(value: string) {
  return value.replace(/[,%，\s]/g, '');
}

function parseNumericValue(value: string) {
  const normalized = normalizeNumberString(value);
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitLabelValue(line: string) {
  const trimmed = normalizeText(line);
  if (!trimmed) return null;
  const match = trimmed.match(/^(.{1,40}?)(?:[:：|]|-\s)(.{1,40})(?:\s*[|｜]\s*(.+))?$/);
  if (!match) return null;
  const [, rawLabel = '', rawValue = '', rawNote = ''] = match;
  return {
    label: normalizeText(rawLabel),
    value: normalizeText(rawValue),
    note: normalizeText(rawNote),
  };
}

function isTimelineLike(line: string) {
  const normalized = normalizeText(line).toLowerCase();
  return /(?:\bq[1-4]\b|\b20\d{2}\b|\b\d{1,2}月\b|\b\d{1,2}\/\d{1,2}\b|阶段|step|phase|里程碑|milestone|上线|交付|实施|周一|周二|周三|周四|周五|周六|周日)/.test(normalized);
}

export function inferSectionModuleType(input: VisualSignalInput): ReportDraftModuleType {
  const title = normalizeText(input.title).toLowerCase();
  const body = normalizeText(input.body).toLowerCase();
  const bullets = Array.isArray(input.bullets) ? input.bullets.map((item) => normalizeText(item).toLowerCase()) : [];
  const content = [title, body, ...bullets].filter(Boolean).join(' ');
  const lines = normalizeLineList(body, bullets);

  if (/时间线|timeline|里程碑|phase|roadmap|实施|交付|上线/.test(content) || lines.some(isTimelineLike)) return 'timeline';
  if (/行动|建议|下一步|next|recommend|call to action|联系|contact/.test(content)) return 'cta';
  if (/附录|证据|来源|appendix|evidence|reference/.test(content)) return 'appendix';
  if (/指标|kpi|metric|数据|score|达成|完成度/.test(content) && lines.some((line) => Boolean(splitLabelValue(line)))) {
    return 'metric-grid';
  }
  if (/风险|异常|波动|问题|亮点|发现|结论|risk|anomaly|alert|finding|highlight|insight/.test(content)) return 'insight-list';
  if (/对比|结构|分布|渠道|品类|comparison|mix|breakdown|portfolio|案例|模块|能力/.test(content)) return 'comparison';
  return input.fallbackModuleType || (bullets.length ? 'insight-list' : 'summary');
}

export function extractMetricCards(lines: string[]): MetricCard[] {
  return lines
    .map(splitLabelValue)
    .filter(Boolean)
    .map((entry) => ({
      label: entry?.label,
      value: entry?.value,
      note: entry?.note,
    }))
    .filter((entry) => entry.label || entry.value || entry.note);
}

export function extractChartItems(lines: string[]): ChartItem[] {
  return lines
    .map(splitLabelValue)
    .filter(Boolean)
    .map((entry) => {
      const parsed = parseNumericValue(entry?.value || '');
      return parsed === null
        ? null
        : {
            label: entry?.label,
            value: parsed,
          };
    })
    .filter(Boolean) as ChartItem[];
}

export function inferPreferredChartType(title: string, items: ChartItem[]): ReportPlanDatavizSlot['preferredChartType'] {
  const normalized = normalizeText(title).toLowerCase();
  if (/趋势|trend|timeline|time|周|月|季度/.test(normalized)) return 'line';
  if (/结构|分布|breakdown|mix|渠道|品类|portfolio/.test(normalized)) return 'horizontal-bar';
  return items.length > 5 ? 'horizontal-bar' : 'bar';
}

export function buildSupplementalVisualModule(input: VisualSignalInput): SupplementalVisualModule | null {
  const title = normalizeText(input.title) || '补充可视化';
  const body = normalizeText(input.body);
  const bullets = Array.isArray(input.bullets) ? input.bullets.filter(Boolean).map((item) => normalizeText(item)) : [];
  const lines = normalizeLineList(body, bullets);
  if (!lines.length) return null;

  const cards = extractMetricCards(lines);
  const chartItems = extractChartItems(lines);
  if (cards.length >= 2 && /(指标|metric|kpi|数据|score|达成|完成度)/i.test(`${title} ${body}`)) {
    return {
      moduleType: 'metric-grid',
      title: `${title} 指标`,
      purpose: 'Turn structured numeric statements into cards instead of paragraphs.',
      cards,
      layoutType: 'metric-grid',
    };
  }
  if (chartItems.length >= 2) {
    return {
      moduleType: 'chart',
      title: `${title} 图示`,
      purpose: 'Turn structured numeric statements into a direct visual chart.',
      chartIntent: {
        title: `${title} 图示`,
        preferredChartType: inferPreferredChartType(title, chartItems),
        items: chartItems,
      },
      layoutType: 'chart',
    };
  }
  return null;
}

export function inferSectionDisplayMode(moduleType: ReportDraftModuleType) {
  if (moduleType === 'timeline') return 'timeline';
  if (moduleType === 'comparison') return 'comparison';
  if (moduleType === 'cta') return 'cta';
  if (moduleType === 'appendix') return 'appendix';
  return moduleType === 'insight-list' ? 'insight-list' : 'summary';
}

export function inferSectionDisplayModeFromTitle(title: string, fallbackModuleType: ReportDraftModuleType = 'summary') {
  const normalized = normalizeText(title).toLowerCase();
  if (!normalized) return inferSectionDisplayMode(fallbackModuleType);
  if (/(概览|概况|摘要|总览|综述|overview|summary)/.test(normalized)) return 'summary';
  if (/(时间线|timeline|里程碑|phase|roadmap|实施|交付|上线|路径|动线)/.test(normalized)) return 'timeline';
  if (/(行动|建议|应答|下一步|next|recommend|call to action|联系|contact)/.test(normalized)) return 'cta';
  if (/(附录|证据|来源|appendix|evidence|reference)/.test(normalized)) return 'appendix';
  if (/(对比|结构|分布|comparison|mix|breakdown|能力模块|案例)/.test(normalized)) return 'comparison';
  if (/(风险|异常|波动|问题|亮点|发现|结论|risk|anomaly|alert|finding|highlight|insight)/.test(normalized)) return 'insight-list';
  return inferSectionDisplayMode(
    inferSectionModuleType({
      title,
      fallbackModuleType,
    }),
  );
}
