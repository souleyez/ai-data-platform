import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import { UNGROUPED_LIBRARY_KEY, type DocumentLibrary } from './document-libraries.js';

export type IngestPreviewItem = {
  id: string;
  sourceType: 'file' | 'url';
  sourceName: string;
  path?: string;
  status: 'success' | 'failed';
  preview?: {
    title: string;
    summary: string;
    docType: string;
  };
  recommendation?: {
    reason: string;
  };
  groupSuggestion?: {
    suggestedGroups: Array<{ key: string; label: string }>;
    basis: string;
    accepted?: boolean;
  };
  errorMessage?: string;
};

const LIBRARY_TERM_ALIASES: Array<{ pattern: RegExp; terms: string[] }> = [
  {
    pattern: /(奶粉|配方|formula|乳粉|婴配粉)/i,
    terms: ['奶粉', '配方', '乳粉', '婴配粉', '婴幼儿配方', 'formula', 'infant', 'pediatric', 'nutrition', 'probiotic', 'prebiotic', 'synbiotic', 'lactobacillus', 'bifidobacterium', 'hmo', 'hmos'],
  },
  {
    pattern: /(肠道|gut|菌群|microbiome)/i,
    terms: ['肠道', 'gut', '菌群', 'microbiome', 'flora', 'intestinal', 'probiotic', 'prebiotic', 'lactobacillus', 'bifidobacterium'],
  },
  {
    pattern: /(脑|brain|认知)/i,
    terms: ['脑', 'brain', '认知', 'cognitive', 'neuro', 'dha', 'omega-3'],
  },
];

const RESUME_LIBRARY_PATTERN = /(简历|resume|cv|候选人|人才|recruit|recruitment|candidate)/i;

function toDocumentTypeLabel(doc: ParsedDocument) {
  if (doc.schemaType) return String(doc.schemaType);
  if (doc.category) return String(doc.category);
  return String(doc.ext || '').replace(/^\./, '') || 'generic';
}

function expandLibraryTerms(library: DocumentLibrary) {
  const baseTerms = [library.key, library.label, library.description]
    .filter(Boolean)
    .flatMap((text) => String(text).toLowerCase().split(/[\s,，。|()-]+/))
    .filter((term) => term.length >= 2);

  const expanded = new Set(baseTerms);
  const joined = [library.key, library.label, library.description].filter(Boolean).join(' ');

  for (const alias of LIBRARY_TERM_ALIASES) {
    if (alias.pattern.test(joined)) {
      alias.terms.forEach((term) => expanded.add(term.toLowerCase()));
    }
  }

  return [...expanded];
}

function scoreLibrarySuggestion(doc: ParsedDocument, library: DocumentLibrary) {
  if (library.key === UNGROUPED_LIBRARY_KEY) {
    return 0;
  }

  const libraryText = [library.key, library.label, library.description].filter(Boolean).join(' ');
  const isResumeDocument = doc.category === 'resume' || doc.schemaType === 'resume';

  if (isResumeDocument) {
    if (!RESUME_LIBRARY_PATTERN.test(libraryText)) {
      return 0;
    }

    const evidence = [
      doc.title,
      doc.summary,
      doc.excerpt,
      ...(doc.topicTags || []),
      ...(doc.groups || []),
    ]
      .join(' ')
      .toLowerCase();

    const libraryTerms = expandLibraryTerms(library);
    const termScore = libraryTerms.reduce((score, term) => {
      if (!term) return score;
      if (evidence.includes(term)) return score + (term.length >= 4 ? 3 : 2);
      return score;
    }, 0);

    return 12 + termScore;
  }
  const evidence = [
    doc.title,
    doc.summary,
    doc.excerpt,
    ...(doc.topicTags || []),
    ...(doc.groups || []),
  ]
    .join(' ')
    .toLowerCase();

  const libraryTerms = expandLibraryTerms(library);

  return libraryTerms.reduce((score, term) => {
    if (!term) return score;
    if (evidence.includes(term)) return score + (term.length >= 4 ? 3 : 2);
    return score;
  }, 0);
}

export function resolveSuggestedLibraryKeys(doc: ParsedDocument, libraries: DocumentLibrary[] = []) {
  return libraries
    .map((library) => ({ library, score: scoreLibrarySuggestion(doc, library) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((entry) => entry.library.key);
}

function buildGroupSuggestion(doc: ParsedDocument, libraries: DocumentLibrary[] = []) {
  const confirmedGroups = doc.confirmedGroups?.length ? doc.confirmedGroups : [];
  if (confirmedGroups.length) {
    return {
      suggestedGroups: confirmedGroups.map((key) => ({
        key,
        label: libraries.find((item) => item.key === key)?.label || key,
      })),
      basis: `已确认加入知识库：${confirmedGroups.map((key) => libraries.find((item) => item.key === key)?.label || key).join('、')}。`,
      accepted: true,
    };
  }

  const suggestedGroups = doc.suggestedGroups?.length ? doc.suggestedGroups : [];
  if (suggestedGroups.length) {
    const matchedSuggestions = suggestedGroups
      .map((key) => libraries.find((item) => item.key === key) || ({ key, label: key } as DocumentLibrary));
    return {
      suggestedGroups: matchedSuggestions.map((library) => ({ key: library.key, label: library.label })),
      basis: `根据标题、摘要和主题标签，建议加入：${matchedSuggestions.map((library) => library.label).join('、')}。`,
      accepted: false,
    };
  }

  const matchedKeys = resolveSuggestedLibraryKeys(doc, libraries);
  const matched = matchedKeys
    .map((key) => libraries.find((library) => library.key === key))
    .filter(Boolean) as DocumentLibrary[];

  if (!matched.length) {
    return {
      suggestedGroups: [],
      basis: '未命中合适的现有知识库，默认保持未分组。',
      accepted: true,
    };
  }

  return {
    suggestedGroups: matched.map((library) => ({ key: library.key, label: library.label })),
    basis: `根据标题、摘要和主题命中，建议自动加入：${matched.map((library) => library.label).join('、')}。`,
    accepted: false,
  };
}

function buildReason(doc: ParsedDocument) {
  if (doc.parseStatus === 'unsupported') return '文件已接收，但当前版本暂不支持该类型正文提取；可先通过知识库分组继续管理。';
  if (doc.parseStatus === 'error') return '文件已接收，但本次解析失败；当前建议主要依据文件名、摘要和已有知识库线索。';
  if (doc.topicTags?.length) return `检测到 ${doc.topicTags.slice(0, 3).join('、')} 等主题特征，可继续结合知识库分组管理。`;
  return '当前已依据文件名、摘要和正文特征生成解析结果，并给出知识库分组建议。';
}

export function buildPreviewItemFromDocument(
  doc: ParsedDocument,
  sourceType: 'file' | 'url' = 'file',
  sourceName?: string,
  libraries: DocumentLibrary[] = [],
): IngestPreviewItem {
  return {
    id: Buffer.from(doc.path).toString('base64url'),
    sourceType,
    sourceName: sourceName || doc.name,
    path: doc.path,
    status: 'success',
    preview: {
      title: doc.title || path.parse(doc.name).name,
      summary: doc.summary,
      docType: toDocumentTypeLabel(doc),
    },
    recommendation: {
      reason: buildReason(doc),
    },
    groupSuggestion: buildGroupSuggestion(doc, libraries),
  };
}

export function buildFailedPreviewItem(input: { id: string; sourceType: 'file' | 'url'; sourceName: string; errorMessage: string }): IngestPreviewItem {
  return {
    id: input.id,
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    status: 'failed',
    errorMessage: input.errorMessage,
  };
}
