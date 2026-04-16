import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import os from 'node:os';
import { REPO_ROOT } from './paths.js';
import { queryPlatformDuckDbRows, withPlatformDuckDbConnection } from './platform-duckdb.js';

const ALGORITHM = 'aes-256-gcm';
const DATASET_SECRET_GRANT_VERSION = 1;

export type DatasetSecretGrant = {
  version: number;
  bindingId: string;
  fingerprint: string;
  libraryKeys: string[];
  issuedAt: string;
  signature: string;
};

type DatasetSecretBindingRow = {
  id?: string;
  fingerprint?: string;
  ciphertext?: string;
  created_at?: string;
  updated_at?: string;
};

type DatasetLibrarySecretMapRow = {
  library_key?: string;
  secret_binding_id?: string;
};

function buildSecretSeed(purpose: 'cipher' | 'grant') {
  const configured = process.env.DATASET_SECRET_MASTER_KEY
    || process.env.DATASET_SECRET_KEY
    || process.env.WEB_CAPTURE_CREDENTIAL_SECRET
    || process.env.CAPTURE_CREDENTIAL_SECRET;
  return configured || `${os.hostname()}:${REPO_ROOT}:ai-data-platform:dataset-secrets:${purpose}`;
}

function buildSecretKey(purpose: 'cipher' | 'grant') {
  return createHash('sha256').update(buildSecretSeed(purpose)).digest();
}

function normalizeSecretText(value: unknown) {
  return String(value || '').trim();
}

function normalizeLibraryKey(value: unknown) {
  return String(value || '').trim();
}

function normalizeLibraryKeys(values: unknown) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((item) => normalizeLibraryKey(item))
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function buildSecretFingerprint(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

function buildSecretBindingId(fingerprint: string) {
  return `secret_${fingerprint}`;
}

function encryptSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, buildSecretKey('cipher'), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSecret(serialized: string) {
  const [ivRaw, tagRaw, payloadRaw] = String(serialized || '').split('.');
  if (!ivRaw || !tagRaw || !payloadRaw) return '';
  const decipher = createDecipheriv(ALGORITHM, buildSecretKey('cipher'), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadRaw, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function buildGrantPayloadSignature(input: Omit<DatasetSecretGrant, 'signature'>) {
  return createHmac('sha256', buildSecretKey('grant'))
    .update(JSON.stringify({
      version: DATASET_SECRET_GRANT_VERSION,
      bindingId: normalizeSecretText(input.bindingId),
      fingerprint: normalizeSecretText(input.fingerprint),
      libraryKeys: normalizeLibraryKeys(input.libraryKeys),
      issuedAt: normalizeSecretText(input.issuedAt),
    }))
    .digest('base64url');
}

function buildSignedGrant(input: {
  bindingId: string;
  fingerprint: string;
  libraryKeys: string[];
  issuedAt?: string;
}) {
  const payload = {
    version: DATASET_SECRET_GRANT_VERSION,
    bindingId: normalizeSecretText(input.bindingId),
    fingerprint: normalizeSecretText(input.fingerprint),
    libraryKeys: normalizeLibraryKeys(input.libraryKeys),
    issuedAt: normalizeSecretText(input.issuedAt) || new Date().toISOString(),
  };
  return {
    ...payload,
    signature: buildGrantPayloadSignature(payload),
  } satisfies DatasetSecretGrant;
}

function normalizeDatasetSecretGrant(value: unknown): DatasetSecretGrant | null {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!source) return null;
  const bindingId = normalizeSecretText(source.bindingId);
  const fingerprint = normalizeSecretText(source.fingerprint);
  const issuedAt = normalizeSecretText(source.issuedAt);
  const signature = normalizeSecretText(source.signature);
  const version = Number(source.version || 0);
  const libraryKeys = normalizeLibraryKeys(source.libraryKeys);
  if (
    version !== DATASET_SECRET_GRANT_VERSION
    || !bindingId
    || !fingerprint
    || !issuedAt
    || !signature
    || !libraryKeys.length
  ) {
    return null;
  }
  return {
    version,
    bindingId,
    fingerprint,
    libraryKeys,
    issuedAt,
    signature,
  };
}

function isDatasetSecretGrantSignatureValid(grant: DatasetSecretGrant) {
  const expected = buildGrantPayloadSignature({
    version: grant.version,
    bindingId: grant.bindingId,
    fingerprint: grant.fingerprint,
    libraryKeys: grant.libraryKeys,
    issuedAt: grant.issuedAt,
  });
  return expected === grant.signature;
}

async function getDatasetSecretBindingByFingerprint(fingerprint: string) {
  const rows = await queryPlatformDuckDbRows<DatasetSecretBindingRow>(
    `
      SELECT id, fingerprint, ciphertext, created_at, updated_at
      FROM dataset_secret_bindings
      WHERE fingerprint = $fingerprint
      LIMIT 1
    `,
    { fingerprint },
  );
  const row = rows[0];
  if (!row?.id || !row?.fingerprint) return null;
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    ciphertext: String(row.ciphertext || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

async function getDatasetSecretBindingById(bindingId: string) {
  const rows = await queryPlatformDuckDbRows<DatasetSecretBindingRow>(
    `
      SELECT id, fingerprint, ciphertext, created_at, updated_at
      FROM dataset_secret_bindings
      WHERE id = $bindingId
      LIMIT 1
    `,
    { bindingId },
  );
  const row = rows[0];
  if (!row?.id || !row?.fingerprint) return null;
  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    ciphertext: String(row.ciphertext || ''),
    createdAt: String(row.created_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

async function getLibraryKeysForSecretBinding(bindingId: string) {
  const rows = await queryPlatformDuckDbRows<DatasetLibrarySecretMapRow>(
    `
      SELECT library_key
      FROM dataset_library_secret_map
      WHERE secret_binding_id = $bindingId
      ORDER BY library_key ASC
    `,
    { bindingId },
  );
  return normalizeLibraryKeys(rows.map((row) => row.library_key));
}

async function ensureDatasetSecretBinding(secret: string) {
  const normalizedSecret = normalizeSecretText(secret);
  if (!normalizedSecret) throw new Error('dataset secret is required');

  const fingerprint = buildSecretFingerprint(normalizedSecret);
  const existing = await getDatasetSecretBindingByFingerprint(fingerprint);
  if (existing) {
    if (!existing.ciphertext) {
      throw new Error('dataset secret binding is corrupted');
    }
    return existing;
  }

  const now = new Date().toISOString();
  const bindingId = buildSecretBindingId(fingerprint);
  const ciphertext = encryptSecret(normalizedSecret);

  await withPlatformDuckDbConnection(async (connection) => {
    await connection.run(
      `
        INSERT INTO dataset_secret_bindings (id, fingerprint, ciphertext, created_at, updated_at)
        VALUES ($id, $fingerprint, $ciphertext, $createdAt, $updatedAt)
      `,
      {
        id: bindingId,
        fingerprint,
        ciphertext,
        createdAt: now,
        updatedAt: now,
      },
    );
  });

  return {
    id: bindingId,
    fingerprint,
    ciphertext,
    createdAt: now,
    updatedAt: now,
  };
}

export async function bindDatasetLibrarySecret(input: {
  libraryKey: string;
  secret: string;
}) {
  const libraryKey = normalizeLibraryKey(input.libraryKey);
  const secret = normalizeSecretText(input.secret);
  if (!libraryKey) throw new Error('library key is required');
  if (!secret) throw new Error('dataset secret is required');

  const binding = await ensureDatasetSecretBinding(secret);
  const now = new Date().toISOString();

  await withPlatformDuckDbConnection(async (connection) => {
    await connection.run(
      `
        INSERT INTO dataset_library_secret_map (library_key, secret_binding_id, updated_at)
        VALUES ($libraryKey, $bindingId, $updatedAt)
        ON CONFLICT (library_key) DO UPDATE SET
          secret_binding_id = EXCLUDED.secret_binding_id,
          updated_at = EXCLUDED.updated_at
      `,
      {
        libraryKey,
        bindingId: binding.id,
        updatedAt: now,
      },
    );
    await connection.run(
      `
        UPDATE dataset_secret_bindings
        SET updated_at = $updatedAt
        WHERE id = $bindingId
      `,
      {
        bindingId: binding.id,
        updatedAt: now,
      },
    );
  });

  return binding.id;
}

export async function clearDatasetLibrarySecretBinding(libraryKey: string) {
  const normalizedLibraryKey = normalizeLibraryKey(libraryKey);
  if (!normalizedLibraryKey) return;

  await withPlatformDuckDbConnection(async (connection) => {
    await connection.run(
      `
        DELETE FROM dataset_library_secret_map
        WHERE library_key = $libraryKey
      `,
      { libraryKey: normalizedLibraryKey },
    );
  });
}

export async function loadDatasetSecretProtectedLibraryKeys() {
  const rows = await queryPlatformDuckDbRows<DatasetLibrarySecretMapRow>(
    `
      SELECT library_key
      FROM dataset_library_secret_map
      ORDER BY library_key ASC
    `,
  );
  return normalizeLibraryKeys(rows.map((row) => row.library_key));
}

export async function verifyDatasetSecret(secret: string) {
  const normalizedSecret = normalizeSecretText(secret);
  if (!normalizedSecret) {
    throw new Error('dataset secret is required');
  }

  const binding = await getDatasetSecretBindingByFingerprint(buildSecretFingerprint(normalizedSecret));
  if (!binding) return null;
  const libraryKeys = await getLibraryKeysForSecretBinding(binding.id);
  if (!libraryKeys.length) return null;

  try {
    if (decryptSecret(binding.ciphertext) !== normalizedSecret) {
      return null;
    }
  } catch {
    return null;
  }

  const grant = buildSignedGrant({
    bindingId: binding.id,
    fingerprint: binding.fingerprint,
    libraryKeys,
  });

  return {
    grant,
    libraryKeys,
  };
}

export async function resolveDatasetSecretGrants(input: {
  grants?: unknown;
  activeGrant?: unknown;
}) {
  const candidateGrants = Array.isArray(input.grants) ? input.grants : [];
  const deduped = new Map<string, DatasetSecretGrant>();

  for (const candidate of candidateGrants) {
    const grant = normalizeDatasetSecretGrant(candidate);
    if (!grant || !isDatasetSecretGrantSignatureValid(grant)) continue;

    const binding = await getDatasetSecretBindingById(grant.bindingId);
    if (!binding || binding.fingerprint !== grant.fingerprint) continue;

    const currentLibraryKeys = await getLibraryKeysForSecretBinding(binding.id);
    if (!currentLibraryKeys.length) continue;

    deduped.set(
      binding.id,
      buildSignedGrant({
        bindingId: binding.id,
        fingerprint: binding.fingerprint,
        libraryKeys: currentLibraryKeys,
      }),
    );
  }

  const grants = [...deduped.values()];
  const requestedActiveGrant = normalizeDatasetSecretGrant(input.activeGrant);
  const activeGrant = requestedActiveGrant
    ? grants.find((grant) => (
      grant.bindingId === requestedActiveGrant.bindingId
      && grant.signature === requestedActiveGrant.signature
    )) || null
    : null;
  const fallbackActiveGrant = activeGrant || grants[0] || null;

  return {
    grants,
    activeGrant: fallbackActiveGrant,
    unlockedLibraryKeys: normalizeLibraryKeys(grants.flatMap((grant) => grant.libraryKeys)),
    activeLibraryKeys: normalizeLibraryKeys(fallbackActiveGrant?.libraryKeys || []),
  };
}

export async function linkDocumentsToDatasetSecretBinding(input: {
  documentPaths: string[];
  bindingId: string;
}) {
  const bindingId = normalizeSecretText(input.bindingId);
  const documentPaths = normalizeLibraryKeys(input.documentPaths);
  if (!bindingId || !documentPaths.length) return;

  const now = new Date().toISOString();
  await withPlatformDuckDbConnection(async (connection) => {
    for (const documentPath of documentPaths) {
      await connection.run(
        `
          INSERT INTO document_secret_links (document_path, secret_binding_id, created_at, updated_at)
          VALUES ($documentPath, $bindingId, $createdAt, $updatedAt)
          ON CONFLICT (document_path) DO UPDATE SET
            secret_binding_id = EXCLUDED.secret_binding_id,
            updated_at = EXCLUDED.updated_at
        `,
        {
          documentPath,
          bindingId,
          createdAt: now,
          updatedAt: now,
        },
      );
    }
  });
}
