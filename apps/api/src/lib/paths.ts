import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const API_ROOT = path.resolve(CURRENT_DIR, '..', '..');
export const REPO_ROOT = path.resolve(API_ROOT, '..', '..');
export const STORAGE_ROOT = process.env.AI_DATA_PLATFORM_STORAGE_ROOT
  ? path.resolve(process.env.AI_DATA_PLATFORM_STORAGE_ROOT)
  : path.join(REPO_ROOT, 'storage');
export const STORAGE_CONFIG_DIR = path.join(STORAGE_ROOT, 'config');
export const STORAGE_FILES_DIR = path.join(STORAGE_ROOT, 'files');
export const STORAGE_CACHE_DIR = path.join(STORAGE_ROOT, 'cache');
export const PLATFORM_DUCKDB_FILE = path.join(STORAGE_ROOT, 'platform.duckdb');
export const MEMORY_ROOT = path.join(REPO_ROOT, 'memory');
export const TOOLS_DIR = path.join(REPO_ROOT, 'tools');
