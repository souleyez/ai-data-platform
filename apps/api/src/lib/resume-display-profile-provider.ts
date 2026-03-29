import type { ParsedDocument, ResumeFields } from './document-parser.js';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';
import { canonicalizeResumeFields, isWeakResumeCandidateName } from './resume-canonicalizer.js';
import { selectResumeDisplayCompany } from './resume-display-company.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

export type ResumeDisplayProfile = {
  sourcePath: string;
  sourceName: string;
  displayName: string;
  displayCompany: string;
  displayProjects: string[];
  displaySkills: string[];
  displaySummary: string;
};

export type ResumeDisplayProfileResolution = {
  profiles: ResumeDisplayProfile[];
};

const WEAK_RESUME_PROJECT_PATTERNS = [
  /^(?:[a-z][、.．:：]\s*)/i,
  /^(?:负责|参与|协助|维护|跟进|制定|完成|优化|推进|主导|带领|管理|测试|支持|实施|编写|设计|开发|搭建|上线)/u,
  /(?:客户关系|项目进度|回款情况|结算情况|销售方案|项目立项|代码质量管控|开发进度把控|技术工作统筹|培训技术员|核心功能)/u,
  /^(?:完整的销售方案|系统搭建与上线|优化了平台)$/u,
];

const GENERIC_RESUME_PROJECT_LABELS = new Set([
  '平台',
  '系统',
  '项目',
  '方案',
  '销售方案',
  '系统搭建与上线',
]);

function buildProfileKey(profile: Pick<ResumeDisplayProfile, 'sourcePath' | 'sourceName'>) {
  return `${sanitizeText(profile.sourcePath, 320)}::${sanitizeText(profile.sourceName, 160)}`;
}

function shouldAttemptModelRefinement(seedProfiles: ResumeDisplayProfile[]) {
  if (!seedProfiles.length) return false;
  const weakNameCount = seedProfiles.filter((profile) => isWeakResumeCandidateName(profile.displayName)).length;
  const projectRichProfiles = seedProfiles.filter((profile) => (profile.displayProjects || []).length > 0).length;
  return weakNameCount > 0 || projectRichProfiles < Math.min(3, seedProfiles.length);
}

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function sanitizeStringArray(value: unknown, maxLength = 80) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean);
}

function extractStrongDisplayNameFromContext(value: unknown) {
  const text = sanitizeText(value, 240);
  if (!text) return '';

  const patterns = [
    /(?:\u59d3\u540d|\u5019\u9009\u4eba)[:：]?\s*([\u4e00-\u9fff\u00b7]{2,4})/u,
    /^([\u4e00-\u9fff\u00b7]{2,4})(?:\u7b80\u5386|，|,|\s|\u7537|\u5973|\u6c42\u804c|\u5de5\u4f5c|\u73b0\u5c45|\u672c\u79d1|\u7855\u58eb|\u7814\u7a76\u751f|MBA|\u5927\u4e13|\u535a\u58eb)/u,
  ];

  for (const pattern of patterns) {
    const candidate = sanitizeText(text.match(pattern)?.[1], 40);
    if (!candidate || isWeakResumeCandidateName(candidate)) continue;
    return candidate;
  }

  const tokens = text.match(/[\u4e00-\u9fff\u00b7]{2,4}/gu) || [];
  for (const token of tokens.slice(0, 8)) {
    const candidate = sanitizeText(token, 40);
    if (!candidate || isWeakResumeCandidateName(candidate)) continue;
    return candidate;
  }

  return '';
}

function resolveResumeDisplayName(primary: unknown, contextValues: unknown[]) {
  const direct = sanitizeText(primary, 60);
  if (direct && !isWeakResumeCandidateName(direct)) return direct;
  for (const value of contextValues) {
    const recovered = extractStrongDisplayNameFromContext(value);
    if (recovered) return recovered;
  }
  return direct;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractJsonObject(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function buildDocumentContext(item: ParsedDocument) {
  const profile = (item.resumeFields || item.structuredProfile || {}) as ResumeFields;
  const canonical = canonicalizeResumeFields(profile, {
    title: item.title,
    sourceName: item.name,
    summary: item.summary,
    excerpt: item.excerpt,
    fullText: item.fullText,
  });

  return {
    sourcePath: item.path,
    sourceName: item.name,
    title: sanitizeText(item.title, 120),
    summary: sanitizeText(item.summary, 280),
    excerpt: sanitizeText(item.excerpt, 220),
    canonicalResumeFields: canonical || {},
    rawResumeFields: profile,
  };
}

function sanitizeSeedProject(value: unknown) {
  const raw = sanitizeText(value, 120)
    .replace(/^[•·\-*]+/, '')
    .trim();
  if (!raw) return '';

  const explicitMatch = raw.match(/([\u4e00-\u9fffA-Za-z0-9()（）\-]{2,24}(?:项目|系统|平台|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI))/iu);
  const candidate = sanitizeText(explicitMatch?.[1] || raw, 48);
  if (!candidate) return '';
  if (candidate.length > 32) return '';
  if (/[;；,，。]/u.test(candidate)) return '';
  if (GENERIC_RESUME_PROJECT_LABELS.has(candidate)) return '';
  if (WEAK_RESUME_PROJECT_PATTERNS.some((pattern) => pattern.test(candidate))) return '';
  if (/^(?:智慧|安防|园区|支付|视频|电商|风控|数据|物流|医院|物业|SaaS|IoT|IOT|AIGC|AI)/iu.test(candidate)) return candidate;
  if (/(?:项目|系统|平台|中台|小程序|APP|网站|商城|ERP|CRM|MES|WMS|SRM|BI|IoT|IOT|AIGC|AI)$/iu.test(candidate)) return candidate;
  return '';
}

function buildSeedSummary(input: {
  currentRole?: string;
  yearsOfExperience?: string;
  education?: string;
  displayCompany?: string;
  displaySkills?: string[];
  displayProjects?: string[];
}) {
  const parts = [
    sanitizeText(input.currentRole, 40),
    sanitizeText(input.yearsOfExperience, 20),
    sanitizeText(input.education, 20),
    sanitizeText(input.displayCompany, 80),
  ].filter(Boolean);
  const skills = (input.displaySkills || []).slice(0, 3).join(' / ');
  const primaryProject = sanitizeText(input.displayProjects?.[0], 40);
  return sanitizeText([
    parts.join(' | '),
    skills ? `技能 ${skills}` : '',
    primaryProject ? `代表项目 ${primaryProject}` : '',
  ].filter(Boolean).join(' | '), 180);
}

function buildSeedProfileFromDocument(item: ParsedDocument) {
  const profile = (item.resumeFields || item.structuredProfile || {}) as ResumeFields;
  const canonical = canonicalizeResumeFields(profile, {
    title: item.title,
    sourceName: item.name,
    summary: item.summary,
    excerpt: item.excerpt,
    fullText: item.fullText,
  });

  const displayName = resolveResumeDisplayName(canonical?.candidateName, [
    item.title,
    item.summary,
    item.excerpt,
    item.name,
    item.fullText,
  ]);
  const displayCompany = selectResumeDisplayCompany([
    canonical?.latestCompany,
    ...(canonical?.companies || []),
    profile.latestCompany,
    ...(Array.isArray(profile.companies) ? profile.companies : []),
    item.summary,
    item.excerpt,
    item.fullText,
    item.title,
  ], 120);
  const displayProjects = sanitizeStringArray(
    canonical?.itProjectHighlights?.length ? canonical.itProjectHighlights : canonical?.projectHighlights,
    80,
  )
    .map((entry) => sanitizeSeedProject(entry))
    .filter(Boolean)
    .slice(0, 3);
  const displaySkills = sanitizeStringArray(canonical?.skills, 40).slice(0, 6);
  const displaySummary = buildSeedSummary({
    currentRole: canonical?.currentRole,
    yearsOfExperience: canonical?.yearsOfExperience,
    education: canonical?.education,
    displayCompany,
    displaySkills,
    displayProjects,
  });

  if (!displayName && !displayCompany && !displayProjects.length && !displaySkills.length && !displaySummary) {
    return null;
  }

  return {
    sourcePath: item.path,
    sourceName: item.name,
    displayName,
    displayCompany,
    displayProjects,
    displaySkills,
    displaySummary,
  } satisfies ResumeDisplayProfile;
}

async function buildSystemPrompt() {
  const skillInstruction = await loadWorkspaceSkillBundle('resume-display-profile', [
    'references/output-schema.md',
  ]);

  return [
    'You are a resume display-profile resolver for a private enterprise knowledge-report system.',
    'Return strict JSON only. No markdown. No explanation.',
    'Your task is to transform noisy resume retrieval inputs into display-ready profile slots for report generation.',
    'Prefer real human names, stable organization labels, concise project nouns, and reusable skill labels.',
    'Avoid honorific-only masked names such as 某先生 or 某女士 when stronger real names exist in the document context.',
    'For displayCompany, prefer enterprise employer labels. Reject associations, alumni groups, research institutes, universities, and similar non-enterprise organizations unless they are explicitly part of a company name.',
    'Reject placeholders, sample slugs, generic labels, role-only titles, file-name fragments, long responsibility sentences, and malformed organization text.',
    skillInstruction,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function normalizeProfile(raw: unknown) {
  if (!isObject(raw)) return null;
  const sourcePath = sanitizeText(raw.sourcePath, 320);
  const sourceName = sanitizeText(raw.sourceName, 160);
  if (!sourcePath && !sourceName) return null;
  const displayProjects = sanitizeStringArray(raw.displayProjects, 80).slice(0, 4);
  const displaySkills = sanitizeStringArray(raw.displaySkills, 40).slice(0, 6);
  const displaySummary = sanitizeText(raw.displaySummary, 240);
  const displayCompany = selectResumeDisplayCompany([
    raw.displayCompany,
    ...(Array.isArray(raw.companies) ? raw.companies : []),
    raw.displaySummary,
    raw.summary,
  ], 160);

  const canonical = canonicalizeResumeFields({
    candidateName: sanitizeText(raw.displayName, 80),
    latestCompany: displayCompany,
    companies: displayCompany ? [displayCompany] : [],
    skills: displaySkills,
  }, {
    sourceName,
    summary: displaySummary,
  });

  return {
    sourcePath,
    sourceName,
    displayName: resolveResumeDisplayName(canonical?.candidateName, [
      sourceName,
      raw.title,
      raw.summary,
      displaySummary,
    ]),
    displayCompany: selectResumeDisplayCompany([
      canonical?.latestCompany,
      ...(canonical?.companies || []),
      displayCompany,
    ], 120),
    displayProjects: displayProjects.length ? displayProjects : sanitizeStringArray(canonical?.projectHighlights, 80).slice(0, 4),
    displaySkills: displaySkills.length ? displaySkills : sanitizeStringArray(canonical?.skills, 40).slice(0, 6),
    displaySummary,
  } satisfies ResumeDisplayProfile;
}

export function parseResumeDisplayProfileResponse(rawContent: string): ResumeDisplayProfileResolution | null {
  const root = extractJsonObject(rawContent);
  if (!root) return null;

  const payload = isObject(root.output) ? root.output : root;
  const profiles = (Array.isArray(payload.profiles) ? payload.profiles : [])
    .map((item) => normalizeProfile(item))
    .filter(Boolean) as ResumeDisplayProfile[];

  if (!profiles.length) return null;
  return { profiles };
}

export function buildResumeDisplayProfileContextBlock(resolution: ResumeDisplayProfileResolution | null) {
  if (!resolution?.profiles?.length) return '';
  return [
    'Resume display profiles:',
    'Use these profiles as stronger display labels than raw filenames, weak summaries, or noisy fallback extraction.',
    JSON.stringify({
      profiles: resolution.profiles.map((profile) => ({
        sourcePath: profile.sourcePath,
        sourceName: profile.sourceName,
        displayName: profile.displayName,
        displayCompany: profile.displayCompany,
        displayProjects: profile.displayProjects,
        displaySkills: profile.displaySkills,
        displaySummary: profile.displaySummary,
      })),
    }, null, 2),
  ].join('\n\n');
}

export function buildResumeDisplaySeedProfiles(documents: ParsedDocument[]) {
  return documents
    .filter((item) => item.schemaType === 'resume')
    .slice(0, 8)
    .map((item) => buildSeedProfileFromDocument(item))
    .filter(Boolean) as ResumeDisplayProfile[];
}

function mergeResumeDisplayProfiles(primary: ResumeDisplayProfile[], fallback: ResumeDisplayProfile[]) {
  const merged = new Map<string, ResumeDisplayProfile>();

  for (const profile of fallback) {
    merged.set(buildProfileKey(profile), profile);
  }

  for (const profile of primary) {
    const key = buildProfileKey(profile);
    const previous = merged.get(key);
    merged.set(key, {
      sourcePath: profile.sourcePath || previous?.sourcePath || '',
      sourceName: profile.sourceName || previous?.sourceName || '',
      displayName: profile.displayName || previous?.displayName || '',
      displayCompany: profile.displayCompany || previous?.displayCompany || '',
      displayProjects: profile.displayProjects?.length ? profile.displayProjects : (previous?.displayProjects || []),
      displaySkills: profile.displaySkills?.length ? profile.displaySkills : (previous?.displaySkills || []),
      displaySummary: profile.displaySummary || previous?.displaySummary || '',
    });
  }

  return [...merged.values()].filter((profile) => profile.displayName || profile.displayCompany || profile.displayProjects.length || profile.displaySkills.length || profile.displaySummary);
}

export async function runResumeDisplayProfileResolver(input: {
  requestText: string;
  documents: ParsedDocument[];
  sessionUser?: string;
}): Promise<ResumeDisplayProfileResolution | null> {
  const documents = input.documents.filter((item) => item.schemaType === 'resume').slice(0, 8);
  const seedProfiles = buildResumeDisplaySeedProfiles(documents);
  if (!documents.length) return null;
  if (seedProfiles.length >= 4 && !shouldAttemptModelRefinement(seedProfiles)) {
    return { profiles: seedProfiles };
  }
  if (!isOpenClawGatewayConfigured()) {
    return seedProfiles.length ? { profiles: seedProfiles } : null;
  }

  const systemPrompt = await buildSystemPrompt();
  const prompt = [
    `Request: ${sanitizeText(input.requestText, 240)}`,
    'Resolve display-ready resume profiles for the following matched documents.',
    JSON.stringify({
      profiles: documents.slice(0, 6).map((item) => buildDocumentContext(item)),
    }, null, 2),
  ].join('\n\n');

  try {
    const result = await runOpenClawChat({
      prompt,
      systemPrompt,
      sessionUser: input.sessionUser,
    });
    const parsed = parseResumeDisplayProfileResponse(result.content);
    if (!parsed?.profiles?.length) {
      return seedProfiles.length ? { profiles: seedProfiles } : null;
    }
    return {
      profiles: mergeResumeDisplayProfiles(parsed.profiles, seedProfiles),
    };
  } catch {
    return seedProfiles.length ? { profiles: seedProfiles } : null;
  }
}
