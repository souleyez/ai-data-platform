import { promises as fs } from 'node:fs';
import type { DuckDBConnection } from '@duckdb/node-api';
import { DuckDBInstance } from '@duckdb/node-api';
import { PLATFORM_DUCKDB_FILE, STORAGE_ROOT } from './paths.js';

let instancePromise: Promise<DuckDBInstance> | null = null;
let schemaReadyPromise: Promise<void> | null = null;

async function getInstance() {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  if (!instancePromise) {
    instancePromise = DuckDBInstance.fromCache(PLATFORM_DUCKDB_FILE);
  }
  return instancePromise;
}

async function runSchemaMigrations() {
  const instance = await getInstance();
  const connection = await instance.connect();

  try {
    await connection.run(`
      CREATE TABLE IF NOT EXISTS dataset_secret_bindings (
        id VARCHAR PRIMARY KEY,
        fingerprint VARCHAR NOT NULL UNIQUE,
        ciphertext VARCHAR NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);
    await connection.run(`
      CREATE TABLE IF NOT EXISTS dataset_library_secret_map (
        library_key VARCHAR PRIMARY KEY,
        secret_binding_id VARCHAR NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);
    await connection.run(`
      CREATE INDEX IF NOT EXISTS idx_dataset_library_secret_map_binding
      ON dataset_library_secret_map(secret_binding_id)
    `);
    await connection.run(`
      CREATE TABLE IF NOT EXISTS document_secret_links (
        document_path VARCHAR PRIMARY KEY,
        secret_binding_id VARCHAR NOT NULL,
        created_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP NOT NULL
      )
    `);
    await connection.run(`
      CREATE INDEX IF NOT EXISTS idx_document_secret_links_binding
      ON document_secret_links(secret_binding_id)
    `);
  } finally {
    connection.disconnectSync();
  }
}

export async function ensurePlatformDuckDbSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = runSchemaMigrations();
  }
  await schemaReadyPromise;
}

export async function withPlatformDuckDbConnection<T>(handler: (connection: DuckDBConnection) => Promise<T>) {
  await ensurePlatformDuckDbSchema();
  const instance = await getInstance();
  const connection = await instance.connect();

  try {
    return await handler(connection);
  } finally {
    connection.disconnectSync();
  }
}

export async function queryPlatformDuckDbRows<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  values?: Record<string, string>,
) {
  return withPlatformDuckDbConnection(async (connection) => {
    const result = await connection.run(sql, values);
    return await result.getRowObjectsJson() as T[];
  });
}
