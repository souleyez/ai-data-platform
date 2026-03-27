import { promises as fs } from 'node:fs';
import path from 'node:path';
import { STORAGE_CONFIG_DIR } from './paths.js';

export type DatasourceCredentialKind =
  | 'credential'
  | 'manual_session'
  | 'database_password'
  | 'api_token';

export type DatasourceCredentialSecret = {
  username?: string;
  password?: string;
  token?: string;
  connectionString?: string;
  cookies?: string;
  headers?: Record<string, string>;
};

export type DatasourceCredentialRecord = {
  id: string;
  kind: DatasourceCredentialKind;
  label: string;
  origin?: string;
  notes?: string;
  updatedAt: string;
  createdAt: string;
  secret: DatasourceCredentialSecret;
};

export type DatasourceCredentialPublic = Omit<DatasourceCredentialRecord, 'secret'> & {
  hasSecret: boolean;
  secretHints: string[];
};

type Payload = {
  items: DatasourceCredentialRecord[];
};

const DATASOURCE_CONFIG_DIR = path.join(STORAGE_CONFIG_DIR, 'datasources');
const CREDENTIALS_FILE = path.join(DATASOURCE_CONFIG_DIR, 'credentials.json');

function normalizeSecret(secret: unknown): DatasourceCredentialSecret {
  const value = secret && typeof secret === 'object' ? (secret as Record<string, unknown>) : {};
  const headers = value.headers && typeof value.headers === 'object'
    ? Object.fromEntries(
        Object.entries(value.headers as Record<string, unknown>)
          .map(([key, entry]) => [String(key).trim(), String(entry || '').trim()])
          .filter(([key, entry]) => key && entry),
      )
    : undefined;
  return {
    username: String(value.username || '').trim(),
    password: String(value.password || '').trim(),
    token: String(value.token || '').trim(),
    connectionString: String(value.connectionString || '').trim(),
    cookies: String(value.cookies || '').trim(),
    headers,
  };
}

function normalizeRecord(input: Partial<DatasourceCredentialRecord>): DatasourceCredentialRecord {
  const now = new Date().toISOString();
  return {
    id: String(input.id || '').trim(),
    kind: (['credential', 'manual_session', 'database_password', 'api_token'].includes(String(input.kind))
      ? input.kind
      : 'credential') as DatasourceCredentialKind,
    label: String(input.label || '').trim(),
    origin: String(input.origin || '').trim(),
    notes: String(input.notes || '').trim(),
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    secret: normalizeSecret(input.secret),
  };
}

function toPublicRecord(record: DatasourceCredentialRecord): DatasourceCredentialPublic {
  const secretHints = [
    record.secret.username ? 'username' : '',
    record.secret.password ? 'password' : '',
    record.secret.token ? 'token' : '',
    record.secret.connectionString ? 'connection' : '',
    record.secret.cookies ? 'cookies' : '',
    record.secret.headers && Object.keys(record.secret.headers).length ? 'headers' : '',
  ].filter(Boolean);

  return {
    id: record.id,
    kind: record.kind,
    label: record.label,
    origin: record.origin,
    notes: record.notes,
    updatedAt: record.updatedAt,
    createdAt: record.createdAt,
    hasSecret: secretHints.length > 0,
    secretHints,
  };
}

async function ensureDir() {
  await fs.mkdir(DATASOURCE_CONFIG_DIR, { recursive: true });
}

async function readAll() {
  try {
    const raw = await fs.readFile(CREDENTIALS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Payload;
    return Array.isArray(parsed.items)
      ? parsed.items.map(normalizeRecord).filter((item) => item.id && item.label)
      : [];
  } catch {
    return [];
  }
}

async function writeAll(items: DatasourceCredentialRecord[]) {
  await ensureDir();
  await fs.writeFile(CREDENTIALS_FILE, JSON.stringify({ items }, null, 2), 'utf8');
}

export async function listDatasourceCredentials() {
  const items = await readAll();
  return items.map(toPublicRecord).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getDatasourceCredential(id: string) {
  const items = await readAll();
  const record = items.find((item) => item.id === id) || null;
  return record ? toPublicRecord(record) : null;
}

export async function upsertDatasourceCredential(input: Partial<DatasourceCredentialRecord>) {
  const record = normalizeRecord(input);
  if (!record.id) throw new Error('credential id is required');
  if (!record.label) throw new Error('credential label is required');

  const items = await readAll();
  const index = items.findIndex((item) => item.id === record.id);
  const now = new Date().toISOString();
  const next = {
    ...record,
    createdAt: index >= 0 ? items[index].createdAt : record.createdAt || now,
    updatedAt: now,
  };

  if (index >= 0) items[index] = next;
  else items.unshift(next);

  await writeAll(items);
  return toPublicRecord(next);
}

export async function deleteDatasourceCredential(id: string) {
  const items = await readAll();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const [removed] = items.splice(index, 1);
  await writeAll(items);
  return toPublicRecord(removed);
}
