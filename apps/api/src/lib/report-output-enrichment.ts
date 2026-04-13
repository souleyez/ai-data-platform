import type { ReportOutputRecord } from './report-center.js';
import type { ReportPlanDatavizSlot } from './report-planner.js';

type ReportOutputEnrichmentDeps = {
  isOpenClawGatewayConfigured: () => boolean;
  runOpenClawChat: (input: { prompt: string; systemPrompt?: string }) => Promise<{ content: string }>;
  isNarrativeReportKind: (kind?: ReportOutputRecord['kind']) => boolean;
  attachDatavizRendersToPage: (
    page: NonNullable<ReportOutputRecord['page']>,
    input: { slots: ReportPlanDatavizSlot[] },
  ) => Promise<NonNullable<ReportOutputRecord['page']> | null>;
};

export function summarizeTableForAnalysis(table?: ReportOutputRecord['table']) {
  const columns = Array.isArray(table?.columns) ? table.columns : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const previewRows = rows.slice(0, 6).map((row) => row.map((cell) => String(cell ?? '')).join(' | '));
  return [
    columns.length ? `表头：${columns.join('、')}` : '',
    rows.length ? `数据行数：${rows.length}` : '',
    previewRows.length ? `样例数据：\n${previewRows.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export function summarizePageForAnalysis(page?: ReportOutputRecord['page']) {
  const cards = Array.isArray(page?.cards) ? page.cards : [];
  const sections = Array.isArray(page?.sections) ? page.sections : [];
  const charts = Array.isArray(page?.charts) ? page.charts : [];
  return [
    page?.summary ? `摘要：${page.summary}` : '',
    cards.length ? `指标卡片：${cards.map((item) => `${item.label || ''}${item.value ? `=${item.value}` : ''}`).join('；')}` : '',
    sections.length ? `分节：${sections.map((item) => item.title).filter(Boolean).join('、')}` : '',
    charts.length ? `图表：${charts.map((item) => item.title).filter(Boolean).join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildLocalReportAnalysis(record: {
  groupLabel: string;
  templateLabel: string;
  kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
  table?: ReportOutputRecord['table'];
  page?: ReportOutputRecord['page'];
  content?: string;
}) {
  if (record.kind && record.kind !== 'table') {
    const cards = record.page?.cards || [];
    const strongestCard = cards[0];
    return [
      `${record.groupLabel} 的当前输出已经按 ${record.templateLabel} 组织完成。`,
      strongestCard?.label && strongestCard?.value
        ? `当前最值得优先关注的是 ${strongestCard.label}，样例值为 ${strongestCard.value}。`
        : '当前最值得优先关注的是经营摘要、核心指标和异常波动之间的关系。',
      '建议结合知识库证据继续补充关键原因、风险点和下一步动作，使结果更适合直接汇报或转发。',
    ].join('');
  }

  const rowCount = Array.isArray(record.table?.rows) ? record.table.rows.length : 0;
  const firstColumn = Array.isArray(record.table?.columns) ? record.table?.columns?.[0] : '';
  return [
    `${record.groupLabel} 的当前输出已经按 ${record.templateLabel} 形成结构化表格。`,
    rowCount ? `当前共整理 ${rowCount} 行核心内容` : '当前已整理出核心条目',
    firstColumn ? `，建议优先复核“${firstColumn}”这一主维度下的结论一致性。` : '，建议优先复核主要结论与证据的一致性。',
    '如果需要进一步增强，可继续补充筛选范围、排序逻辑或重点字段。',
  ].join('');
}

async function buildCloudReportAnalysis(
  record: {
    groupLabel: string;
    templateLabel: string;
    kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md';
    table?: ReportOutputRecord['table'];
    page?: ReportOutputRecord['page'];
    content?: string;
    libraries?: ReportOutputRecord['libraries'];
  },
  deps: ReportOutputEnrichmentDeps,
) {
  if (!deps.isOpenClawGatewayConfigured()) {
    return '';
  }

  const context = [
    record.kind && record.kind !== 'table' ? summarizePageForAnalysis(record.page) : summarizeTableForAnalysis(record.table),
    record.content ? `正文：${record.content}` : '',
    Array.isArray(record.libraries) && record.libraries.length
      ? `知识库：${record.libraries.map((item) => item.label || item.key).filter(Boolean).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!context) return '';

  try {
    const response = await deps.runOpenClawChat({
      prompt: [
        `请基于以下${record.kind && record.kind !== 'table' ? '叙事型输出' : '表格报表'}内容，输出一段“AI综合分析”。`,
        '要求：',
        '1. 只输出一段自然中文，不要标题，不要编号，不要 Markdown。',
        '2. 聚焦核心发现、风险点、可执行建议。',
        '3. 120 到 220 字。',
        '',
        context,
      ].join('\n'),
      systemPrompt: [
        '你是企业知识分析助手。',
        '你的任务是根据已经整理好的报表内容，生成一段克制、专业、适合业务阅读的综合分析。',
        '不要重复表格原文，不要使用括号、星号、井号、分隔线。',
      ].join('\n'),
    });

    return String(response.content || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

export async function attachReportAnalysisWithDeps(record: ReportOutputRecord, deps: ReportOutputEnrichmentDeps) {
  if (record.status !== 'ready' || record.kind === 'md') return record;
  const analysis =
    (await buildCloudReportAnalysis(record, deps)) ||
    buildLocalReportAnalysis(record);

  if (!analysis) return record;

  if (deps.isNarrativeReportKind(record.kind)) {
    const sections = Array.isArray(record.page?.sections) ? [...record.page.sections] : [];
    const filteredSections = sections.filter((item) => String(item?.title || '').trim() !== 'AI综合分析');
    filteredSections.push({
      title: 'AI综合分析',
      body: analysis,
      bullets: [],
    });
    return {
      ...record,
      page: {
        ...(record.page || {}),
        sections: filteredSections,
      },
    };
  }

  const table = record.table || { columns: ['结论', '说明'], rows: [] };
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : ['结论', '说明'];
  const rows = Array.isArray(table.rows) ? [...table.rows] : [];
  const filteredRows = rows.filter((row) => String(row?.[0] || '').trim() !== 'AI综合分析');
  const analysisRow =
    columns.length === 1
      ? [`AI综合分析：${analysis}`]
      : ['AI综合分析', analysis, ...new Array(Math.max(0, columns.length - 2)).fill('')];
  filteredRows.push(analysisRow);

  return {
    ...record,
    table: {
      ...table,
      columns,
      rows: filteredRows,
    },
  };
}

export async function attachReportDatavizWithDeps(record: ReportOutputRecord, deps: ReportOutputEnrichmentDeps) {
  if (!deps.isNarrativeReportKind(record.kind) || !record.page) return record;
  const page = await deps.attachDatavizRendersToPage(record.page, {
    slots: Array.isArray(record.page?.datavizSlots) && record.page.datavizSlots.length
      ? record.page.datavizSlots
      : Array.isArray(record.dynamicSource?.planDatavizSlots)
        ? record.dynamicSource?.planDatavizSlots
        : [],
  });
  return page ? { ...record, page } : record;
}

export async function finalizeReportOutputRecordWithDeps(record: ReportOutputRecord, deps: ReportOutputEnrichmentDeps) {
  if (record.status !== 'ready') return record;
  if (record.kind === 'md') return record;
  return attachReportAnalysisWithDeps(await attachReportDatavizWithDeps(record, deps), deps);
}

export function attachLocalReportAnalysisWithDeps(record: ReportOutputRecord, deps: Pick<ReportOutputEnrichmentDeps, 'isNarrativeReportKind'>) {
  if (record.status !== 'ready' || record.kind === 'md') return record;
  const analysis = buildLocalReportAnalysis(record);
  if (!analysis) return record;

  if (deps.isNarrativeReportKind(record.kind)) {
    const sections = Array.isArray(record.page?.sections) ? [...record.page.sections] : [];
    if (!sections.some((item) => String(item?.title || '').trim() === 'AI综合分析')) {
      sections.push({ title: 'AI综合分析', body: analysis, bullets: [] });
    }
    return {
      ...record,
      page: {
        ...(record.page || {}),
        sections,
      },
    };
  }

  const table = record.table || { columns: ['结论', '说明'], rows: [] };
  const columns = Array.isArray(table.columns) && table.columns.length ? table.columns : ['结论', '说明'];
  const rows = Array.isArray(table.rows) ? [...table.rows] : [];
  if (!rows.some((row) => String(row?.[0] || '').trim() === 'AI综合分析')) {
    rows.push(columns.length === 1 ? [`AI综合分析：${analysis}`] : ['AI综合分析', analysis, ...new Array(Math.max(0, columns.length - 2)).fill('')]);
  }
  return {
    ...record,
    table: {
      ...table,
      columns,
      rows,
    },
  };
}
