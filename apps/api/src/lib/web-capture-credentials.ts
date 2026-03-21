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
  createdAt: string;
  updatedAt: string;
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
  const nextItem: StoredCredential = {
    id,
    origin,
    username: input.username.trim(),
    secret: encryptSecret(input.password),
    createdAt: items.find((item) => item.id === id)?.createdAt || now,
    updatedAt: now,
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
  };
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
    };
  } catch {
    return null;
  }
}

export function buildWebCaptureCredentialSummary(url: string, credential?: { maskedUsername?: string; origin?: string } | null) {
  const origin = credential?.origin || getOrigin(url);
  return {
    origin,
    hasStoredCredential: Boolean(credential),
    maskedUsername: credential?.maskedUsername || '',
  };
}
