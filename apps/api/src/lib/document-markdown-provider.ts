import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildAugmentedEnv,
  getMarkItDownCommandCandidates,
  getPythonCommandCandidates,
} from './runtime-executables.js';

const execFileAsync = promisify(execFile);

export const DOCUMENT_MARKITDOWN_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.pptx',
  '.pptm',
  '.xlsx',
  '.xls',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.epub',
  '.wav',
  '.mp3',
] as const;

const MARKITDOWN_EXTENSION_SET = new Set<string>(DOCUMENT_MARKITDOWN_EXTENSIONS);

export type DocumentMarkdownSuccess = {
  status: 'succeeded';
  markdownText: string;
  method: 'existing-markdown' | 'markitdown';
};

export type DocumentMarkdownFailure = {
  status: 'failed' | 'unsupported';
  error: string;
};

export type DocumentMarkdownResult = DocumentMarkdownSuccess | DocumentMarkdownFailure;

function normalizeMarkdown(value: string) {
  return String(value || '')
    .replace(/\u0000/g, '')
    .trim();
}

function getMarkItDownTimeoutMs() {
  const parsed = Number(process.env.MARKITDOWN_TIMEOUT_MS || 120000);
  if (!Number.isFinite(parsed) || parsed < 5000) return 120000;
  return Math.floor(parsed);
}

export function supportsMarkItDownExtension(ext: string) {
  return MARKITDOWN_EXTENSION_SET.has(String(ext || '').toLowerCase());
}

async function runMarkItDownCommand(command: string, args: string[]) {
  const result = await execFileAsync(command, args, {
    windowsHide: true,
    timeout: getMarkItDownTimeoutMs(),
    maxBuffer: 64 * 1024 * 1024,
    env: buildAugmentedEnv(),
  });

  return normalizeMarkdown(String(result.stdout || ''));
}

export async function resolveDocumentMarkdownForFile(input: {
  filePath: string;
  ext: string;
  existingText?: string;
}): Promise<DocumentMarkdownResult> {
  const ext = String(input.ext || '').toLowerCase();
  if (ext === '.md') {
    const markdownText = normalizeMarkdown(String(input.existingText || ''));
    if (!markdownText) {
      return { status: 'failed', error: 'existing-markdown-empty' };
    }
    return {
      status: 'succeeded',
      markdownText,
      method: 'existing-markdown',
    };
  }

  if (!supportsMarkItDownExtension(ext)) {
    return { status: 'unsupported', error: 'markitdown-extension-unsupported' };
  }

  const directCandidates = getMarkItDownCommandCandidates();
  const pythonCandidates = getPythonCommandCandidates();
  let lastError = 'markitdown-unavailable';

  for (const command of directCandidates) {
    try {
      const markdownText = await runMarkItDownCommand(command, [input.filePath]);
      if (markdownText) {
        return {
          status: 'succeeded',
          markdownText,
          method: 'markitdown',
        };
      }
      lastError = 'markitdown-empty-output';
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'markitdown-command-failed';
    }
  }

  for (const command of pythonCandidates) {
    try {
      const markdownText = await runMarkItDownCommand(command, ['-m', 'markitdown', input.filePath]);
      if (markdownText) {
        return {
          status: 'succeeded',
          markdownText,
          method: 'markitdown',
        };
      }
      lastError = 'markitdown-empty-output';
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'markitdown-python-module-failed';
    }
  }

  return {
    status: 'failed',
    error: lastError,
  };
}
