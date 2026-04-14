import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { STORAGE_CONFIG_DIR } from './paths.js';
import type { OpenClawConfig, PersistedModelConfig } from './model-config-types.js';

export const STORAGE_DIR = STORAGE_CONFIG_DIR;
export const MODEL_CONFIG_FILE = path.join(STORAGE_DIR, 'model-config.json');
export const WINDOWS_OPENCLAW_CONFIG_FILE = path.join(os.homedir(), '.openclaw-autoclaw', 'openclaw.json');
export const WSL_OPENCLAW_CONFIG_PATH = '~/.openclaw/openclaw.json';
export const WSL_CONFIG_READ_TIMEOUT_MS = 2500;
export const WSL_RUNTIME_META_TIMEOUT_MS = 3000;

export function env(name: string, fallback?: string) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export async function ensureStorageDir() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

export async function readPersistedModelConfig(): Promise<PersistedModelConfig> {
  try {
    const raw = await fs.readFile(MODEL_CONFIG_FILE, 'utf8');
    return JSON.parse(raw) as PersistedModelConfig;
  } catch {
    return {};
  }
}

export async function writePersistedModelConfig(payload: PersistedModelConfig) {
  await ensureStorageDir();
  await fs.writeFile(MODEL_CONFIG_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

export function runCommand(file: string, args: string[], input = '') {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(stderr.trim() || `${file} exited with code ${code}`));
    });

    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

export async function readJsonFile(filePath: string) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text) as OpenClawConfig;
  } catch {
    return null;
  }
}

export async function writeJsonFile(filePath: string, data: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}
