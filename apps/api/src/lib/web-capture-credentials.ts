import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { REPO_ROOT, STORAGE_ROOT } from './paths.js';

const CREDENTIALS_DIR = path.join(STORAGE_ROOT, 'web-captures');
const CREDENTIALS_FILE = path.join(CREDENTIALS_DIR, 'credentials.json');
const ALGORITHM = 'aes-256-gcm';

type StoredCredential = {
  id: string;
  origin: string;
  username: string;
  secret: string;
  sessionSecret?: string;
  createdAt: string;
  updatedAt: string;
  sessionUpdatedAt?: string;
};

type StoredCredentialPayload = {
  items: StoredCredential[];
};

export type ResolvedWebCaptureCredential = {
  id: string;
  origin: string;
  username: string;
  password: string;
  maskedUsername: string;
  updatedAt: string;
  sessionCookies: Record<string, Record<string, string>>;
  sessionUpdatedAt: string;
};

export type WebCaptureCredentialSummary = {
  origin: string;
  hasStoredCredential: boolean;
  maskedUsername: string;
  hasStoredSession: boolean;
  sessionUpdatedAt: string;
};

function getOrigin(url: string) {
  return new URL(url).origin.toLowerCase();
}

function credentialIdForOrigin(origin: string) {
  return `cred-${Buffer.from(origin).toString('base64url')}`;
}

function buildMasterKey() {
  const configured = process.env.WEB_CAPTURE_CREDENTIAL_SECRET || process.env.CAPTURE_CREDENTIAL_SECRET;
  const seed = configured || `${os.hostname()}:${REPO_ROOT}:ai-data-platform:web-capture:dev`;
  return createHash('sha256').update(seed).digest();
}

function encryptSecret(plainText: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, buildMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSecret(serialized: string) {
  const [ivRaw, tagRaw, payloadRaw] = String(serialized || '').split('.');
  if (!ivRaw || !tagRaw || !payloadRaw) return '';
  const decipher = createDecipheriv(ALGORITHM, buildMasterKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadRaw, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function normalizeSessionCookies(value: unknown) {
  const session = value && typeof value === 'object'
    ? (value as Record<string, Record<string, unknown>>)
    : {};
  const next: Record<string, Record<string, string>> = {};
  for (const [scope, bucket] of Object.entries(session)) {
    const normalizedScope = String(scope || '').trim().toLowerCase();
    if (!normalizedScope || !bucket || typeof bucket !== 'object') continue;
    const nextBucket = Object.fromEntries(
      Object.entries(bucket)
        .map(([name, cookieValue]) => [String(name || '').trim(), String(cookieValue || '').trim()] as const)
        .filter(([name, cookieValue]) => Boolean(name && cookieValue)),
    );
    if (Object.keys(nextBucket).length) {
      next[normalizedScope] = nextBucket;
    }
  }
  return next;
}

function serializeSessionCookies(sessionCookies: Record<string, Record<string, string>>) {
  const normalized = normalizeSessionCookies(sessionCookies);
  if (!Object.keys(normalized).length) return '';
  return encryptSecret(JSON.stringify(normalized));
}

function deserializeSessionCookies(serialized: string) {
  if (!String(serialized || '').trim()) return {};
  try {
    const parsed = JSON.parse(decryptSecret(serialized));
    return normalizeSessionCookies(parsed);
  } catch {
    return {};
  }
}

function maskUsername(username: string) {
  const text = String(username || '').trim();
  if (!text) return '';
  if (text.length <= 2) return `${text[0] || '*'}*`;
  return `${text.slice(0, 2)}***${text.slice(-1)}`;
}

async function ensureDirs() {
  await fs.mkdir(CREDENTIALS_DIR, { recursive: true });
}

async function readCredentialItems() {
  try {
    const raw = await fs.readFile(CREDENTIALS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredCredentialPayload;
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

async function writeCredentialItems(items: StoredCredential[]) {
  await ensureDirs();
  await fs.writeFile(CREDENTIALS_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}

export async function saveWebCaptureCredential(input: { url: string; username: string; password: string }) {
  const origin = getOrigin(input.url);
  const now = new Date().toISOString();
  const items = await readCredentialItems();
  const id = credentialIdForOrigin(origin);
  const existing = items.find((item) => item.id === id);
  const nextItem: StoredCredential = {
    id,
    origin,
    username: input.username.trim(),
    secret: encryptSecret(input.password),
    sessionSecret: existing?.sessionSecret || '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sessionUpdatedAt: existing?.sessionUpdatedAt || '',
  };

  const nextItems = items.filter((item) => item.id !== id);
  nextItems.unshift(nextItem);
  await writeCredentialItems(nextItems);

  return {
    id,
    origin,
    username: nextItem.username,
    maskedUsername: maskUsername(nextItem.username),
    updatedAt: now,
    sessionCookies: deserializeSessionCookies(nextItem.sessionSecret || ''),
    sessionUpdatedAt: nextItem.sessionUpdatedAt || '',
  };
}

export async function saveWebCaptureSession(input: {
  url: string;
  sessionCookies: Record<string, Record<string, string>>;
  updatedAt?: string;
}) {
  const origin = getOrigin(input.url);
  const id = credentialIdForOrigin(origin);
  const items = await readCredentialItems();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;

  const sessionCookies = normalizeSessionCookies(input.sessionCookies);
  if (!Object.keys(sessionCookies).length) return null;

  const updatedAt = input.updatedAt || new Date().toISOString();
  const nextItem: StoredCredential = {
    ...items[index],
    sessionSecret: serializeSessionCookies(sessionCookies),
    sessionUpdatedAt: updatedAt,
  };
  items[index] = nextItem;
  await writeCredentialItems(items);

  return {
    id: nextItem.id,
    origin: nextItem.origin,
    username: nextItem.username,
    maskedUsername: maskUsername(nextItem.username),
    updatedAt: nextItem.updatedAt,
    sessionCookies,
    sessionUpdatedAt: updatedAt,
  };
}

export async function clearWebCaptureSession(url: string) {
  const origin = getOrigin(url);
  const id = credentialIdForOrigin(origin);
  const items = await readCredentialItems();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  items[index] = {
    ...items[index],
    sessionSecret: '',
    sessionUpdatedAt: '',
  };
  await writeCredentialItems(items);
  return {
    id,
    origin,
  };
}

export function isWebCaptureSessionFresh(updatedAt: string, now = Date.now()) {
  const parsed = Date.parse(String(updatedAt || '').trim());
  if (!Number.isFinite(parsed)) return false;
  const configuredHours = Number(process.env.WEB_CAPTURE_SESSION_TTL_HOURS || 24);
  const ttlHours = Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 24;
  return parsed + ttlHours * 60 * 60 * 1000 > now;
}

export async function loadWebCaptureCredential(url: string): Promise<ResolvedWebCaptureCredential | null> {
  const origin = getOrigin(url);
  const id = credentialIdForOrigin(origin);
  const items = await readCredentialItems();
  const found = items.find((item) => item.id === id);
  if (!found) return null;

  try {
    return {
      id: found.id,
      origin: found.origin,
      username: found.username,
      password: decryptSecret(found.secret),
      maskedUsername: maskUsername(found.username),
      updatedAt: found.updatedAt,
      sessionCookies: deserializeSessionCookies(found.sessionSecret || ''),
      sessionUpdatedAt: found.sessionUpdatedAt || '',
    };
  } catch {
    return null;
  }
}

export function buildWebCaptureCredentialSummary(url: string, credential?: {
  maskedUsername?: string;
  origin?: string;
  sessionUpdatedAt?: string;
  sessionCookies?: Record<string, Record<string, string>>;
} | null): WebCaptureCredentialSummary {
  const origin = credential?.origin || getOrigin(url);
  const sessionCookies = normalizeSessionCookies(credential?.sessionCookies || {});
  return {
    origin,
    hasStoredCredential: Boolean(credential),
    maskedUsername: credential?.maskedUsername || '',
    hasStoredSession: Object.keys(sessionCookies).length > 0,
    sessionUpdatedAt: credential?.sessionUpdatedAt || '',
  };
}
