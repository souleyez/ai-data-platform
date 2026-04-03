export const REPORT_TEMPLATE_TYPES = ['table', 'static-page', 'ppt', 'document'] as const;
export type ReportTemplateType = typeof REPORT_TEMPLATE_TYPES[number];

export const REPORT_REFERENCE_SOURCE_TYPES = ['word', 'ppt', 'spreadsheet', 'image', 'web-link', 'other'] as const;
export type ReportReferenceSourceType = typeof REPORT_REFERENCE_SOURCE_TYPES[number];

export const REPORT_OUTPUT_KINDS = ['table', 'page', 'ppt', 'pdf', 'doc', 'md'] as const;
export type ReportOutputKind = typeof REPORT_OUTPUT_KINDS[number];

export type ReportTemplateStandard = {
  type: ReportTemplateType;
  label: string;
  defaultKind: ReportOutputKind;
  defaultFormat: string;
  outputLabel: string;
  supportedSourceTypes: ReportReferenceSourceType[];
  notes: string[];
};

export const REPORT_TEMPLATE_STANDARDS: ReportTemplateStandard[] = [
  {
    type: 'table',
    label: '表格模板',
    defaultKind: 'table',
    defaultFormat: 'csv',
    outputLabel: '表格',
    supportedSourceTypes: ['spreadsheet', 'other'],
    notes: ['适合结构化表格输出。', '默认导出格式为 csv。'],
  },
  {
    type: 'static-page',
    label: '静态页模板',
    defaultKind: 'page',
    defaultFormat: 'html',
    outputLabel: '静态页',
    supportedSourceTypes: ['image', 'web-link', 'other'],
    notes: ['适合页面型报告和看板式输出。', '默认导出格式为 html。'],
  },
  {
    type: 'ppt',
    label: '演示模板',
    defaultKind: 'ppt',
    defaultFormat: 'pptx',
    outputLabel: 'PPT',
    supportedSourceTypes: ['ppt', 'image', 'other'],
    notes: ['适合演示文稿输出。', '默认导出格式为 pptx。'],
  },
  {
    type: 'document',
    label: '文档模板',
    defaultKind: 'doc',
    defaultFormat: 'docx',
    outputLabel: '文档',
    supportedSourceTypes: ['word', 'web-link', 'other'],
    notes: ['适合长文档输出。', '默认导出格式为 docx。'],
  },
];

export function resolveTemplateTypeFromKind(kind?: ReportOutputKind): ReportTemplateType | null {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf' || kind === 'doc' || kind === 'md') return 'document';
  return null;
}

export function resolveDefaultReportKind(templateType: ReportTemplateType): ReportOutputKind {
  return REPORT_TEMPLATE_STANDARDS.find((item) => item.type === templateType)?.defaultKind || 'page';
}

export function resolveDefaultReportFormat(kind: ReportOutputKind): string {
  if (kind === 'table') return 'csv';
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'md') return 'md';
  return 'docx';
}

export function resolveOutputTypeLabel(kind?: ReportOutputKind, templateType?: ReportTemplateType) {
  if (kind === 'table') return '表格';
  if (kind === 'page') return '静态页';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'ppt') return 'PPT';
  if (kind === 'doc') return '文档';
  if (kind === 'md') return 'Markdown';
  return REPORT_TEMPLATE_STANDARDS.find((item) => item.type === templateType)?.outputLabel || 'PPT';
}

export function isNarrativeReportKind(kind?: ReportOutputKind) {
  return Boolean(kind && kind !== 'table');
}

export function buildReportStandardsPayload() {
  return {
    status: 'ok' as const,
    generatedAt: new Date().toISOString(),
    templates: REPORT_TEMPLATE_STANDARDS.map((item) => ({
      ...item,
      compatibleOutputKinds: REPORT_OUTPUT_KINDS.filter((kind) => resolveTemplateTypeFromKind(kind) === item.type),
    })),
    sourceTypes: REPORT_REFERENCE_SOURCE_TYPES.map((item) => ({
      id: item,
      label: item,
    })),
    outputKinds: REPORT_OUTPUT_KINDS.map((kind) => ({
      id: kind,
      label: resolveOutputTypeLabel(kind),
      defaultFormat: resolveDefaultReportFormat(kind),
      templateType: resolveTemplateTypeFromKind(kind),
      narrative: isNarrativeReportKind(kind),
    })),
  };
}
