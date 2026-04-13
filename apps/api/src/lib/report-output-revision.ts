import type {
  ReportGroup,
  ReportOutputRecord,
  SharedReportTemplate,
} from './report-center.js';

type ReportCenterStateLike = {
  groups: ReportGroup[];
  outputs: ReportOutputRecord[];
  templates: SharedReportTemplate[];
};

export type ReportOutputRevisionDeps = {
  loadState: () => Promise<ReportCenterStateLike>;
  resolveTemplateTypeFromKind: (kind?: ReportOutputRecord['kind']) => SharedReportTemplate['type'] | null;
  resolveReportGroup: (groups: ReportGroup[], groupKeyOrLabel: string) => ReportGroup | null;
  isNarrativeReportKind: (kind?: ReportOutputRecord['kind']) => boolean;
  buildConceptPageEnvelope: (group: ReportGroup | null, requestText: string) => {
    title: string;
    fixedStructure: string[];
    variableZones: string[];
    outputHint: string;
  };
  buildSharedTemplateEnvelope: (template: SharedReportTemplate) => {
    title: string;
    fixedStructure: string[];
    variableZones: string[];
    outputHint: string;
  };
  summarizeTableForAnalysis: (table?: ReportOutputRecord['table']) => string;
  summarizePageForAnalysis: (page?: ReportOutputRecord['page']) => string;
  runOpenClawChat: (input: { prompt: string; systemPrompt?: string }) => Promise<{ content: string }>;
  normalizeReportOutput: (
    kind: NonNullable<ReportOutputRecord['kind']>,
    prompt: string,
    rawContent: string,
    envelope: {
      title: string;
      fixedStructure: string[];
      variableZones: string[];
      outputHint: string;
    },
    tableColumns?: string[],
    pageSections?: string[],
    options?: {
      datavizSlots?: unknown[];
      pageSpec?: unknown;
    },
  ) => {
    content: string;
    format?: string;
    table?: ReportOutputRecord['table'] | null;
    page?: ReportOutputRecord['page'] | null;
  };
  attachReportDataviz: (record: ReportOutputRecord) => Promise<ReportOutputRecord>;
  attachReportAnalysis: (record: ReportOutputRecord) => Promise<ReportOutputRecord>;
  saveGroupsAndOutputs: (
    groups: ReportGroup[],
    outputs: ReportOutputRecord[],
    templates?: SharedReportTemplate[],
  ) => Promise<void>;
};

function findOutputOrThrow(outputs: ReportOutputRecord[], outputId: string) {
  const record = outputs.find((item) => item.id === outputId);
  if (!record) throw new Error('report output not found');
  return record;
}

export async function reviseReportOutputWithDeps(
  outputId: string,
  instruction: string,
  deps: ReportOutputRevisionDeps,
) {
  const state = await deps.loadState();
  const record = findOutputOrThrow(state.outputs, outputId);

  const normalizedInstruction = String(instruction || '').trim();
  if (!normalizedInstruction) throw new Error('instruction is required');

  const template =
    state.templates.find((item) => item.key === record.templateKey)
    || state.templates.find((item) => item.type === deps.resolveTemplateTypeFromKind(record.kind) && item.isDefault)
    || state.templates.find((item) => item.type === deps.resolveTemplateTypeFromKind(record.kind))
    || state.templates[0];
  if (!template) throw new Error('shared report template not found');

  const group =
    deps.resolveReportGroup(state.groups, record.groupKey)
    || deps.resolveReportGroup(state.groups, record.groupLabel);
  const conceptMode = deps.isNarrativeReportKind(record.kind) && Boolean(record.dynamicSource?.conceptMode);

  const envelope = conceptMode
    ? deps.buildConceptPageEnvelope(group || null, normalizedInstruction || record.title || '')
    : deps.buildSharedTemplateEnvelope(template);
  const currentMaterial = [
    record.content ? `当前正文：${record.content}` : '',
    record.table ? `当前表格：\n${deps.summarizeTableForAnalysis(record.table)}` : '',
    record.page ? `当前页面：\n${deps.summarizePageForAnalysis(record.page)}` : '',
    record.summary ? `当前摘要：${record.summary}` : '',
    Array.isArray(record.libraries) && record.libraries.length
      ? `关联知识库：${record.libraries.map((item) => item.label || item.key).filter(Boolean).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  let revisedBase: ReportOutputRecord;
  try {
    const cloud = await deps.runOpenClawChat({
      prompt: [
        `请根据当前报表内容和用户调整要求，重写这份${record.outputType}。`,
        `用户要求：${normalizedInstruction}`,
        '',
        currentMaterial,
      ].join('\n'),
      systemPrompt: [
        '你是企业知识分析助手。',
        '请在不脱离当前报表主题和知识库范围的前提下，根据用户要求调整已生成报表。',
        '优先保持既有输出形式不变，只调整结构、重点和表达。',
        conceptMode ? '当前静态页使用概念供料模式，不需要强制贴合共享模板。' : `模板标题：${envelope.title}`,
        `固定结构：${envelope.fixedStructure.join('；')}`,
        `可变区域：${envelope.variableZones.join('；')}`,
        `输出提示：${envelope.outputHint}`,
      ].join('\n'),
    });

    const normalized = deps.normalizeReportOutput(
      record.kind || 'page',
      normalizedInstruction,
      cloud.content,
      envelope,
      [],
      [],
      {
        datavizSlots: record.dynamicSource?.planDatavizSlots || [],
        pageSpec: record.page?.pageSpec || record.dynamicSource?.planPageSpec,
      },
    );

    const nextTable = 'table' in normalized ? normalized.table || null : null;
    const nextPage = 'page' in normalized ? normalized.page || null : null;
    const nextFormat = 'format' in normalized ? normalized.format || record.format : record.format;

    revisedBase = await deps.attachReportDataviz({
      ...record,
      summary: `${record.templateLabel} 已根据自然语言要求更新。`,
      content: normalized.content,
      table: nextTable,
      page: nextPage,
      format: nextFormat,
      kind: record.kind,
    });
  } catch {
    revisedBase = {
      ...record,
      summary: `${record.templateLabel} 已记录新的调整要求：${normalizedInstruction}`,
      content: record.content || normalizedInstruction,
    };
  }

  const revisedRecord = await deps.attachReportAnalysis(revisedBase);
  const nextOutputs = state.outputs.map((item) => (item.id === outputId ? revisedRecord : item));
  await deps.saveGroupsAndOutputs(state.groups, nextOutputs, state.templates);
  return revisedRecord;
}
