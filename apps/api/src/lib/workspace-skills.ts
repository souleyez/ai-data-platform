import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = path.resolve(LIB_DIR, '../../../../');
const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');

const cache = new Map<string, Promise<string>>();

function stripFrontmatter(content: string) {
  const source = String(content || '');
  if (!source.startsWith('---')) return source.trim();
  const end = source.indexOf('\n---', 3);
  if (end < 0) return source.trim();
  return source.slice(end + 4).trim();
}

async function readTextIfExists(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.trim();
  } catch {
    return '';
  }
}

export async function loadWorkspaceSkillBundle(
  skillName: string,
  referenceFiles: string[] = [],
) {
  const cacheKey = `${skillName}:${referenceFiles.join('|')}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const skillRoot = path.join(SKILLS_ROOT, skillName);
    const skillBody = stripFrontmatter(await readTextIfExists(path.join(skillRoot, 'SKILL.md')));
    const references = await Promise.all(
      referenceFiles.map(async (relativePath) => {
        const content = await readTextIfExists(path.join(skillRoot, relativePath));
        if (!content) return '';
        return [`Reference: ${relativePath}`, content].join('\n');
      }),
    );

    return [
      skillBody ? `Workspace skill: ${skillName}\n${skillBody}` : '',
      ...references.filter(Boolean),
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();
  })();

  cache.set(cacheKey, promise);
  return promise;
}
