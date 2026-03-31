import path from 'node:path';
import { isOpenClawGatewayConfigured, runOpenClawChat } from './openclaw-adapter.js';

export type OpenClawDiscoverySeed = {
  key: string;
  label: string;
  reason: string;
  path: string;
};

export type OpenClawDiscoverySuggestion = {
  key: string;
  label: string;
  reason: string;
  path: string;
  discoverySource: 'openclaw';
};

function extractJsonArray(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}

function sanitizeLabel(value: unknown, fallback: string) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return normalized || fallback;
}

function sanitizeReason(value: unknown, fallback: string) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return normalized || fallback;
}

function sanitizePath(value: unknown) {
  const normalized = path.resolve(String(value || '').trim());
  if (!normalized || normalized.length < 3) return '';
  return normalized;
}

export function parseOpenClawDiscoverySuggestions(raw: string) {
  const items = extractJsonArray(raw);
  const seen = new Set<string>();

  return items.reduce<OpenClawDiscoverySuggestion[]>((acc, item, index) => {
    const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    const candidatePath = sanitizePath(candidate.path);
    if (!candidatePath) return acc;

    const dedupeKey = candidatePath.toLowerCase();
    if (seen.has(dedupeKey)) return acc;
    seen.add(dedupeKey);

    acc.push({
      key: `openclaw-${index + 1}`,
      label: sanitizeLabel(candidate.label, path.basename(candidatePath) || candidatePath),
      reason: sanitizeReason(candidate.reason, 'OpenClaw suggested this directory as a likely document-rich location.'),
      path: candidatePath,
      discoverySource: 'openclaw',
    });
    return acc;
  }, []);
}

export function mergeDiscoveryCandidates(
  seeds: OpenClawDiscoverySeed[],
  suggestions: OpenClawDiscoverySuggestion[],
) {
  const merged = new Map<string, OpenClawDiscoverySeed | OpenClawDiscoverySuggestion>();

  for (const item of suggestions) {
    merged.set(item.path.toLowerCase(), item);
  }

  for (const item of seeds) {
    const key = item.path.toLowerCase();
    if (!merged.has(key)) merged.set(key, item);
  }

  return [...merged.values()];
}

function buildSystemPrompt() {
  return [
    'You are helping a local desktop app discover likely document directories on the current Windows machine.',
    'Inspect the local machine if possible. Prefer real filesystem observation over generic guesses.',
    'Return only a JSON array.',
    'Each item must be an object with: path, label, reason.',
    'Pick directories likely to contain business documents, contracts, reports, resumes, spreadsheets, exports, or working files.',
    'Pay special attention to common IM and collaboration app storage roots such as WeChat, WeCom/WXWork, QQ/Tencent Files, TIM, Lark/Feishu, DingTalk, and similar received-file directories.',
    'Prefer broad parent directories or clearly useful hotspot subdirectories, not individual files.',
    'Do not include system folders with no likely user documents.',
    'Keep the list under 12 items.',
  ].join('\n');
}

function buildContextBlocks(input: {
  home: string;
  documents: string;
  desktop: string;
  downloads: string;
  oneDrive: string;
  appData: string;
  localAppData: string;
  seeds: OpenClawDiscoverySeed[];
}) {
  return [
    [
      'Known local anchors:',
      `- home: ${input.home || '(missing)'}`,
      `- documents: ${input.documents || '(missing)'}`,
      `- desktop: ${input.desktop || '(missing)'}`,
      `- downloads: ${input.downloads || '(missing)'}`,
      `- oneDrive: ${input.oneDrive || '(missing)'}`,
      `- appData: ${input.appData || '(missing)'}`,
      `- localAppData: ${input.localAppData || '(missing)'}`,
    ].join('\n'),
    [
      'Project-side seed directories:',
      ...input.seeds.map((item) => `- ${item.label}: ${item.path}`),
    ].join('\n'),
  ];
}

export async function discoverCandidateDirectoriesWithOpenClaw(input: {
  home: string;
  documents: string;
  desktop: string;
  downloads: string;
  oneDrive: string;
  appData: string;
  localAppData: string;
  seeds: OpenClawDiscoverySeed[];
}) {
  if (!isOpenClawGatewayConfigured()) return [];

  try {
    const result = await runOpenClawChat({
      prompt: 'Discover likely local document directories on this Windows machine and return strict JSON.',
      systemPrompt: buildSystemPrompt(),
      contextBlocks: buildContextBlocks(input),
      sessionUser: 'local-file-discovery',
    });
    return parseOpenClawDiscoverySuggestions(result.content);
  } catch {
    return [];
  }
}
