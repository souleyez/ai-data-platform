import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

export const CONTROL_PLANE_API_ROOT = path.resolve(CURRENT_DIR, '..', '..');
export const REPO_ROOT = path.resolve(CONTROL_PLANE_API_ROOT, '..', '..');
export const STORAGE_ROOT = process.env.AI_DATA_PLATFORM_STORAGE_ROOT
  ? path.resolve(process.env.AI_DATA_PLATFORM_STORAGE_ROOT)
  : path.join(REPO_ROOT, 'storage');
export const CONTROL_PLANE_STORAGE_DIR = path.join(STORAGE_ROOT, 'control-plane');
export const CONTROL_PLANE_STATE_FILE = path.join(CONTROL_PLANE_STORAGE_DIR, 'state.json');
