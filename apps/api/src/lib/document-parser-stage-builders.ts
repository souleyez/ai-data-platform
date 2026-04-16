import path from 'node:path';
import { buildStructuredProfile, isLikelyResumePersonName } from './document-schema.js';
import {
  buildCatchErrorParsedDocument,
  buildDetailedParsedDocument,
  buildQuickParsedDocument,
} from './document-parser-result-builders.js';
import type {
  EvidenceChunk,
  ParsedDocument,
  StructuredClaim,
  StructuredEntity,
  TableSummary,
} from './document-parser-types.js';
import type { DocumentExtractionProfile } from './document-extraction-governance.js';

const RESUME_TITLE_FIELD_LABEL_PATTERN = /^(?:技能|技能标签|核心技能|专业技能|技术栈|项目经历|工作经历|教育经历|求职意向|目标岗位|应聘岗位|当前职位|最近公司|现任公司|姓名|name|候选人|年龄|工作经验|学历|专业|期望城市|意向城市|期望薪资|薪资要求)[:：]/i;
const RESUME_TITLE_SKILL_LIST_PATTERN = /(java|python|react|go|sql|mysql|redis|kafka|spring|vue|node(?:\.js)?|typescript|javascript|微服务|erp|数据平台|axure|xmind|数据分析|项目管理|产品设计)/i;

function formatResumeDocumentTitle(candidateName: string) {
  return /[A-Za-z]/.test(candidateName) && !/[\u4e00-\u9fff]/.test(candidateName)
    ? `${candidateName} Resume`
    : `${candidateName}简历`;
}

function resolveParsedDocumentTitle(input: Pick<SharedStageInput, 'title' | 'schemaType' | 'resumeFields'>) {
  const title = String(input.title || '').trim();
  if (input.schemaType !== 'resume') return title;

  const candidateName = String(input.resumeFields?.candidateName || '').trim();
  if (!isLikelyResumePersonName(candidateName)) return title;

  const preferredTitle = formatResumeDocumentTitle(candidateName);
  if (!title) return preferredTitle;
  if (title === preferredTitle) return title;
  if (/^(?:个人简历|简历|resume|cv)$/i.test(title)) return preferredTitle;
  if (RESUME_TITLE_FIELD_LABEL_PATTERN.test(title)) return preferredTitle;
  if (!title.includes(candidateName) && /[、,，/|]/.test(title) && RESUME_TITLE_SKILL_LIST_PATTERN.test(title)) {
    return preferredTitle;
  }
  return title;
}

type SharedStageInput = {
  filePath: string;
  name: string;
  ext: string;
  title: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  parseMethod: string;
  summary: string;
  excerpt: string;
  fullText: string;
  markdownText: string;
  markdownMethod: ParsedDocument['markdownMethod'];
  markdownGeneratedAt?: string;
  markdownError?: string;
  canonicalParseStatus: ParsedDocument['canonicalParseStatus'];
  extractedChars: number;
  topicTags: string[];
  parseStage: 'quick' | 'detailed';
  detailParseStatus: ParsedDocument['detailParseStatus'];
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts: number;
  schemaType: ParsedDocument['schemaType'];
  extractionProfile: DocumentExtractionProfile | undefined;
  tableSummary?: TableSummary;
  contractFields?: ParsedDocument['contractFields'];
  enterpriseGuidanceFields?: ParsedDocument['enterpriseGuidanceFields'];
  orderFields?: ParsedDocument['orderFields'];
  footfallFields?: ParsedDocument['footfallFields'];
  resumeFields?: ParsedDocument['resumeFields'];
  riskLevel?: ParsedDocument['riskLevel'];
};

export function buildQuickStageParsedDocument(
  input: SharedStageInput,
) {
  const resolvedTitle = resolveParsedDocumentTitle(input);
  return buildQuickParsedDocument({
    ...input,
    title: resolvedTitle,
    evidenceChunks: [],
    entities: [],
    claims: [],
    intentSlots: {},
    structuredProfile: buildStructuredProfile({
      schemaType: input.schemaType,
      title: resolvedTitle,
      topicTags: input.topicTags,
      summary: input.summary,
      contractFields: input.contractFields,
      enterpriseGuidanceFields: input.enterpriseGuidanceFields,
      orderFields: input.orderFields,
      footfallFields: input.footfallFields,
      resumeFields: input.resumeFields,
      evidenceChunks: [],
      tableSummary: input.tableSummary,
      extractionProfile: input.extractionProfile,
    }),
  });
}

type DetailedStageInput = SharedStageInput & {
  evidenceChunks: EvidenceChunk[];
  entities: StructuredEntity[];
  claims: StructuredClaim[];
  intentSlots: NonNullable<ParsedDocument['intentSlots']>;
};

export function buildDetailedStageParsedDocument(
  input: DetailedStageInput,
) {
  const resolvedTitle = resolveParsedDocumentTitle(input);
  return buildDetailedParsedDocument({
    ...input,
    title: resolvedTitle,
    structuredProfile: buildStructuredProfile({
      schemaType: input.schemaType,
      title: resolvedTitle,
      topicTags: input.topicTags,
      summary: input.summary,
      contractFields: input.contractFields,
      enterpriseGuidanceFields: input.enterpriseGuidanceFields,
      orderFields: input.orderFields,
      footfallFields: input.footfallFields,
      resumeFields: input.resumeFields,
      evidenceChunks: input.evidenceChunks,
      tableSummary: input.tableSummary,
      extractionProfile: input.extractionProfile,
    }),
  });
}

type CatchStageInput = {
  filePath: string;
  name: string;
  ext: string;
  category: string;
  bizCategory: ParsedDocument['bizCategory'];
  fallbackSummary: string;
  topicTags: string[];
  parseStage: 'quick' | 'detailed';
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts: number;
  schemaType: ParsedDocument['schemaType'];
  extractionProfile: DocumentExtractionProfile | undefined;
};

export function buildCatchStageParsedDocument(input: CatchStageInput) {
  return buildCatchErrorParsedDocument({
    filePath: input.filePath,
    name: input.name,
    ext: input.ext,
    title: path.parse(input.name).name,
    category: input.category,
    bizCategory: input.bizCategory,
    parseMethod: 'error',
    fallbackSummary: input.fallbackSummary,
    markdownText: undefined,
    markdownMethod: undefined,
    markdownGeneratedAt: undefined,
    markdownError: undefined,
    canonicalParseStatus: 'failed',
    topicTags: input.topicTags,
    parseStage: input.parseStage,
    detailParseStatus: input.parseStage === 'quick' ? 'queued' : 'failed',
    detailParseQueuedAt: input.detailParseQueuedAt,
    detailParsedAt: input.detailParsedAt,
    detailParseAttempts: input.detailParseAttempts,
    detailParseError: input.parseStage === 'detailed' ? 'parse-error' : undefined,
    schemaType: input.schemaType,
    structuredProfile: buildStructuredProfile({
      schemaType: input.schemaType,
      title: path.parse(input.name).name,
      topicTags: input.topicTags,
      summary: input.fallbackSummary,
      evidenceChunks: [],
      tableSummary: undefined,
      extractionProfile: input.extractionProfile,
    }),
  });
}
