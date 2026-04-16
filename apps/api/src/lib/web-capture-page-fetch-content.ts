import { promises as fs } from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { buildAugmentedEnv, getPythonCommandCandidates } from './runtime-executables.js';
import type { LoginForm, MainContentResult, PageResult } from './web-capture-page-fetch-types.js';

const execFileAsync = promisify(execFile);

export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .trim();
}

export function decodeTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1]?.replace(/\s+/g, ' ').trim() || '');
}

async function extractMainContentWithTrafilatura(html: string, url: string) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'aidp-web-'));
  const htmlPath = path.join(tempDir, 'page.html');
  const pythonScript = [
    'import json, sys',
    'if hasattr(sys.stdout, "reconfigure"): sys.stdout.reconfigure(encoding="utf-8")',
    'from pathlib import Path',
    'try:',
    '    import trafilatura',
    'except Exception as exc:',
    '    print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False))',
    '    sys.exit(0)',
    'html = Path(sys.argv[2]).read_text(encoding="utf-8")',
    'downloaded = html',
    'text = trafilatura.extract(downloaded, url=sys.argv[1], include_comments=False, include_tables=True) or ""',
    'metadata = trafilatura.extract_metadata(downloaded)',
    'title = ""',
    'if metadata is not None:',
    '    title = getattr(metadata, "title", "") or ""',
    'print(json.dumps({"ok": True, "text": text, "title": title}, ensure_ascii=False))',
  ].join('\n');

  try {
    await fs.writeFile(htmlPath, html, 'utf8');

    const candidates = getPythonCommandCandidates().map((command) => ({
      command,
      args: ['-c', pythonScript, url, htmlPath],
    }));

    for (const candidate of candidates) {
      try {
        const { stdout } = await execFileAsync(candidate.command, candidate.args, {
          maxBuffer: 32 * 1024 * 1024,
          env: buildAugmentedEnv(),
        });
        const parsed = JSON.parse(String(stdout || '{}')) as { ok?: boolean; text?: string; title?: string };
        if (parsed.ok) {
          return {
            text: String(parsed.text || ''),
            title: String(parsed.title || ''),
          };
        }
      } catch {
        // try next interpreter
      }
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return {
    text: '',
    title: '',
  };
}

export async function extractWebCaptureMainContent(html: string, url: string): Promise<MainContentResult> {
  const extracted = await extractMainContentWithTrafilatura(html, url);
  const normalized = stripHtml(extracted.text || '');
  if (normalized.length >= 180) {
    return {
      text: normalized,
      title: extracted.title || decodeTitle(html),
      method: 'trafilatura',
    };
  }

  return {
    text: stripHtml(html),
    title: decodeTitle(html),
    method: 'fallback',
  };
}

function decodeAttribute(value: string) {
  return decodeHtmlEntities(String(value || '').replace(/^["']|["']$/g, '').trim());
}

function parseHtmlAttributes(input: string) {
  const attributes: Record<string, string> = {};
  const attributeRegex = /([^\s=/>]+)(?:\s*=\s*(".*?"|'.*?'|[^\s>]+))?/g;
  let match: RegExpExecArray | null = null;

  while ((match = attributeRegex.exec(input))) {
    const name = match[1]?.toLowerCase();
    if (!name) continue;
    attributes[name] = decodeAttribute(match[2] || '');
  }

  return attributes;
}

export function isLikelyLoginPage(page: PageResult) {
  return /type=["']password["']/i.test(page.html)
    || /(登录|login|sign in|signin)/i.test(page.title)
    || /(登录|login|sign in|signin)/i.test(page.url);
}

export function extractLoginForm(page: PageResult): LoginForm | null {
  const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match: RegExpExecArray | null = null;

  while ((match = formRegex.exec(page.html))) {
    const formAttrs = parseHtmlAttributes(match[1] || '');
    const body = match[2] || '';
    if (!/type=["']password["']/i.test(body)) continue;

    const fields: LoginForm['fields'] = [];
    const inputRegex = /<input\b([^>]*)>/gi;
    let inputMatch: RegExpExecArray | null = null;
    while ((inputMatch = inputRegex.exec(body))) {
      const attrs = parseHtmlAttributes(inputMatch[1] || '');
      const name = attrs.name || '';
      if (!name) continue;
      fields.push({
        name,
        value: attrs.value || '',
        type: (attrs.type || 'text').toLowerCase(),
      });
    }

    const actionUrl = new URL(formAttrs.action || page.url, page.url).toString();
    const method = String(formAttrs.method || 'POST').trim().toUpperCase() === 'GET' ? 'GET' : 'POST';
    return { actionUrl, method, fields };
  }

  return null;
}
