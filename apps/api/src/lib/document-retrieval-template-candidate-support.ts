import path from 'node:path';
import type { ParsedDocument } from './document-parser.js';
import {
  isFootfallDocumentSignal,
  isIotDocumentSignal,
  isPaperDocumentSignal,
} from './document-domain-signals.js';
import { STORAGE_FILES_DIR } from './paths.js';
import { containsAny } from './document-retrieval-heuristics.js';
import type { TemplateTask } from './document-retrieval-template-candidate-types.js';

function startsWithPath(filePath: string, rootPath: string) {
  const normalizedFile = path.resolve(String(filePath || '')).toLowerCase();
  const normalizedRoot = path.resolve(String(rootPath || '')).toLowerCase();
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${path.sep}`.toLowerCase());
}

export function hasFormulaLibraryBias(item: ParsedDocument) {
  const text = [
    ...(item.confirmedGroups || []),
    ...(item.groups || []),
    ...(item.topicTags || []),
    item.title || '',
    item.summary || '',
  ]
    .join(' ')
    .toLowerCase();

  return containsAny(text, ['formula', '配方', '奶粉', '益生菌', '菌株', 'ingredient', 'strain', 'hmo', 'gut-health', 'brain-health']);
}

function hasPaperSignals(item: ParsedDocument) {
  const profileText = JSON.stringify(item.structuredProfile || {}).toLowerCase();
  return containsAny(profileText, [
    'methodology',
    'subjecttype',
    'resultsignals',
    'metricsignals',
    'publicationsignals',
  ]);
}

function isCapturedWebArtifact(item: ParsedDocument) {
  const normalizedName = String(item.name || '').toLowerCase();
  const normalizedPath = String(item.path || '').toLowerCase();
  return (
    normalizedName.startsWith('web-')
    || normalizedPath.includes('\\captures\\')
    || normalizedPath.includes('/captures/')
    || normalizedPath.includes('\\web-captures\\')
    || normalizedPath.includes('/web-captures/')
  );
}

export function isStoredKnowledgeDocument(item: ParsedDocument) {
  return startsWithPath(item.path, STORAGE_FILES_DIR);
}

export function isHighValueKnowledgeDocument(item: ParsedDocument) {
  return Boolean(
    isStoredKnowledgeDocument(item)
    || (item.confirmedGroups?.length || 0) > 0
    || (item.groups?.length || 0) > 0
    || item.cloudStructuredAt,
  );
}

function isPaperLikeDocument(item: ParsedDocument) {
  return isPaperDocumentSignal(item);
}

export function isPurePaperCandidate(item: ParsedDocument) {
  if (!isPaperLikeDocument(item)) return false;
  if (isCapturedWebArtifact(item)) return false;
  if (hasFormulaLibraryBias(item)) return false;
  return item.schemaType === 'paper' || hasPaperSignals(item) || (item.claims?.length || 0) >= 2;
}

export function isReliableResumeCandidate(item: ParsedDocument) {
  if (item.schemaType !== 'resume') return false;
  const evidence = `${item.title || item.name || ''} ${item.summary || ''}`.toLowerCase();
  const hasResumeHint = containsAny(evidence, ['resume', 'cv', 'curriculum vitae', '简历', '候选人', '求职', '应聘']);
  const ext = String(item.ext || '').toLowerCase();
  const isResumeFriendlyFile = ['.pdf', '.doc', '.docx'].includes(ext);
  const fields = (item.resumeFields || {}) as Record<string, unknown>;
  const candidateName = String(fields.candidateName || '').trim();
  const latestCompany = String(fields.latestCompany || '').trim();
  const education = String(fields.education || '').trim();
  const currentRole = String(fields.currentRole || '').trim();
  const targetRole = String(fields.targetRole || '').trim();
  const yearsOfExperience = String(fields.yearsOfExperience || '').trim();
  const skills = Array.isArray(fields.skills) ? fields.skills.map((entry) => String(entry || '').trim()).filter(Boolean) : [];
  const strongFieldCount = [latestCompany, education, currentRole, targetRole, yearsOfExperience].filter(Boolean).length;

  if (!hasResumeHint && !isResumeFriendlyFile) return false;
  if (!candidateName) return false;
  if (/^(admin|root|system|api|json|package)$/i.test(candidateName)) return false;
  if (strongFieldCount >= 2) return true;
  if (strongFieldCount >= 1 && skills.length >= 2) return true;
  return false;
}

export function isOrderTemplateCandidate(item: ParsedDocument) {
  const lowerName = String(item.name || '').toLowerCase();
  const lowerPath = String(item.path || '').toLowerCase();
  const isNoise =
    lowerName === 'readme.md'
    || lowerName === 'prd.md'
    || /(小说|大纲|剧情|设定|人物小传)/.test(item.name || '')
    || lowerPath.includes('\\ai-data-platform\\docs\\')
    || lowerPath.includes('\\packages\\')
    || lowerPath.includes('\\node_modules\\');

  if (isNoise) return false;
  if (item.schemaType === 'contract') return false;
  if (!(item.category === 'report' || item.schemaType === 'report')) return false;
  return isStoredKnowledgeDocument(item) || isHighValueKnowledgeDocument(item);
}

export function isFootfallTemplateCandidate(item: ParsedDocument) {
  const profileText = JSON.stringify(item.structuredProfile || {}).toLowerCase();
  const summaryText = `${item.title || ''} ${item.summary || ''} ${(item.topicTags || []).join(' ')}`.toLowerCase();
  return (
    isFootfallDocumentSignal(item)
    || (
      String(item.schemaType || '').toLowerCase() === 'report'
      && /(footfall|visitor|客流|人流|商场分区|mall zone|shopping zone)/.test(`${summaryText} ${profileText}`)
      && isHighValueKnowledgeDocument(item)
    )
  );
}

export function isIotTemplateCandidate(item: ParsedDocument) {
  const text = `${(item.confirmedGroups || []).join(' ')} ${(item.groups || []).join(' ')} ${item.title || ''} ${item.summary || ''}`.toLowerCase();
  return (
    isIotDocumentSignal(item)
    && /(iot|物联网|设备|网关|传感|平台|解决方案)/.test(text)
    && isHighValueKnowledgeDocument(item)
  );
}

export function isBidTemplateCandidate(item: ParsedDocument) {
  const text = `${(item.confirmedGroups || []).join(' ')} ${(item.groups || []).join(' ')} ${item.title || ''} ${item.summary || ''}`.toLowerCase();
  return /(bids?|tender|rfp|proposal|标书|招标|投标)/.test(text) && isHighValueKnowledgeDocument(item);
}

function scoreCandidatePreference(item: ParsedDocument, templateTask: TemplateTask) {
  let score = 0;
  if (isStoredKnowledgeDocument(item)) score += 20;
  if (isHighValueKnowledgeDocument(item)) score += 16;
  if (item.cloudStructuredAt) score += 8;
  score += Math.min(item.evidenceChunks?.length || 0, 10);
  score += Math.min(item.claims?.length || 0, 6) * 2;

  if (templateTask === 'technical-summary' && item.schemaType === 'technical') score += 12;
  if (templateTask === 'technical-summary' && isStoredKnowledgeDocument(item)) score += 18;
  if ((templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') && isPurePaperCandidate(item)) score += 12;
  if (templateTask === 'resume-comparison' && item.schemaType === 'resume') score += 12;
  if ((templateTask === 'formula-table' || templateTask === 'formula-static-page') && item.schemaType === 'formula') score += 12;
  if ((templateTask === 'bids-table' || templateTask === 'bids-static-page') && matchesTemplateTask(item, templateTask)) score += 14;
  if ((templateTask === 'iot-static-page' || templateTask === 'iot-table') && isIotTemplateCandidate(item)) score += 14;
  if (templateTask === 'footfall-static-page' && isFootfallTemplateCandidate(item)) score += 16;

  return score;
}

export function matchesTemplateTask(item: ParsedDocument, templateTask: TemplateTask) {
  if (templateTask === 'resume-comparison') return isReliableResumeCandidate(item);
  if (templateTask === 'formula-table' || templateTask === 'formula-static-page') return item.schemaType === 'formula';
  if (templateTask === 'paper-summary' || templateTask === 'paper-static-page' || templateTask === 'paper-table') return isPurePaperCandidate(item);
  if (templateTask === 'technical-summary') return item.schemaType === 'technical';
  if (templateTask === 'contract-risk') return item.schemaType === 'contract';
  if (templateTask === 'order-static-page') return isOrderTemplateCandidate(item);
  if (templateTask === 'footfall-static-page') return isFootfallTemplateCandidate(item);
  if (templateTask === 'iot-static-page' || templateTask === 'iot-table') return isIotTemplateCandidate(item);
  if (templateTask === 'bids-table' || templateTask === 'bids-static-page') return isBidTemplateCandidate(item);
  return true;
}

export function sortTemplateCandidates(items: ParsedDocument[], templateTask: TemplateTask) {
  return [...items].sort((a, b) => scoreCandidatePreference(b, templateTask) - scoreCandidatePreference(a, templateTask));
}
