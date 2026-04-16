import path from 'node:path';
import { type DocumentCategoryConfig } from './document-config.js';
import {
  loadDocumentExtractionGovernance,
  resolveDocumentExtractionProfile,
  type DocumentLibraryContext,
} from './document-extraction-governance.js';
import { deriveSchemaProfile, refreshDerivedSchemaProfile } from './document-schema.js';
import { resolveDocumentMarkdownForFile, supportsMarkItDownExtension } from './document-markdown-provider.js';
import { normalizeText } from './document-parser-text-normalization.js';
import { inferTitle } from './document-parser-metadata.js';
import { excerpt, summarize } from './document-parser-evidence.js';
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
  detectBizCategory as detectBizCategoryForDocument,
  detectCategory as detectCategoryForDocument,
  detectTopicTags,
  mergeGovernedTopicTags,
} from './document-parser-domain-fields.js';
import {
  buildCatchParseResult,
  buildDetailedParseResult,
  buildParseErrorResult,
  buildQuickParseResult,
  buildUnsupportedParseResult,
} from './document-parser-parse-branches.js';
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
  const { imageExtensions, audioExtensions } = buildDocumentParserExtensionSets();

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

    if (parseStatus === 'unsupported') {
      return buildUnsupportedParseResult({
        filePath,
        name,
        ext,
        category,
        bizCategory,
        parseMethod,
        activeText,
        markdownText,
        markdownMethod,
        markdownGeneratedAt,
        markdownError,
        parseStage,
        defaultDetailParseStatus,
        defaultDetailQueuedAt,
        defaultDetailParsedAt,
        defaultDetailAttempts,
        extractionProfile,
        structuredExtractionProfile,
        tableSummary,
        unsupportedSummary: UNSUPPORTED_PARSE_SUMMARY,
      });
    }

    if (parseStatus === 'error') {
      return buildParseErrorResult({
        filePath,
        name,
        ext,
        category,
        bizCategory,
        parseMethod,
        activeText,
        text,
        markdownText,
        markdownMethod,
        markdownGeneratedAt,
        markdownError,
        parseStage,
        defaultDetailParseStatus,
        defaultDetailQueuedAt,
        defaultDetailParsedAt,
        defaultDetailAttempts,
        extractionProfile,
        structuredExtractionProfile,
        tableSummary,
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
      return buildQuickParseResult({
        filePath,
        name,
        ext,
        category,
        bizCategory,
        parseMethod,
        activeText,
        normalizedText,
        summary,
        excerptText,
        inferredTitle,
        canonicalParseStatus,
        topicTags,
        feedbackLibraryKeys,
        markdownText,
        markdownMethod,
        markdownGeneratedAt,
        markdownError,
        parseStage,
        defaultDetailParseStatus,
        defaultDetailQueuedAt,
        defaultDetailParsedAt,
        defaultDetailAttempts,
        extractionProfile,
        structuredExtractionProfile,
        tableSummary,
      });
    }

    return buildDetailedParseResult({
      filePath,
      name,
      ext,
      category,
      bizCategory,
      parseMethod,
      activeText,
      normalizedText,
      summary,
      excerptText,
      inferredTitle,
      canonicalParseStatus,
      topicTags,
      feedbackLibraryKeys,
      markdownText,
      markdownMethod,
      markdownGeneratedAt,
      markdownError,
      parseStage,
      defaultDetailParseStatus,
      defaultDetailQueuedAt,
      defaultDetailParsedAt,
      defaultDetailAttempts,
      extractionProfile,
      structuredExtractionProfile,
      tableSummary,
    });
  } catch {
    const category = detectCategory(filePath);
    const bizCategory = detectBizCategory(filePath, category, '', config);
    return buildCatchParseResult({
      filePath,
      name,
      ext,
      category,
      bizCategory,
      parseStage,
      defaultDetailQueuedAt,
      defaultDetailParsedAt,
      defaultDetailAttempts,
      extractionProfile,
      structuredExtractionProfile,
    });
  }
}
