import type {
  ReportGroup,
  ReportGroupTemplate,
  ReportOutputRecord,
  ReportTemplateEnvelope,
  ReportTemplateType,
  SharedReportTemplate,
} from './report-center.js';
import {
  buildDefaultSystemTemplates,
  expandDatasourceGovernanceProfile,
  resolveDatasourceGovernanceProfile,
} from './report-governance.js';
import {
  buildSharedTemplateEnvelope as buildSharedTemplateEnvelopeFromHelper,
  buildTemplateEnvelope as buildTemplateEnvelopeFromHelper,
  inferTemplatePreferredLayoutVariant,
} from './report-template-envelopes.js';
import { adaptTemplateEnvelopeForRequest } from './report-template-adapter.js';

export function buildConceptPageEnvelope(group: ReportGroup | null, requestText: string): ReportTemplateEnvelope {
  const baseEnvelope: ReportTemplateEnvelope = {
    title: '数据可视化静态页',
    fixedStructure: [
      '页面结构由当前知识库意图和证据决定，优先组织成可直接阅读和转发的业务页面。',
      '优先展示摘要、指标卡片、重点分析、图表和结论，不强制套用共享模板骨架。',
      '页面内容必须以当前库内资料为依据，不补造库外事实。',
    ],
    variableZones: ['页面标题', '卡片指标', '重点分节', '图表分布', '行动建议', 'AI综合分析'],
    outputHint: 'Concept page generated from current knowledge evidence.',
    pageSections: ['摘要', '核心指标', '重点分析', '行动建议', 'AI综合分析'],
  };

  return group
    ? adaptTemplateEnvelopeForRequest(group, baseEnvelope, 'page', requestText)
    : baseEnvelope;
}

export function resolveTemplateTypeFromKind(kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md'): ReportTemplateType | null {
  if (kind === 'table') return 'table';
  if (kind === 'page') return 'static-page';
  if (kind === 'ppt') return 'ppt';
  if (kind === 'pdf' || kind === 'doc' || kind === 'md') return 'document';
  return null;
}

export function resolveOutputTypeLabel(kind?: 'table' | 'page' | 'ppt' | 'pdf' | 'doc' | 'md', templateType?: ReportTemplateType) {
  if (kind === 'table') return '表格';
  if (kind === 'page') return '静态页';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'ppt') return 'PPT';
  if (kind === 'doc') return '文档';
  if (kind === 'md') return 'Markdown';
  if (templateType === 'table') return '表格';
  if (templateType === 'static-page') return '静态页';
  if (templateType === 'document') return '文档';
  return 'PPT';
}

export function isNarrativeReportKind(kind?: ReportOutputRecord['kind']) {
  return Boolean(kind && kind !== 'table');
}

export function resolveDefaultReportKind(templateType: ReportTemplateType): NonNullable<ReportOutputRecord['kind']> {
  if (templateType === 'table') return 'table';
  if (templateType === 'static-page') return 'page';
  if (templateType === 'document') return 'doc';
  return 'ppt';
}

export function resolveDefaultReportFormat(kind: NonNullable<ReportOutputRecord['kind']>) {
  if (kind === 'table') return 'csv';
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'md') return 'md';
  return 'docx';
}

function hasDatasourceGovernanceId(label: string, key: string, id: string) {
  return resolveDatasourceGovernanceProfile(label, key)?.id === id;
}

export function isFormulaLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'formula');
}

export function isResumeLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'resume');
}

export function isOrderLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'order');
}

export function isBidLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'bid');
}

export function isPaperLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'paper');
}

export function isIotLibrary(label: string, key: string) {
  return hasDatasourceGovernanceId(label, key, 'iot');
}

export function buildTemplatesForLibrary(label: string, key: string) {
  return expandDatasourceGovernanceProfile(resolveDatasourceGovernanceProfile(label, key), label, key);
}

export function buildDefaultSharedTemplates(): SharedReportTemplate[] {
  return buildDefaultSystemTemplates().map((template) => ({
    ...template,
    preferredLayoutVariant: inferTemplatePreferredLayoutVariant(template),
    origin: 'system',
    referenceImages: [],
  }));
}

export function buildSharedTemplateEnvelope(template: SharedReportTemplate): ReportTemplateEnvelope {
  return buildSharedTemplateEnvelopeFromHelper(template);
}

export function buildTemplateEnvelope(group: ReportGroup, template: ReportGroupTemplate): ReportTemplateEnvelope {
  return buildTemplateEnvelopeFromHelper(group, template);
}

export function normalizeReportGroupToken(value: string) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
}

export function resolveReportGroup(groups: ReportGroup[], groupKeyOrLabel: string) {
  const raw = String(groupKeyOrLabel || '').trim();
  if (!raw) return null;

  const normalized = normalizeReportGroupToken(raw);
  return groups.find((group) => {
    const key = String(group.key || '').trim();
    const label = String(group.label || '').trim();
    return (
      key === raw
      || label === raw
      || normalizeReportGroupToken(key) === normalized
      || normalizeReportGroupToken(label) === normalized
    );
  }) || null;
}
