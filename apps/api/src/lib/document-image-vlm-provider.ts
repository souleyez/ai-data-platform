import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import type { DocumentExtractionFieldKey } from './document-extraction-governance.js';
import type { ParsedDocument } from './document-parser.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import { loadDocumentImageVlmCapability, type DocumentImageVlmCapability } from './document-image-vlm-capability.js';

const execFileAsync = promisify(execFile);
let wslHostIpCache: { value: string; expiresAt: number } = {
  value: '',
  expiresAt: 0,
};

export type DocumentImageVlmFieldCandidate = {
  key?: string;
  value?: unknown;
  confidence?: number;
  source?: string;
  evidenceText?: string;
};

export type DocumentImageVlmEvidenceBlock = {
  title?: string;
  text?: string;
};

export type DocumentImageVlmEntity = {
  text?: string;
  type?: string;
  confidence?: number;
  evidenceText?: string;
};

export type DocumentImageVlmClaim = {
  subject?: string;
  predicate?: string;
  object?: string;
  confidence?: number;
  evidenceText?: string;
};

export type DocumentImageVlmPayload = {
  summary?: string;
  documentKind?: string;
  layoutType?: string;
  topicTags?: string[];
  riskLevel?: ParsedDocument['riskLevel'];
  visualSummary?: string;
  evidenceBlocks?: DocumentImageVlmEvidenceBlock[];
  fieldCandidates?: DocumentImageVlmFieldCandidate[];
  entities?: DocumentImageVlmEntity[];
  claims?: DocumentImageVlmClaim[];
  chartOrTableDetected?: boolean;
  tableLikeSignals?: string[];
  transcribedText?: string;
};

export type DocumentImageVlmResult = {
  content: string;
  model: string;
  provider: 'openclaw-skill';
  capability: DocumentImageVlmCapability;
  parsed: DocumentImageVlmPayload | null;
};

type DocumentImageVlmPromptField = {
  key: string;
  alias?: string;
  required?: boolean;
  prompt?: string;
};

function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function sanitizeText(value: unknown, maxLength = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function resolveWslReadableImagePath(imagePath: string) {
  const normalized = path.resolve(String(imagePath || '').trim());
  if (process.platform !== 'win32') return normalized;
  const posixLike = normalized.replace(/\\/g, '/');
  const driveMatch = posixLike.match(/^([A-Za-z]):\/(.*)$/);
  if (!driveMatch) return normalized;
  return `/mnt/${driveMatch[1].toLowerCase()}/${driveMatch[2]}`;
}

async function resolveWindowsHostIpForWsl() {
  if (process.platform !== 'win32') return '';

  const now = Date.now();
  if (wslHostIpCache.value && wslHostIpCache.expiresAt > now) {
    return wslHostIpCache.value;
  }

  try {
    const result = await execFileAsync(
      'wsl.exe',
      [
        '-d',
        String(process.env.OPENCLAW_WSL_DISTRO || 'Ubuntu-24.04'),
        '--',
        'bash',
        '-lc',
        "ip route | grep '^default' | head -n 1",
      ],
      {
        windowsHide: true,
        timeout: 3000,
      },
    );
    const routeLine = String(result.stdout || '').trim();
    const hostIp = (routeLine.match(/default via\s+([0-9.]+)/) || [])[1] || '';
    if (!hostIp) return '';
    wslHostIpCache = {
      value: hostIp,
      expiresAt: now + 60_000,
    };
    return hostIp;
  } catch {
    return '';
  }
}

function resolveHostedImageContentType(imagePath: string) {
  const extension = String(path.extname(imagePath || '')).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.bmp') return 'image/bmp';
  return 'application/octet-stream';
}

async function withHostedDocumentImageUrl<T>(
  imagePath: string,
  run: (imageUrl?: string) => Promise<T>,
) {
  if (process.platform !== 'win32') {
    return run(undefined);
  }

  const hostIp = await resolveWindowsHostIpForWsl();
  if (!hostIp) {
    return run(undefined);
  }

  const bytes = await fs.readFile(imagePath);
  const contentType = resolveHostedImageContentType(imagePath);
  const routePath = `/document-image-vlm/${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(imagePath || '') || '.bin'}`;
  const server = http.createServer((request, response) => {
    if (request.url !== routePath) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': bytes.length,
      'Cache-Control': 'no-store',
    });
    response.end(bytes);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => resolve());
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const imageUrl = port > 0 ? `http://${hostIp}:${port}${routePath}` : '';

  try {
    return await run(imageUrl || undefined);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
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
    return JSON.parse(candidate.slice(start, end + 1)) as DocumentImageVlmPayload;
  } catch {
    return null;
  }
}

async function withDocumentImageGatewayEnv<T>(
  capability: DocumentImageVlmCapability,
  run: () => Promise<T>,
) {
  const previousUrl = process.env.OPENCLAW_GATEWAY_URL;
  const shouldInjectGatewayUrl = !String(process.env.OPENCLAW_GATEWAY_URL || '').trim() && Boolean(capability.gatewayUrl);

  if (shouldInjectGatewayUrl && capability.gatewayUrl) {
    process.env.OPENCLAW_GATEWAY_URL = capability.gatewayUrl;
  }

  try {
    return await run();
  } finally {
    if (shouldInjectGatewayUrl) {
      if (previousUrl === undefined) delete process.env.OPENCLAW_GATEWAY_URL;
      else process.env.OPENCLAW_GATEWAY_URL = previousUrl;
    }
  }
}

function normalizeFieldKey(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part, index) => (index === 0 ? part.toLowerCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`))
    .join('');
  return normalized;
}

function readFieldTemplatePromptFields(item: ParsedDocument): DocumentImageVlmPromptField[] {
  const template = item.structuredProfile && typeof item.structuredProfile === 'object' && !Array.isArray(item.structuredProfile)
    ? (item.structuredProfile.fieldTemplate as Record<string, unknown> | undefined)
    : undefined;
  if (!template) return [];

  const preferredFieldKeys = Array.isArray(template.preferredFieldKeys)
    ? template.preferredFieldKeys.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
  const requiredFieldKeys = new Set(
    Array.isArray(template.requiredFieldKeys)
      ? template.requiredFieldKeys.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
  );
  const fieldAliases = template.fieldAliases && typeof template.fieldAliases === 'object' && !Array.isArray(template.fieldAliases)
    ? template.fieldAliases as Record<string, unknown>
    : {};
  const fieldPrompts = template.fieldPrompts && typeof template.fieldPrompts === 'object' && !Array.isArray(template.fieldPrompts)
    ? template.fieldPrompts as Record<string, unknown>
    : {};

  return preferredFieldKeys.map((key) => ({
    key,
    alias: String(fieldAliases[key] || '').trim() || undefined,
    required: requiredFieldKeys.has(key),
    prompt: String(fieldPrompts[key] || '').trim() || undefined,
  }));
}

function buildFieldGuidance(item: ParsedDocument) {
  const fields = readFieldTemplatePromptFields(item);
  if (!fields.length) return '';

  return [
    'If the image contains structured business fields, extract them using these canonical keys when possible:',
    ...fields.map((field) => {
      const parts = [field.key];
      if (field.alias) parts.push(`alias=${field.alias}`);
      if (field.required) parts.push('required=true');
      if (field.prompt) parts.push(`hint=${field.prompt}`);
      return `- ${parts.join(' | ')}`;
    }),
  ].join('\n');
}

function extractUsefulExistingText(item: ParsedDocument) {
  const text = String(item.fullText || '').trim();
  if (!text) return '';
  if (/OCR text was not extracted from this image/i.test(text)) return '';
  return sanitizeText(text, Number(env('DOCUMENT_IMAGE_VLM_INPUT_LIMIT', '5000')));
}

export function buildDocumentImageVlmSystemPrompt() {
  return [
    'You are an image-document structuring assistant for a private enterprise knowledge base.',
    'You must inspect the provided local image by using the OpenClaw image understanding capability.',
    'Prefer the MiniMax-backed image understanding capability configured inside OpenClaw when it is available.',
    'Return strict JSON only. No markdown. No explanation.',
    'Do not invent facts. Only extract content visible in the image.',
    'If a value is not visible, omit it or leave it empty.',
    'Use this schema:',
    '{"summary":"","documentKind":"","layoutType":"","topicTags":[],"riskLevel":"low|medium|high","visualSummary":"","evidenceBlocks":[{"title":"","text":""}],"fieldCandidates":[{"key":"","value":"","confidence":0.8,"source":"vlm","evidenceText":""}],"entities":[{"text":"","type":"","confidence":0.8,"evidenceText":""}],"claims":[{"subject":"","predicate":"","object":"","confidence":0.8,"evidenceText":""}],"chartOrTableDetected":false,"tableLikeSignals":[],"transcribedText":""}',
  ].join(' ');
}

export function buildDocumentImageVlmPrompt(item: ParsedDocument, imagePath: string, imageUrl?: string) {
  const fieldGuidance = buildFieldGuidance(item);
  const existingText = extractUsefulExistingText(item);
  const normalizedPath = path.resolve(imagePath);
  const readablePath = resolveWslReadableImagePath(normalizedPath);

  return [
    imageUrl
      ? `Use the OpenClaw image capability on this image URL first: ${imageUrl}`
      : `Use the OpenClaw image capability on this local file path first: ${readablePath}`,
    imageUrl ? `If URL access fails, retry using this local file path: ${readablePath}` : '',
    readablePath !== normalizedPath ? `Original Windows file path: ${normalizedPath}` : '',
    `Document title: ${item.title || item.name}`,
    `Category: ${item.category}`,
    `Business category: ${item.bizCategory}`,
    `Current parse method: ${item.parseMethod || '-'}`,
    `Current summary: ${sanitizeText(item.summary, 400)}`,
    existingText ? `Existing OCR text or parse text:\n${existingText}` : '',
    fieldGuidance,
    'Focus on layout semantics, visible sections, business labels, screenshot widgets, form-like fields, and chart/table cues.',
    'Return only the JSON object.',
  ].filter(Boolean).join('\n\n');
}

export async function runDocumentImageVlm(input: {
  item: ParsedDocument;
  imagePath?: string;
}): Promise<DocumentImageVlmResult | null> {
  const capability = await loadDocumentImageVlmCapability();
  if (!capability.available) return null;

  const imagePath = path.resolve(String(input.imagePath || input.item.path || '').trim());
  if (!imagePath) return null;

  try {
    const stat = await fs.stat(imagePath);
    const maxBytes = Math.max(1024 * 1024, Number(env('DOCUMENT_IMAGE_VLM_MAX_IMAGE_BYTES', '20000000')));
    if (!stat.isFile() || stat.size <= 0 || stat.size > maxBytes) {
      return null;
    }
  } catch {
    return null;
  }

  const result = await withDocumentImageGatewayEnv(
    capability,
    async () => withHostedDocumentImageUrl(
      imagePath,
      async (imageUrl) => runOpenClawChat({
        prompt: buildDocumentImageVlmPrompt(input.item, imagePath, imageUrl),
        systemPrompt: buildDocumentImageVlmSystemPrompt(),
        sessionUser: 'document-image-vlm',
      }),
    ),
  );

  return {
    content: result.content,
    model: result.model,
    provider: 'openclaw-skill',
    capability,
    parsed: extractJsonObject(result.content),
  };
}

export function normalizeDocumentImageFieldCandidateKey(
  value: unknown,
  aliases?: Record<string, string>,
): DocumentExtractionFieldKey | '' {
  const raw = String(value || '').trim();
  if ([
    'contractNo',
    'partyA',
    'partyB',
    'amount',
    'signDate',
    'effectiveDate',
    'paymentTerms',
    'duration',
    'candidateName',
    'targetRole',
    'currentRole',
    'yearsOfExperience',
    'education',
    'major',
    'expectedCity',
    'expectedSalary',
    'latestCompany',
    'companies',
    'skills',
    'highlights',
    'projectHighlights',
    'itProjectHighlights',
    'businessSystem',
    'documentKind',
    'applicableScope',
    'operationEntry',
    'approvalLevels',
    'policyFocus',
    'contacts',
    'period',
    'platform',
    'orderCount',
    'netSales',
    'grossMargin',
    'topCategory',
    'inventoryStatus',
    'replenishmentAction',
  ].includes(raw)) {
    return raw as DocumentExtractionFieldKey;
  }
  const directAlias = Object.entries(aliases || {}).find(([, alias]) => String(alias || '').trim() === raw)?.[0];
  if (directAlias) return directAlias as DocumentExtractionFieldKey;
  const normalized = normalizeFieldKey(value);
  if (!normalized) return '';
  const aliasEntries = Object.entries(aliases || {});
  const matchedAlias = aliasEntries.find(([, alias]) => normalizeFieldKey(alias) === normalized)?.[0];
  const resolved = matchedAlias || normalized;
  return [
    'contractNo',
    'partyA',
    'partyB',
    'amount',
    'signDate',
    'effectiveDate',
    'paymentTerms',
    'duration',
    'candidateName',
    'targetRole',
    'currentRole',
    'yearsOfExperience',
    'education',
    'major',
    'expectedCity',
    'expectedSalary',
    'latestCompany',
    'companies',
    'skills',
    'highlights',
    'projectHighlights',
    'itProjectHighlights',
    'businessSystem',
    'documentKind',
    'applicableScope',
    'operationEntry',
    'approvalLevels',
    'policyFocus',
    'contacts',
    'period',
    'platform',
    'orderCount',
    'netSales',
    'grossMargin',
    'topCategory',
    'inventoryStatus',
    'replenishmentAction',
  ].includes(resolved)
    ? resolved as DocumentExtractionFieldKey
    : '';
}
