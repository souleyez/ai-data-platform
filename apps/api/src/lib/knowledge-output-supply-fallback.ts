import type { ReportTemplateEnvelope } from './report-center.js';
import type { ChatOutput } from './knowledge-output.js';
import {
  containsAny,
  isObject,
  normalizeText,
  pickString,
  sanitizeStringArray,
  sanitizeText,
  type JsonRecord,
} from './knowledge-output-normalization.js';

function resolveNarrativeOutputFormat(kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md') {
  if (kind === 'page') return 'html';
  if (kind === 'ppt') return 'pptx';
  if (kind === 'pdf') return 'pdf';
  if (kind === 'doc') return 'docx';
  return 'md';
}

function normalizeObjectArray(value: unknown) {
  if (!Array.isArray(value)) return [] as JsonRecord[];
  return value.filter(isObject) as JsonRecord[];
}

export function looksLikeKnowledgeSupplyPayload(value: unknown): value is JsonRecord {
  if (!isObject(value)) return false;
  const hasScope = isObject(value.scope);
  const hasSupplyCollections = Array.isArray(value.documents) || Array.isArray(value.evidence) || Array.isArray(value.gaps);
  const hasGuidance = isObject(value.templateGuidance) || isObject(value.conceptPage);
  const hasReportShape =
    isObject(value.page)
    || isObject(value.table)
    || Array.isArray(value.sections)
    || Array.isArray(value.cards)
    || Array.isArray(value.rows)
    || Array.isArray(value.columns);
  return hasScope && (hasSupplyCollections || hasGuidance) && !hasReportShape;
}

function extractSupplySectionTitles(
  payload: JsonRecord,
  envelope: ReportTemplateEnvelope | null | undefined,
  defaultPageSections: string[],
) {
  if (envelope?.pageSections?.length) return envelope.pageSections;

  const conceptPage = isObject(payload.conceptPage) ? payload.conceptPage : {};
  const templateGuidance = isObject(payload.templateGuidance) ? payload.templateGuidance : {};
  const conceptSections = sanitizeStringArray(conceptPage.recommendedSections);
  if (conceptSections.length) return conceptSections;

  const preferredSections = sanitizeStringArray(templateGuidance.preferredSections);
  if (preferredSections.length) return preferredSections;

  return defaultPageSections;
}

function extractSupplyLibraries(payload: JsonRecord) {
  const scope = isObject(payload.scope) ? payload.scope : {};
  return normalizeObjectArray(scope.libraries).map((item) => pickString(item.label, item.key)).filter(Boolean);
}

function buildSupplySummary(payload: JsonRecord) {
  const libraries = extractSupplyLibraries(payload);
  const documents = normalizeObjectArray(payload.documents);
  const gaps = sanitizeStringArray(payload.gaps);

  if (gaps.length) {
    const prefix = libraries.length ? `当前基于 ${libraries.join('、')} 知识库整理后发现：` : '当前供料结果显示：';
    return `${prefix}${gaps[0]}`;
  }

  if (documents.length) {
    const prefix = libraries.length ? `${libraries.join('、')} 知识库` : '当前知识库';
    return `当前基于 ${prefix} 整理出 ${documents.length} 份高相关资料，可继续生成结构化静态页。`;
  }

  return '当前已匹配到目标知识库，但供料仍然有限，建议补充更贴近需求的资料后再生成页面。';
}

function buildSupplyCards(payload: JsonRecord) {
  const documents = normalizeObjectArray(payload.documents);
  const evidence = normalizeObjectArray(payload.evidence);
  const gaps = sanitizeStringArray(payload.gaps);
  const libraries = extractSupplyLibraries(payload);

  return [
    { label: '资料数量', value: String(documents.length), note: '本次供料命中的核心文档数' },
    { label: '证据条目', value: String(evidence.length), note: '可直接复用的证据片段数' },
    { label: '知识库', value: String(libraries.length), note: libraries.join('、') || '未显式命名' },
    { label: '待补缺口', value: String(gaps.length), note: gaps[0] || '暂无显式缺口' },
  ].filter((item) => item.value !== '0' || item.label === '待补缺口');
}

function buildSupplyDocumentLines(payload: JsonRecord) {
  return normalizeObjectArray(payload.documents)
    .slice(0, 3)
    .map((item) => {
      const title = pickString(item.title, item.source, '资料');
      const summary = pickString(item.summary, item.whySelected);
      return summary ? `${title}：${summary}` : title;
    })
    .filter(Boolean);
}

function buildSupplyEvidenceLines(payload: JsonRecord) {
  return normalizeObjectArray(payload.evidence)
    .slice(0, 3)
    .map((item) => {
      const title = pickString(item.title, item.dimension, '证据');
      const text = pickString(item.text, item.whySelected);
      return text ? `${title}：${text}` : title;
    })
    .filter(Boolean);
}

function buildSupplyHintLines(payload: JsonRecord) {
  const templateGuidance = isObject(payload.templateGuidance) ? payload.templateGuidance : {};
  const conceptPage = isObject(payload.conceptPage) ? payload.conceptPage : {};
  return [
    ...sanitizeStringArray(templateGuidance.groupingHints),
    ...sanitizeStringArray(conceptPage.groupingHints),
    pickString(templateGuidance.outputHint),
  ].filter(Boolean);
}

function buildSupplySectionBody(
  title: string,
  summary: string,
  documentLines: string[],
  evidenceLines: string[],
  gaps: string[],
  hintLines: string[],
) {
  const normalizedTitle = normalizeText(title);
  if (!normalizedTitle) return summary;
  if (containsAny(normalizedTitle, ['概览', '摘要', '总览'])) return summary;
  if (containsAny(normalizedTitle, ['风险', '缺口'])) return gaps.join('\n') || summary;
  if (containsAny(normalizedTitle, ['建议', '分析'])) return hintLines.join('\n') || gaps.join('\n') || summary;
  if (containsAny(normalizedTitle, ['设备', '网关', '平台', '接口', '集成', '模块', '场景', '价值'])) {
    return evidenceLines.join('\n') || documentLines.join('\n') || summary;
  }
  return documentLines.join('\n') || evidenceLines.join('\n') || summary;
}

function buildSupplySectionBullets(
  title: string,
  documentLines: string[],
  evidenceLines: string[],
  gaps: string[],
  hintLines: string[],
) {
  const normalizedTitle = normalizeText(title);
  if (containsAny(normalizedTitle, ['风险', '缺口'])) return gaps.slice(0, 3);
  if (containsAny(normalizedTitle, ['建议', '分析'])) return hintLines.slice(0, 3);
  if (containsAny(normalizedTitle, ['设备', '网关', '平台', '接口', '集成', '模块', '场景', '价值'])) {
    return evidenceLines.slice(0, 3);
  }
  return documentLines.slice(0, 3);
}

export function buildSupplyEchoPageOutput(
  kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  title: string,
  payload: JsonRecord,
  envelope: ReportTemplateEnvelope | null | undefined,
  defaultPageSections: string[],
): ChatOutput {
  const summary = buildSupplySummary(payload);
  const sectionTitles = extractSupplySectionTitles(payload, envelope, defaultPageSections);
  const documentLines = buildSupplyDocumentLines(payload);
  const evidenceLines = buildSupplyEvidenceLines(payload);
  const gaps = sanitizeStringArray(payload.gaps).slice(0, 6);
  const hintLines = buildSupplyHintLines(payload).slice(0, 6);

  const page = {
    summary,
    cards: buildSupplyCards(payload),
    sections: sectionTitles.map((sectionTitle) => ({
      title: sectionTitle,
      body: buildSupplySectionBody(sectionTitle, summary, documentLines, evidenceLines, gaps, hintLines),
      bullets: buildSupplySectionBullets(sectionTitle, documentLines, evidenceLines, gaps, hintLines),
    })),
    charts: [],
  };

  return {
    type: kind === 'page' ? 'page' : kind,
    title,
    content: summary,
    format: resolveNarrativeOutputFormat(kind),
    page,
  };
}

export function looksLikePromptEchoPage(
  requestText: string,
  summary: string,
  content: string,
  cards: Array<{ label?: string; value?: string; note?: string }>,
  sections: Array<{ title?: string; body?: string; bullets?: string[] }>,
) {
  if (cards.length) return false;

  const normalizedRequest = normalizeText(requestText);
  if (!normalizedRequest) return false;

  const normalizedSummary = normalizeText(summary);
  const normalizedContent = normalizeText(content);
  const summaryMatchesRequest =
    !normalizedSummary
    || normalizedSummary === normalizedRequest
    || normalizedContent === normalizedRequest;

  if (!summaryMatchesRequest) return false;

  const nonEmptySections = sections.filter((section) => sanitizeText(section.body) || section.bullets?.length);
  if (!nonEmptySections.length) return true;

  return nonEmptySections.every((section) => {
    if (section.bullets?.length) return false;
    const normalizedBody = normalizeText(section.body || '');
    return !normalizedBody || normalizedBody === normalizedRequest;
  });
}

export function buildPromptEchoFallbackOutput(
  kind: 'page' | 'pdf' | 'ppt' | 'doc' | 'md',
  title: string,
  requestText: string,
  envelope: ReportTemplateEnvelope | null | undefined,
  defaultPageSections: string[],
): ChatOutput {
  const requestPreview = sanitizeText(requestText);
  const summary = requestPreview
    ? '已识别到页面生成请求，但模型当前只回显了请求文本，未稳定产出结构化页面内容。以下保留既定章节骨架，建议补充更贴近维度的供料后重试。'
    : '已识别到页面生成请求，但模型当前未稳定产出结构化页面内容。以下保留既定章节骨架。';
  const sectionTitles = envelope?.pageSections?.length ? envelope.pageSections : defaultPageSections;

  const page = {
    summary,
    cards: [
      { label: '输出状态', value: '待补充', note: '模型未稳定产出结构化页面内容' },
      { label: '章节数量', value: String(sectionTitles.length), note: '已保留页面结构骨架' },
      ...(requestPreview
        ? [{ label: '原始请求', value: '已识别', note: requestPreview }]
        : []),
    ],
    sections: sectionTitles.map((sectionTitle, index) => {
      const normalizedTitle = normalizeText(sectionTitle);
      const isAnalysisSection = containsAny(normalizedTitle, ['分析', '建议']);
      return {
        title: sectionTitle,
        body:
          index === 0
            ? summary
            : index === 1 && requestPreview
              ? `原始请求：${requestPreview}`
              : isAnalysisSection
                ? '建议补充更贴近目标维度的知识库资料，或稍后重试页面生成。'
                : '',
        bullets:
          index === 0
            ? ['当前结果仅包含请求回显', '未返回稳定的结构化页面内容']
            : isAnalysisSection
              ? ['检查知识库供料是否命中目标维度', '确认模型输出是否返回 JSON page 结构']
              : [],
      };
    }),
    charts: [],
  };

  return {
    type: kind === 'page' ? 'page' : kind,
    title,
    content: summary,
    format: resolveNarrativeOutputFormat(kind),
    page,
  };
}
