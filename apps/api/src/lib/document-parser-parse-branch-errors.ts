import { buildStructuredProfile } from './document-schema.js';
import {
  buildParseErrorParsedDocument,
  buildUnsupportedParsedDocument,
} from './document-parser-result-builders.js';
import { buildCatchStageParsedDocument } from './document-parser-stage-builders.js';
import type { ParsedDocument } from './document-parser-types.js';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  type ParseBranchSharedInput,
  PRESENTATION_EXTENSIONS,
  buildGovernedTopicSchema,
} from './document-parser-parse-branch-support.js';

export function buildUnsupportedParseResult(
  input: ParseBranchSharedInput & {
    activeText: string;
    unsupportedSummary: string;
  },
): ParsedDocument {
  const { topicTags, schemaType } = buildGovernedTopicSchema(
    input.filePath,
    input.category,
    input.bizCategory,
    input.extractionProfile,
  );

  return buildUnsupportedParsedDocument({
    filePath: input.filePath,
    name: input.name,
    ext: input.ext,
    title: input.name.replace(/\.[^.]+$/, ''),
    category: input.category,
    bizCategory: input.bizCategory,
    parseMethod: input.parseMethod,
    fullText: input.activeText || '',
    markdownText: input.markdownText,
    markdownMethod: input.markdownMethod,
    markdownGeneratedAt: input.markdownGeneratedAt,
    markdownError: input.markdownError,
    canonicalParseStatus: 'unsupported',
    topicTags,
    parseStage: input.parseStage,
    detailParseStatus: input.defaultDetailParseStatus,
    detailParseQueuedAt: input.defaultDetailQueuedAt,
    detailParsedAt: input.defaultDetailParsedAt,
    detailParseAttempts: input.defaultDetailAttempts,
    schemaType,
    structuredProfile: buildStructuredProfile({
      schemaType,
      title: input.name.replace(/\.[^.]+$/, ''),
      topicTags,
      summary: input.unsupportedSummary,
      evidenceChunks: [],
      tableSummary: input.tableSummary,
      extractionProfile: input.structuredExtractionProfile,
    }),
    unsupportedSummary: input.unsupportedSummary,
  });
}

export function buildParseErrorResult(
  input: ParseBranchSharedInput & {
    activeText: string;
    text: string;
  },
): ParsedDocument {
  const { topicTags, schemaType } = buildGovernedTopicSchema(
    input.filePath,
    input.category,
    input.bizCategory,
    input.extractionProfile,
  );
  const fallbackSummary = AUDIO_EXTENSIONS.has(input.ext)
    ? '音频详细解析失败，当前未转写出可用正文；当前版本尚未接入音频 VLM 兜底。'
    : IMAGE_EXTENSIONS.has(input.ext)
      ? '图片 OCR 解析失败，当前未提取到可用文本；修复 OCR 环境或调整图片后可手动重新解析。'
      : PRESENTATION_EXTENSIONS.has(input.ext)
        ? 'PPT 解析失败，当前未提取到可用正文；可安装 LibreOffice 后重新解析，详细解析阶段会优先尝试 VLM。'
        : (topicTags.length
          ? `文档解析失败，但已从文件名识别到主题线索：${topicTags.join('、')}。`
          : '文档解析失败，后续可补充依赖后手动重新解析。');

  return buildParseErrorParsedDocument({
    filePath: input.filePath,
    name: input.name,
    ext: input.ext,
    title: input.name.replace(/\.[^.]+$/, ''),
    category: input.category,
    bizCategory: input.bizCategory,
    parseMethod: input.parseMethod,
    fallbackSummary,
    fullText: input.activeText || input.text,
    markdownText: input.markdownText,
    markdownMethod: input.markdownMethod,
    markdownGeneratedAt: input.markdownGeneratedAt,
    markdownError: input.markdownError,
    canonicalParseStatus: 'failed',
    topicTags,
    parseStage: input.parseStage,
    detailParseStatus: input.parseStage === 'quick' ? 'queued' : 'failed',
    detailParseQueuedAt: input.defaultDetailQueuedAt,
    detailParsedAt: input.defaultDetailParsedAt,
    detailParseAttempts: input.defaultDetailAttempts,
    detailParseError: IMAGE_EXTENSIONS.has(input.ext)
      ? 'ocr-text-not-extracted'
      : PRESENTATION_EXTENSIONS.has(input.ext)
        ? 'presentation-text-not-extracted'
        : AUDIO_EXTENSIONS.has(input.ext)
          ? (input.markdownError || 'audio-markdown-not-extracted')
          : (input.markdownError || 'parse-error'),
    schemaType,
    structuredProfile: buildStructuredProfile({
      schemaType,
      title: input.name.replace(/\.[^.]+$/, ''),
      topicTags,
      summary: fallbackSummary,
      evidenceChunks: [],
      tableSummary: input.tableSummary,
      extractionProfile: input.structuredExtractionProfile,
    }),
  });
}

export function buildCatchParseResult(input: {
  filePath: string;
  name: string;
  ext: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  parseStage: 'quick' | 'detailed';
  defaultDetailQueuedAt?: string;
  defaultDetailParsedAt?: string;
  defaultDetailAttempts: number;
  extractionProfile: import('./document-extraction-governance.js').DocumentExtractionProfile | null;
  structuredExtractionProfile?: import('./document-extraction-governance.js').DocumentExtractionProfile;
}) {
  const { topicTags, schemaType } = buildGovernedTopicSchema(
    input.filePath,
    input.category,
    input.bizCategory,
    input.extractionProfile,
  );
  const fallbackSummary = topicTags.length
    ? `文档解析失败，但已从文件名识别到主题线索：${topicTags.join('、')}。`
    : '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。';

  return buildCatchStageParsedDocument({
    filePath: input.filePath,
    name: input.name,
    ext: input.ext,
    category: input.category,
    bizCategory: input.bizCategory,
    fallbackSummary,
    topicTags,
    parseStage: input.parseStage,
    detailParseQueuedAt: input.defaultDetailQueuedAt,
    detailParsedAt: input.defaultDetailParsedAt,
    detailParseAttempts: input.defaultDetailAttempts,
    schemaType,
    extractionProfile: input.structuredExtractionProfile,
  });
}
