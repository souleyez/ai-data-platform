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
import { readTextWithBestEffortEncoding } from './document-parser-text-reading.js';
import { extractPdfText as extractPdfTextInternal, renderPdfDocumentToImages as renderPdfDocumentToImagesInternal } from './document-parser-pdf.js';
import { extractPptxTextFromArchive, extractPresentationTextViaPdf as extractPresentationTextViaPdfInternal, renderPresentationDocumentToImages as renderPresentationDocumentToImagesInternal } from './document-parser-presentation.js';
import { extractImageTextWithTesseract as extractImageTextWithTesseractInternal } from './document-parser-ocr.js';
import { extractTextForDocument } from './document-parser-text-extraction.js';
import { extractFootfallFields as extractFootfallFieldsInternal, extractOrderFields as extractOrderFieldsInternal } from './document-parser-table-derived-fields.js';
import {
  buildWorkbookTableSummary,
  flattenSpreadsheetRows,
  normalizeTableColumnKey,
  stripHtmlTags,
} from './document-parser-table-summary.js';
import {
  buildCatchErrorParsedDocument,
  buildDetailedParsedDocument,
  buildParseErrorParsedDocument,
  buildQuickParsedDocument,
  buildUnsupportedParsedDocument,
} from './document-parser-result-builders.js';
import {
  extractContractFields as extractContractFieldsInternal,
  extractEnterpriseGuidanceFields as extractEnterpriseGuidanceFieldsInternal,
  refineEnterpriseGuidanceFields as refineEnterpriseGuidanceFieldsInternal,
} from './document-parser-guidance-fields.js';
import { extractResumeFields as extractResumeFieldsInternal } from './document-parser-resume-fields.js';
import {
  applyGovernedSchemaType as applyGovernedSchemaTypeInternal,
  applyGovernedSchemaTypeWithEnterpriseGuidance as applyGovernedSchemaTypeWithEnterpriseGuidanceInternal,
  detectBizCategory as detectBizCategoryInternal,
  detectCategory as detectCategoryInternal,
  detectRiskLevel as detectRiskLevelInternal,
  detectTopicTags as detectTopicTagsInternal,
  mergeGovernedTopicTags as mergeGovernedTopicTagsInternal,
  shouldForceExtraction,
} from './document-parser-classification.js';
import { buildEvidence, inferTitle } from './document-parser-metadata.js';
import { extractStructuredData } from './document-parser-structured-data.js';
import { excerpt, splitEvidenceChunks, summarize } from './document-parser-evidence.js';
import {
  extractImageTextWithTesseractWithRuntime,
  extractPdfTextWithRuntime,
  extractPresentationTextViaPdfWithRuntime,
  inferParseMethod,
  shouldAttemptDetailedMarkdownResolution,
  shouldPreserveLegacyAuxiliaryExtraction,
  shouldTreatLegacyExtractionAsCanonical,
  withTemporaryAsciiCopy,
} from './document-parser-runtime.js';

export { deriveSchemaProfile, refreshDerivedSchemaProfile } from './document-schema.js';

export type ParsedDocument = {
  path: string;
  name: string;
  ext: string;
  title: string;
  category: string;
  bizCategory: 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory' | 'footfall' | 'general';
  groupConfirmedAt?: string;
  parseStatus: 'parsed' | 'unsupported' | 'error';
  parseMethod?: string;
  summary: string;
  excerpt: string;
  fullText?: string;
  markdownText?: string;
  markdownMethod?: string;
  markdownGeneratedAt?: string;
  markdownError?: string;
  canonicalParseStatus?: 'ready' | 'fallback_full_text' | 'failed' | 'unsupported';
  extractedChars: number;
  evidenceChunks?: EvidenceChunk[];
  entities?: StructuredEntity[];
  claims?: StructuredClaim[];
  intentSlots?: IntentSlots;
  resumeFields?: ResumeFields;
  riskLevel?: 'low' | 'medium' | 'high';
  topicTags?: string[];
  groups?: string[];
  confirmedGroups?: string[];
  suggestedGroups?: string[];
  ignored?: boolean;
  contractFields?: {
    contractNo?: string;
    partyA?: string;
    partyB?: string;
    amount?: string;
    signDate?: string;
    effectiveDate?: string;
    paymentTerms?: string;
    duration?: string;
  };
  enterpriseGuidanceFields?: {
    businessSystem?: string;
    documentKind?: string;
    applicableScope?: string;
    operationEntry?: string;
    approvalLevels?: string[];
    policyFocus?: string[];
    contacts?: string[];
  };
  orderFields?: {
    period?: string;
    platform?: string;
    orderCount?: string;
    netSales?: string;
    grossMargin?: string;
    topCategory?: string;
    inventoryStatus?: string;
    replenishmentAction?: string;
  };
  footfallFields?: {
    period?: string;
    totalFootfall?: string;
    topMallZone?: string;
    mallZoneCount?: string;
    aggregationLevel?: string;
  };
  retentionStatus?: 'structured-only';
  retainedAt?: string;
  originalDeletedAt?: string;
  cloudStructuredAt?: string;
  cloudStructuredModel?: string;
  parseStage?: 'quick' | 'detailed';
  detailParseStatus?: 'queued' | 'processing' | 'succeeded' | 'failed';
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts?: number;
  detailParseError?: string;
  analysisEditedAt?: string;
  manualSummary?: boolean;
  manualStructuredProfile?: boolean;
  manualEvidenceChunks?: boolean;
  schemaType?: 'generic' | 'contract' | 'resume' | 'paper' | 'formula' | 'technical' | 'report' | 'order';
  structuredProfile?: Record<string, unknown>;
};

export type EvidenceChunk = {
  id: string;
  order: number;
  text: string;
  charLength: number;
  page?: number;
  sectionTitle?: string;
  regionHint?: string;
  title?: string;
};

export type TableSheetSummary = {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  sampleRows: Array<Record<string, string>>;
  recordKeyField?: string;
  recordFieldRoles?: TableRecordFieldRoles;
  recordRows?: TableStructuredRow[];
  recordInsights?: TableRecordInsightSummary;
  insights?: TableInsightSummary;
};

export type TableRecordFieldRoles = {
  periodField?: string;
  platformField?: string;
  categoryField?: string;
  skuField?: string;
  mallZoneField?: string;
  floorZoneField?: string;
  roomUnitField?: string;
  footfallField?: string;
  orderCountField?: string;
  quantityField?: string;
  netSalesField?: string;
  grossAmountField?: string;
  refundAmountField?: string;
  grossProfitField?: string;
  grossMarginField?: string;
  inventoryBeforeField?: string;
  inventoryAfterField?: string;
  inventoryRiskField?: string;
  recommendationField?: string;
  replenishmentPriorityField?: string;
};

export type TableRecordAlert = {
  type: 'low_margin' | 'high_refund' | 'inventory_risk';
  rowNumber: number;
  keyValue?: string;
  severity: 'medium' | 'high';
  message: string;
};

export type TablePlatformBreakdown = {
  platform: string;
  rowCount: number;
  netSales: number;
  inventoryRiskRowCount: number;
};

export type TableMallZoneBreakdown = {
  mallZone: string;
  rowCount: number;
  footfall: number;
  floorZoneCount: number;
  roomUnitCount: number;
};

export type TableCategoryBreakdown = {
  category: string;
  rowCount: number;
  netSales: number;
  inventoryRiskRowCount: number;
};

export type TableSkuNetSalesSummary = {
  sku: string;
  platform?: string;
  rowCount: number;
  netSales: number;
  inventoryStatus?: string;
};

export type TableInventoryRiskBreakdown = {
  inventoryStatus: string;
  count: number;
};

export type TableRecordInsightSummary = {
  topPlatforms?: string[];
  topCategories?: string[];
  topMallZones?: string[];
  totalFootfall?: number;
  lowMarginRowCount?: number;
  highRefundRowCount?: number;
  inventoryRiskRowCount?: number;
  topRiskSkus?: string[];
  priorityReplenishmentItems?: string[];
  refundHotspots?: string[];
  platformBreakdown?: TablePlatformBreakdown[];
  categoryBreakdown?: TableCategoryBreakdown[];
  mallZoneBreakdown?: TableMallZoneBreakdown[];
  topSkuNetSales?: TableSkuNetSalesSummary[];
  inventoryRiskBreakdown?: TableInventoryRiskBreakdown[];
  alerts?: TableRecordAlert[];
};

export type TableStructuredRow = {
  rowNumber: number;
  keyValue?: string;
  values: Record<string, string>;
  derivedFields?: Record<string, string>;
};

export type TableDateSummary = {
  column: string;
  min: string;
  max: string;
  distinctCount: number;
  granularity: 'month' | 'date' | 'datetime';
};

export type TableMetricSummary = {
  column: string;
  kind: 'number' | 'currency' | 'percent';
  nonEmptyCount: number;
  min: number;
  max: number;
  sum: number;
  avg: number;
};

export type TableDimensionValueSummary = {
  value: string;
  count: number;
};

export type TableDimensionSummary = {
  column: string;
  distinctCount: number;
  topValues: TableDimensionValueSummary[];
};

export type TableInsightSummary = {
  dateColumns?: TableDateSummary[];
  metricColumns?: TableMetricSummary[];
  dimensionColumns?: TableDimensionSummary[];
};

export type TableSummary = {
  format: 'csv' | 'xlsx';
  rowCount: number;
  columnCount: number;
  columns: string[];
  sampleRows: Array<Record<string, string>>;
  sheetCount: number;
  primarySheetName?: string;
  recordKeyField?: string;
  recordFieldRoles?: TableRecordFieldRoles;
  recordRows?: TableStructuredRow[];
  recordInsights?: TableRecordInsightSummary;
  sheets?: TableSheetSummary[];
  insights?: TableInsightSummary;
};

export type StructuredEntity = {
  text: string;
  type: 'ingredient' | 'strain' | 'audience' | 'benefit' | 'dose' | 'organization' | 'metric' | 'identifier' | 'term';
  source: 'rule' | 'uie';
  confidence: number;
  evidenceChunkId?: string;
};

export type StructuredClaim = {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  evidenceChunkId?: string;
};

export type IntentSlots = {
  audiences?: string[];
  ingredients?: string[];
  strains?: string[];
  benefits?: string[];
  doses?: string[];
  organizations?: string[];
  metrics?: string[];
};

export type ResumeFields = {
  candidateName?: string;
  targetRole?: string;
  currentRole?: string;
  yearsOfExperience?: string;
  education?: string;
  major?: string;
  expectedCity?: string;
  expectedSalary?: string;
  latestCompany?: string;
  companies?: string[];
  skills?: string[];
  highlights?: string[];
  projectHighlights?: string[];
  itProjectHighlights?: string[];
};

export type ParseDocumentOptions = {
  stage?: 'quick' | 'detailed';
  libraryContext?: DocumentLibraryContext;
  resolveMarkdown?: typeof resolveDocumentMarkdownForFile;
};

export const DOCUMENT_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'] as const;
export const DOCUMENT_PRESENTATION_EXTENSIONS = ['.ppt', '.pptx', '.pptm'] as const;
export const DOCUMENT_AUDIO_EXTENSIONS = ['.wav', '.mp3'] as const;
export const DOCUMENT_PARSE_SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.xlsx',
  '.xls',
  '.epub',
  ...DOCUMENT_AUDIO_EXTENSIONS,
  ...DOCUMENT_PRESENTATION_EXTENSIONS,
  ...DOCUMENT_IMAGE_EXTENSIONS,
] as const;
const IMAGE_EXTENSIONS = new Set<string>(DOCUMENT_IMAGE_EXTENSIONS);
const PRESENTATION_EXTENSIONS = new Set<string>(DOCUMENT_PRESENTATION_EXTENSIONS);
const AUDIO_EXTENSIONS = new Set<string>(DOCUMENT_AUDIO_EXTENSIONS);
const UNSUPPORTED_PARSE_SUMMARY = '当前版本暂未支持该文件类型的正文提取。已支持 pdf、txt、md、docx、csv、json、html、xml、xlsx、xls、epub、wav、mp3、ppt、pptx、pptm、png、jpg、jpeg、webp、gif、bmp。';

export async function renderPresentationDocumentToImages(filePath: string, options?: { maxSlides?: number }) {
  return renderPresentationDocumentToImagesInternal(filePath, options, { withTemporaryAsciiCopy });
}

export async function renderPdfDocumentToImages(filePath: string, options?: { maxPages?: number }) {
  return renderPdfDocumentToImagesInternal(filePath, options);
}

async function extractPresentationTextViaPdf(filePath: string) {
  return extractPresentationTextViaPdfWithRuntime(filePath, {
    normalizeText,
    withTemporaryAsciiCopy,
    extractPresentationTextViaPdfInternal,
  });
}

async function extractPdfText(filePath: string) {
  return extractPdfTextWithRuntime(filePath, {
    normalizeText,
    withTemporaryAsciiCopy,
    extractPdfTextInternal,
  });
}

async function extractImageTextWithTesseract(filePath: string) {
  return extractImageTextWithTesseractWithRuntime(filePath, {
    normalizeText,
    withTemporaryAsciiCopy,
    extractImageTextWithTesseractInternal,
  });
}


export function detectCategory(filePath: string, text = '') {
  return detectCategoryInternal(filePath, text);
}

export function detectBizCategory(filePath: string, category: string, text = '', config?: DocumentCategoryConfig): ParsedDocument['bizCategory'] {
  return detectBizCategoryInternal(filePath, category, text, config);
}

function extractResumeFields(
  text: string,
  title: string,
  entities: StructuredEntity[] = [],
  claims: StructuredClaim[] = [],
  options?: { force?: boolean },
): ResumeFields | undefined {
  return extractResumeFieldsInternal(text, title, entities, claims, options);
}

function detectRiskLevel(text: string, category: string): 'low' | 'medium' | 'high' | undefined {
  return detectRiskLevelInternal(text, category);
}

function detectTopicTags(text: string, category: string, bizCategory: ParsedDocument['bizCategory']) {
  return detectTopicTagsInternal(text, category, bizCategory);
}

function applyGovernedSchemaType(
  inferredSchemaType: ParsedDocument['schemaType'],
  profile: DocumentExtractionProfile | null | undefined,
): ParsedDocument['schemaType'] {
  return applyGovernedSchemaTypeInternal(inferredSchemaType, profile);
}

function applyGovernedSchemaTypeWithEnterpriseGuidance(
  inferredSchemaType: ParsedDocument['schemaType'],
  profile: DocumentExtractionProfile | null | undefined,
  enterpriseGuidanceFields: ParsedDocument['enterpriseGuidanceFields'] | undefined,
): ParsedDocument['schemaType'] {
  return applyGovernedSchemaTypeWithEnterpriseGuidanceInternal(inferredSchemaType, profile, enterpriseGuidanceFields);
}

function mergeGovernedTopicTags(topicTags: string[], profile: DocumentExtractionProfile | null | undefined) {
  return mergeGovernedTopicTagsInternal(topicTags, profile);
}

function extractContractFields(text: string, category: string, profile?: DocumentExtractionProfile | null) {
  return extractContractFieldsInternal(text, category, profile, { shouldForceExtraction });
}

function extractEnterpriseGuidanceFields(
  text: string,
  title: string,
  topicTags: string[],
  category: string,
  profile?: DocumentExtractionProfile | null,
): ParsedDocument['enterpriseGuidanceFields'] | undefined {
  return extractEnterpriseGuidanceFieldsInternal(text, title, topicTags, category, profile, {
    shouldForceExtraction,
  });
}

function refineEnterpriseGuidanceFields(
  fields: ParsedDocument['enterpriseGuidanceFields'] | undefined,
  input: {
    text: string;
    title: string;
    topicTags: string[];
    profile?: DocumentExtractionProfile | null;
  },
): ParsedDocument['enterpriseGuidanceFields'] | undefined {
  return refineEnterpriseGuidanceFieldsInternal(fields, input, { shouldForceExtraction });
}

function extractOrderFields(
  text: string,
  title: string,
  bizCategory: ParsedDocument['bizCategory'],
  topicTags: string[],
  profile?: DocumentExtractionProfile | null,
  tableSummary?: TableSummary,
): ParsedDocument['orderFields'] | undefined {
  return extractOrderFieldsInternal(text, title, bizCategory, topicTags, profile, tableSummary, {
    normalizeTableColumnKey,
    shouldForceExtraction,
  });
}

function extractFootfallFields(
  text: string,
  title: string,
  bizCategory: ParsedDocument['bizCategory'],
  topicTags: string[],
  tableSummary?: TableSummary,
): ParsedDocument['footfallFields'] | undefined {
  return extractFootfallFieldsInternal(text, title, bizCategory, topicTags, tableSummary, {
    normalizeTableColumnKey,
    shouldForceExtraction,
  });
}

async function extractText(filePath: string, ext: string) {
  const result = await extractTextForDocument(filePath, ext, {
    readTextWithBestEffortEncoding,
    extractPdfText,
    extractPptxTextFromArchive,
    extractPresentationTextViaPdf,
    extractImageTextWithTesseract,
    buildWorkbookTableSummary,
    flattenSpreadsheetRows,
    stripHtmlTags,
    normalizeText,
    imageExtensions: IMAGE_EXTENSIONS,
  });
  return result as {
    status: 'parsed' | 'error' | 'unsupported';
    text: string;
    parseMethod?: string;
    tableSummary?: TableSummary;
  };
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

  try {
    let status: 'parsed' | 'unsupported' | 'error' = 'unsupported';
    let text = '';
    let hintedMethod: string | undefined;
    let tableSummary: TableSummary | undefined;
    let parseStatus: 'parsed' | 'unsupported' | 'error' = 'unsupported';
    let activeText = '';
    let parseMethod = inferParseMethod(ext, '', undefined, {
      imageExtensions: IMAGE_EXTENSIONS,
      audioExtensions: AUDIO_EXTENSIONS,
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
            imageExtensions: IMAGE_EXTENSIONS,
            audioExtensions: AUDIO_EXTENSIONS,
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
      const contractFields = applyDocumentParseFeedback({
        libraryKeys: feedbackLibraryKeys,
        schemaType: 'contract',
        text: quickText,
        fields: extractContractFields(quickText, category, extractionProfile),
      });
      const resumeFields = applyDocumentParseFeedback({
        libraryKeys: feedbackLibraryKeys,
        schemaType: 'resume',
        text: quickText,
        fields: extractResumeFields(
          quickText,
          inferredTitle,
          [],
          [],
          { force: shouldForceExtraction(extractionProfile, 'resume') },
        ),
      });
      const enterpriseGuidanceFields = applyDocumentParseFeedback({
        libraryKeys: feedbackLibraryKeys,
        schemaType: 'technical',
        text: quickText,
        fields: refineEnterpriseGuidanceFields(
          extractEnterpriseGuidanceFields(quickText, inferredTitle, topicTags, category, extractionProfile),
          {
            text: quickText,
            title: inferredTitle,
            topicTags,
            profile: extractionProfile,
          },
        ),
      });
      const orderFields = applyDocumentParseFeedback({
        libraryKeys: feedbackLibraryKeys,
        schemaType: 'order',
        text: quickText,
        fields: extractOrderFields(quickText, inferredTitle, bizCategory, topicTags, extractionProfile, tableSummary),
      });
      const footfallFields = extractFootfallFields(
        quickText,
        inferredTitle,
        bizCategory,
        topicTags,
        tableSummary,
      );
      const schemaType = applyGovernedSchemaTypeWithEnterpriseGuidance(
        inferSchemaType(category, bizCategory, resumeFields, topicTags, inferredTitle, summary),
        extractionProfile,
        enterpriseGuidanceFields,
      );
      return buildQuickParsedDocument({
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
        evidenceChunks: [],
        entities: [],
        claims: [],
        intentSlots: {},
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
        structuredProfile: buildStructuredProfile({
          schemaType,
          title: inferredTitle,
          topicTags,
          summary,
          contractFields,
          enterpriseGuidanceFields,
          orderFields,
          footfallFields,
          resumeFields,
          evidenceChunks: [],
          tableSummary,
          extractionProfile: structuredExtractionProfile,
        }),
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
    const resumeFields = applyDocumentParseFeedback({
      libraryKeys: feedbackLibraryKeys,
      schemaType: 'resume',
      text: activeText,
      fields: extractResumeFields(
        activeText,
        inferredTitle,
        structured.entities,
        structured.claims,
        { force: shouldForceExtraction(extractionProfile, 'resume') },
      ),
    });
    const enterpriseGuidanceFields = applyDocumentParseFeedback({
      libraryKeys: feedbackLibraryKeys,
      schemaType: 'technical',
      text: activeText,
      fields: refineEnterpriseGuidanceFields(
        extractEnterpriseGuidanceFields(activeText, inferredTitle, topicTags, category, extractionProfile),
        {
          text: activeText,
          title: inferredTitle,
          topicTags,
          profile: extractionProfile,
        },
      ),
    });
    const orderFields = applyDocumentParseFeedback({
      libraryKeys: feedbackLibraryKeys,
      schemaType: 'order',
      text: activeText,
      fields: extractOrderFields(activeText, inferredTitle, bizCategory, topicTags, extractionProfile, tableSummary),
    });
    const footfallFields = extractFootfallFields(
      activeText,
      inferredTitle,
      bizCategory,
      topicTags,
      tableSummary,
    );
    const schemaType = applyGovernedSchemaTypeWithEnterpriseGuidance(
      inferSchemaType(category, bizCategory, resumeFields, topicTags, inferredTitle, summary),
      extractionProfile,
      enterpriseGuidanceFields,
    );

    return buildDetailedParsedDocument({
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
      intentSlots: structured.intentSlots,
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
      structuredProfile: buildStructuredProfile({
        schemaType,
        title: inferredTitle,
        topicTags,
        summary,
        contractFields,
        enterpriseGuidanceFields,
        orderFields,
        footfallFields,
        resumeFields,
        evidenceChunks,
        tableSummary,
        extractionProfile: structuredExtractionProfile,
      }),
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

    return buildCatchErrorParsedDocument({
      filePath,
      name,
      ext,
      title: path.parse(name).name,
      category,
      bizCategory,
      parseMethod: 'error',
      fallbackSummary,
      markdownText: undefined,
      markdownMethod: undefined,
      markdownGeneratedAt: undefined,
      markdownError: undefined,
      canonicalParseStatus: 'failed',
      topicTags,
      parseStage,
      detailParseStatus: parseStage === 'quick' ? 'queued' : 'failed',
      detailParseQueuedAt: defaultDetailQueuedAt,
      detailParsedAt: defaultDetailParsedAt,
      detailParseAttempts: defaultDetailAttempts,
      detailParseError: parseStage === 'detailed' ? 'parse-error' : undefined,
      schemaType,
      structuredProfile: buildStructuredProfile({
        schemaType,
        title: path.parse(name).name,
        topicTags,
        summary: fallbackSummary,
        evidenceChunks: [],
        tableSummary: undefined,
        extractionProfile: structuredExtractionProfile,
      }),
    });
  }
}
