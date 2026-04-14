import path from 'node:path';
import { type DocumentCategoryConfig } from './document-config.js';
import {
  loadDocumentExtractionGovernance,
  resolveDocumentExtractionProfile,
  type DocumentExtractionProfile,
  type DocumentLibraryContext,
} from './document-extraction-governance.js';
import { applyDocumentParseFeedback } from './document-parse-feedback.js';
import { buildStructuredProfile, deriveSchemaProfile, inferSchemaType, refreshDerivedSchemaProfile } from './document-schema.js';
import { resolveDocumentMarkdownForFile, supportsMarkItDownExtension } from './document-markdown-provider.js';
import { normalizeText } from './document-parser-text-normalization.js';
import {
  buildCatchErrorParsedDocument,
  buildDetailedParsedDocument,
  buildParseErrorParsedDocument,
  buildQuickParsedDocument,
  buildUnsupportedParsedDocument,
} from './document-parser-result-builders.js';
import { buildEvidence, inferTitle } from './document-parser-metadata.js';
import { extractStructuredData } from './document-parser-structured-data.js';
import { excerpt, splitEvidenceChunks, summarize } from './document-parser-evidence.js';
import { shouldForceExtraction } from './document-parser-classification.js';
import { extractDocumentDomainState } from './document-parser-domain-extraction.js';
import {
  buildDocumentParserExtensionSets,
  extractTextForParse as extractText,
  renderPdfDocumentToImages as renderPdfDocumentToImagesForParse,
  renderPresentationDocumentToImages as renderPresentationDocumentToImagesForParse,
} from './document-parser-extractors.js';
import {
  inferParseMethod,
  shouldAttemptDetailedMarkdownResolution,
  shouldPreserveLegacyAuxiliaryExtraction,
  shouldTreatLegacyExtractionAsCanonical,
} from './document-parser-runtime.js';
import {
  applyGovernedSchemaType,
  detectBizCategory as detectBizCategoryForDocument,
  detectCategory as detectCategoryForDocument,
  detectRiskLevel,
  detectTopicTags,
  extractContractFields,
  mergeGovernedTopicTags,
} from './document-parser-domain-fields.js';
import {
  buildCatchStageParsedDocument,
  buildDetailedStageParsedDocument,
  buildQuickStageParsedDocument,
} from './document-parser-stage-builders.js';
import {
  DOCUMENT_AUDIO_EXTENSIONS,
  DOCUMENT_IMAGE_EXTENSIONS,
  DOCUMENT_PARSE_SUPPORTED_EXTENSIONS,
  DOCUMENT_PRESENTATION_EXTENSIONS,
  type EvidenceChunk,
  type ParsedDocument,
  type ResumeFields,
  type StructuredClaim,
  type StructuredEntity,
  type TableSummary,
} from './document-parser-types.js';

export { deriveSchemaProfile, refreshDerivedSchemaProfile } from './document-schema.js';
export {
  DOCUMENT_AUDIO_EXTENSIONS,
  DOCUMENT_IMAGE_EXTENSIONS,
  DOCUMENT_PARSE_SUPPORTED_EXTENSIONS,
  DOCUMENT_PRESENTATION_EXTENSIONS,
} from './document-parser-types.js';
export type {
  EvidenceChunk,
  IntentSlots,
  ParsedDocument,
  ResumeFields,
  StructuredClaim,
  StructuredEntity,
  TableCategoryBreakdown,
  TableDateSummary,
  TableDimensionSummary,
  TableDimensionValueSummary,
  TableInsightSummary,
  TableInventoryRiskBreakdown,
  TableMallZoneBreakdown,
  TableMetricSummary,
  TablePlatformBreakdown,
  TableRecordAlert,
  TableRecordFieldRoles,
  TableRecordInsightSummary,
  TableSheetSummary,
  TableSkuNetSalesSummary,
  TableStructuredRow,
  TableSummary,
} from './document-parser-types.js';

export type ParseDocumentOptions = {
  stage?: 'quick' | 'detailed';
  libraryContext?: DocumentLibraryContext;
  resolveMarkdown?: typeof resolveDocumentMarkdownForFile;
};
const IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
const PRESENTATION_EXTENSIONS = new Set<string>(DOCUMENT_PRESENTATION_EXTENSIONS);
const AUDIO_EXTENSIONS = new Set<string>(DOCUMENT_AUDIO_EXTENSIONS);
const UNSUPPORTED_PARSE_SUMMARY = '当前版本暂未支持该文件类型的正文提取。已支持 pdf、txt、md、docx、csv、json、html、xml、xlsx、xls、epub、wav、mp3、ppt、pptx、pptm、png、jpg、jpeg、webp、gif、bmp。';

export const renderPresentationDocumentToImages = renderPresentationDocumentToImagesForParse;
export const renderPdfDocumentToImages = renderPdfDocumentToImagesForParse;


export function detectCategory(filePath: string, text = '') {
  return detectCategoryForDocument(filePath, text);
}

export function detectBizCategory(filePath: string, category: string, text = '', config?: DocumentCategoryConfig): ParsedDocument['bizCategory'] {
  return detectBizCategoryForDocument(filePath, category, text, config);
}

export async function parseDocument(
  filePath: string,
  config?: DocumentCategoryConfig,
  options?: ParseDocumentOptions,
): Promise<ParsedDocument> {
  const ext = path.extname(filePath).toLowerCase() || 'unknown';
  const name = path.basename(filePath);
  const parseStage = options?.stage === 'quick' ? 'quick' : 'detailed';
  const now = new Date().toISOString();
  const defaultDetailParseStatus = parseStage === 'quick' ? 'queued' : 'succeeded';
  const defaultDetailQueuedAt = parseStage === 'quick' ? now : undefined;
  const defaultDetailParsedAt = parseStage === 'detailed' ? now : undefined;
  const defaultDetailAttempts = parseStage === 'detailed' ? 1 : 0;
  const extractionGovernance = loadDocumentExtractionGovernance();
  const extractionProfile = resolveDocumentExtractionProfile(extractionGovernance, options?.libraryContext);
  const structuredExtractionProfile = extractionProfile ?? undefined;
  const { imageExtensions, presentationExtensions, audioExtensions } = buildDocumentParserExtensionSets();

  try {
    let status: 'parsed' | 'unsupported' | 'error' = 'unsupported';
    let text = '';
    let hintedMethod: string | undefined;
    let tableSummary: TableSummary | undefined;
    let parseStatus: 'parsed' | 'unsupported' | 'error' = 'unsupported';
    let activeText = '';
    let parseMethod = inferParseMethod(ext, '', undefined, {
      imageExtensions,
      audioExtensions,
    });
    let markdownText = '';
    let markdownMethod: ParsedDocument['markdownMethod'];
    let markdownGeneratedAt: string | undefined;
    let markdownError: string | undefined;
    let canonicalParseStatus: ParsedDocument['canonicalParseStatus'] = status === 'unsupported'
      ? 'unsupported'
      : status === 'error'
        ? 'failed'
        : 'fallback_full_text';

    if (shouldAttemptDetailedMarkdownResolution(ext, parseStage, { supportsMarkItDownExtension })) {
      if (ext === '.md') {
        const extracted = await extractText(filePath, ext);
        status = extracted.status;
        text = extracted.text;
        hintedMethod = extracted.parseMethod;
        tableSummary = extracted.tableSummary;
      }
      const markdownResult = await (options?.resolveMarkdown || resolveDocumentMarkdownForFile)({
        filePath,
        ext,
        existingText: text,
      }).catch((error) => ({
        status: 'failed' as const,
        error: error instanceof Error ? error.message : 'markitdown-resolution-failed',
      }));

      if (markdownResult.status === 'succeeded') {
        markdownText = markdownResult.markdownText;
        markdownMethod = markdownResult.method;
        markdownGeneratedAt = now;
        activeText = markdownText;
        parseStatus = 'parsed';
        canonicalParseStatus = 'ready';
        if (markdownMethod === 'markitdown') {
          parseMethod = 'markitdown';
        } else if (markdownMethod === 'existing-markdown') {
          parseMethod = 'existing-markdown';
        }
      } else if (markdownResult.status === 'failed') {
        markdownError = markdownResult.error;
      }
    }

    const needsLegacyExtraction = !markdownText || shouldPreserveLegacyAuxiliaryExtraction(ext);
    if (needsLegacyExtraction) {
      try {
        const extracted = await extractText(filePath, ext);
        status = extracted.status;
        text = extracted.text;
        hintedMethod = extracted.parseMethod;
        tableSummary = extracted.tableSummary;
        if (markdownText && shouldPreserveLegacyAuxiliaryExtraction(ext) && hintedMethod) {
          parseMethod = hintedMethod;
        }
        if (!markdownText) {
          parseStatus = status;
          activeText = text;
          parseMethod = inferParseMethod(ext, text, hintedMethod, {
            imageExtensions,
            audioExtensions,
          });
          canonicalParseStatus = status === 'unsupported'
            ? 'unsupported'
            : status === 'error'
              ? 'failed'
              : shouldTreatLegacyExtractionAsCanonical(ext)
                ? 'ready'
                : 'fallback_full_text';
        }
      } catch (error) {
        if (!markdownText) throw error;
      }
    }

    if (
      parseStage === 'detailed'
      && parseStatus === 'unsupported'
      && shouldAttemptDetailedMarkdownResolution(ext, parseStage, { supportsMarkItDownExtension })
      && !markdownText
    ) {
      parseStatus = 'error';
      canonicalParseStatus = 'failed';
    }

    const semanticText = markdownText && shouldPreserveLegacyAuxiliaryExtraction(ext) && text
      ? text
      : activeText;
    const normalizedText = normalizeText(semanticText);
    const category = detectCategory(filePath, normalizedText);
    const bizCategory = detectBizCategory(filePath, category, normalizedText, config);
    const unsupportedSummary = UNSUPPORTED_PARSE_SUMMARY;

    if (parseStatus === 'unsupported') {
      const topicTags = mergeGovernedTopicTags(
        detectTopicTags(buildEvidence(filePath), category, bizCategory),
        extractionProfile,
      );
      const schemaType = applyGovernedSchemaType(
        inferSchemaType(category, bizCategory, undefined, topicTags),
        extractionProfile,
      );
      return buildUnsupportedParsedDocument({
        filePath,
        name,
        ext,
        title: path.parse(name).name,
        category,
        bizCategory,
        parseMethod,
        fullText: activeText || '',
        markdownText,
        markdownMethod,
        markdownGeneratedAt,
        markdownError,
        canonicalParseStatus: 'unsupported',
        topicTags,
        parseStage,
        detailParseStatus: defaultDetailParseStatus,
        detailParseQueuedAt: defaultDetailQueuedAt,
        detailParsedAt: defaultDetailParsedAt,
        detailParseAttempts: defaultDetailAttempts,
        schemaType,
        structuredProfile: buildStructuredProfile({
          schemaType,
          title: path.parse(name).name,
          topicTags,
          summary: unsupportedSummary,
          evidenceChunks: [],
          tableSummary,
          extractionProfile: structuredExtractionProfile,
        }),
        unsupportedSummary,
      });
    }

    if (parseStatus === 'error') {
      const topicTags = mergeGovernedTopicTags(
        detectTopicTags(buildEvidence(filePath), category, bizCategory),
        extractionProfile,
      );
      const schemaType = applyGovernedSchemaType(
        inferSchemaType(category, bizCategory, undefined, topicTags),
        extractionProfile,
      );
      const fallbackSummary = AUDIO_EXTENSIONS.has(ext)
        ? '音频详细解析失败，当前未转写出可用正文；当前版本尚未接入音频 VLM 兜底。'
        : IMAGE_EXTENSIONS.has(ext)
        ? '图片 OCR 解析失败，当前未提取到可用文本；修复 OCR 环境或调整图片后可手动重新解析。'
        : PRESENTATION_EXTENSIONS.has(ext)
          ? 'PPT 解析失败，当前未提取到可用正文；可安装 LibreOffice 后重新解析，详细解析阶段会优先尝试 VLM。'
        : (topicTags.length
          ? `文档解析失败，但已从文件名识别到主题线索：${topicTags.join('、')}。`
          : '文档解析失败，后续可补充依赖后手动重新解析。');

      return buildParseErrorParsedDocument({
        filePath,
        name,
        ext,
        title: path.parse(name).name,
        category,
        bizCategory,
        parseMethod,
        fallbackSummary,
        fullText: activeText || text,
        markdownText,
        markdownMethod,
        markdownGeneratedAt,
        markdownError,
        canonicalParseStatus: 'failed',
        topicTags,
        parseStage,
        detailParseStatus: parseStage === 'quick' ? 'queued' : 'failed',
        detailParseQueuedAt: defaultDetailQueuedAt,
        detailParsedAt: defaultDetailParsedAt,
        detailParseAttempts: defaultDetailAttempts,
        detailParseError: IMAGE_EXTENSIONS.has(ext)
          ? 'ocr-text-not-extracted'
          : PRESENTATION_EXTENSIONS.has(ext)
            ? 'presentation-text-not-extracted'
            : AUDIO_EXTENSIONS.has(ext)
              ? (markdownError || 'audio-markdown-not-extracted')
              : (markdownError || 'parse-error'),
        schemaType,
        structuredProfile: buildStructuredProfile({
          schemaType,
          title: path.parse(name).name,
          topicTags,
          summary: fallbackSummary,
          evidenceChunks: [],
          tableSummary,
          extractionProfile: structuredExtractionProfile,
        }),
      });
    }

    const topicTags = mergeGovernedTopicTags(
      detectTopicTags(`${name} ${normalizedText}`, category, bizCategory),
      extractionProfile,
    );
    const feedbackLibraryKeys = options?.libraryContext?.keys?.length
      ? options.libraryContext.keys
      : [];
    const summary = summarize(normalizedText, '文档内容为空或暂未提取到文本。');
    const excerptText = excerpt(normalizedText, '文档内容为空或暂未提取到文本。');
    const inferredTitle = inferTitle(semanticText || text, name);

    if (parseStage === 'quick') {
      const quickText = activeText.slice(0, 2400);
      const {
        contractFields,
        resumeFields,
        enterpriseGuidanceFields,
        orderFields,
        footfallFields,
        schemaType,
      } = extractDocumentDomainState({
        libraryKeys: feedbackLibraryKeys,
        text: quickText,
        normalizedText: quickText,
        inferredTitle,
        category,
        bizCategory,
        topicTags,
        extractionProfile,
        tableSummary,
        summary,
      });
      return buildQuickStageParsedDocument({
        filePath,
        name,
        ext,
        title: inferredTitle,
        category,
        bizCategory,
        parseMethod,
        summary,
        excerpt: excerptText,
        fullText: activeText,
        markdownText,
        markdownMethod,
        markdownGeneratedAt,
        markdownError,
        canonicalParseStatus,
        extractedChars: normalizedText.length,
        resumeFields,
        contractFields,
        enterpriseGuidanceFields,
        orderFields,
        footfallFields,
        riskLevel: detectRiskLevel(normalizedText, category),
        topicTags,
        parseStage,
        detailParseStatus: defaultDetailParseStatus,
        detailParseQueuedAt: defaultDetailQueuedAt,
        detailParsedAt: defaultDetailParsedAt,
        detailParseAttempts: defaultDetailAttempts,
        schemaType,
        extractionProfile: structuredExtractionProfile,
        tableSummary,
      });
    }

    const evidenceChunks = splitEvidenceChunks(activeText);
    const contractFields = applyDocumentParseFeedback({
      libraryKeys: feedbackLibraryKeys,
      schemaType: 'contract',
      text: activeText,
      fields: extractContractFields(normalizedText, category, extractionProfile),
    });
    const structured = await extractStructuredData(normalizedText, category, evidenceChunks, topicTags, contractFields);
    const {
      resumeFields,
      enterpriseGuidanceFields,
      orderFields,
      footfallFields,
      schemaType,
    } = extractDocumentDomainState({
      libraryKeys: feedbackLibraryKeys,
      text: activeText,
      normalizedText,
      inferredTitle,
      category,
      bizCategory,
      topicTags,
      extractionProfile,
      tableSummary,
      summary,
      precomputedContractFields: contractFields,
      structuredEntities: structured.entities,
      structuredClaims: structured.claims,
    });

    return buildDetailedStageParsedDocument({
      filePath,
      name,
      ext,
      title: inferredTitle,
      category,
      bizCategory,
      parseMethod,
      summary: summarize(normalizedText, '文档内容为空或暂未提取到文本。'),
      excerpt: excerpt(normalizedText, '文档内容为空或暂未提取到文本。'),
      fullText: activeText,
      markdownText,
      markdownMethod,
      markdownGeneratedAt,
      markdownError,
      canonicalParseStatus,
      extractedChars: normalizedText.length,
      evidenceChunks,
      entities: structured.entities,
      claims: structured.claims,
      intentSlots: structured.intentSlots || {},
      resumeFields,
      enterpriseGuidanceFields,
      orderFields,
      footfallFields,
      riskLevel: detectRiskLevel(normalizedText, category),
      topicTags,
      contractFields,
      parseStage,
      detailParseStatus: defaultDetailParseStatus,
      detailParseQueuedAt: defaultDetailQueuedAt,
      detailParsedAt: defaultDetailParsedAt,
      detailParseAttempts: defaultDetailAttempts,
      schemaType,
      extractionProfile: structuredExtractionProfile,
      tableSummary,
    });
  } catch {
    const category = detectCategory(filePath);
    const bizCategory = detectBizCategory(filePath, category, '', config);
    const topicTags = mergeGovernedTopicTags(
      detectTopicTags(buildEvidence(filePath), category, bizCategory),
      extractionProfile,
    );
    const schemaType = applyGovernedSchemaType(
      inferSchemaType(category, bizCategory, undefined, topicTags),
      extractionProfile,
    );
    const fallbackSummary = topicTags.length
      ? `文档解析失败，但已从文件名识别到主题线索：${topicTags.join('、')}。`
      : '文档解析失败，后续可增加 OCR、编码识别或更稳定的解析链路。';

    return buildCatchStageParsedDocument({
      filePath,
      name,
      ext,
      category,
      bizCategory,
      fallbackSummary,
      topicTags,
      parseStage,
      detailParseQueuedAt: defaultDetailQueuedAt,
      detailParsedAt: defaultDetailParsedAt,
      detailParseAttempts: defaultDetailAttempts,
      schemaType,
      extractionProfile: structuredExtractionProfile,
    });
  }
}
