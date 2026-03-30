import { promises as fs } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

const INCLUDED_ROOTS = ['apps', 'docs', 'skills', 'tools'];
const INCLUDED_FILES = new Set(['.editorconfig', '.gitattributes', 'package.json']);
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.css',
  '.html',
  '.txt',
  '.ps1',
  '.py',
]);
const EXCLUDED_DIR_NAMES = new Set(['node_modules', '.next', 'dist', 'coverage', '.git', 'storage', 'tmp']);

function fromCodePoints(...codePoints) {
  return String.fromCodePoint(...codePoints);
}

const SUSPICIOUS_TOKENS = [
  '鍩轰簬',
  '鐭ヨ瘑搴',
  '杈撳嚭',
  '绠€鍘',
  '鏍囦功',
  '璁㈠崟',
  '闈欐€侀〉',
  '缁煎悎鍒嗘瀽',
  '璇佹嵁鏉ユ簮',
  '妯℃澘',
  '椤圭洰',
  '鍏徃',
  '鏈€杩',
  '鏁版嵁',
  fromCodePoints(0x951F),
  fromCodePoints(0x9225),
  fromCodePoints(0x935A),
  fromCodePoints(0x93C2),
  fromCodePoints(0x7EE0),
];

const REPLACEMENT_CHAR = '\uFFFD';

const KNOWN_DEBT_ALLOWLIST = new Set();

function toRepoRelative(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

async function walk(dirPath, files) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      await walk(fullPath, files);
      continue;
    }

    const relativePath = toRepoRelative(fullPath);
    const extension = path.extname(entry.name).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension) || INCLUDED_FILES.has(relativePath)) {
      files.push(fullPath);
    }
  }
}

function shouldInclude(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (INCLUDED_FILES.has(normalized)) return true;

  const firstSegment = normalized.split('/')[0];
  if (!INCLUDED_ROOTS.includes(firstSegment)) return false;

  const extension = path.extname(normalized).toLowerCase();
  return TEXT_EXTENSIONS.has(extension);
}

async function listTrackedFiles() {
  try {
    const { stdout } = await execFile('git', ['-C', repoRoot, 'ls-files', '-z'], {
      cwd: repoRoot,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    });

    return stdout
      .split('\0')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry) => shouldInclude(entry))
      .map((entry) => path.join(repoRoot, entry));
  } catch {
    return [];
  }
}

function collectHits(content) {
  const lines = content.split(/\r?\n/);
  const hits = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const tokens = SUSPICIOUS_TOKENS.filter((token) => line.includes(token));
    if (tokens.length) {
      hits.push({ line: index + 1, tokens, preview: line.trim().slice(0, 160) });
    }
    if (line.includes(REPLACEMENT_CHAR)) {
      hits.push({ line: index + 1, tokens: [REPLACEMENT_CHAR], preview: line.trim().slice(0, 160) });
    }
  }

  return hits;
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf;
}

async function main() {
  const trackedFiles = await listTrackedFiles();
  const files = trackedFiles.length ? [...new Set(trackedFiles)] : [];

  if (!files.length) {
    for (const root of INCLUDED_ROOTS) {
      const fullPath = path.join(repoRoot, root);
      await walk(fullPath, files);
    }

    for (const fileName of INCLUDED_FILES) {
      const fullPath = path.join(repoRoot, fileName);
      try {
        await fs.access(fullPath);
        files.push(fullPath);
      } catch {
        // ignore missing optional root files
      }
    }
  }

  const failures = [];
  const knownDebt = [];

  for (const filePath of files) {
    const relativePath = toRepoRelative(filePath);
    if (relativePath === 'tools/check-text-integrity.mjs') continue;

    let buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }
    const content = buffer.toString('utf8');
    const hits = collectHits(content);
    const bomHit = hasUtf8Bom(buffer)
      ? [{ line: 1, tokens: ['UTF8_BOM'], preview: 'File starts with a UTF-8 BOM byte order mark.' }]
      : [];
    const allHits = [...bomHit, ...hits];
    if (!allHits.length) continue;

    const payload = {
      file: relativePath,
      hits: allHits.slice(0, 8),
      totalHits: allHits.length,
    };

    if (KNOWN_DEBT_ALLOWLIST.has(relativePath)) {
      knownDebt.push(payload);
    } else {
      failures.push(payload);
    }
  }

  if (knownDebt.length) {
    console.warn('Known text-integrity debt:');
    for (const item of knownDebt) {
      console.warn(`- ${item.file} (${item.totalHits} hits)`);
    }
    console.warn('');
  }

  if (failures.length) {
    console.error('Text integrity check failed. Suspicious mojibake detected:');
    for (const item of failures) {
      console.error(`- ${item.file} (${item.totalHits} hits)`);
      for (const hit of item.hits) {
        console.error(`  L${hit.line}: [${hit.tokens.join(', ')}] ${hit.preview}`);
      }
    }
    process.exitCode = 1;
    return;
  }

  console.log('Text integrity check passed.');
}

await main();
