import { promises as fs } from 'node:fs';
import path from 'node:path';

const baseWeb = process.env.AIDP_WEB_BASE_URL || 'http://127.0.0.1:3002';
const baseApi = process.env.AIDP_API_BASE_URL || 'http://127.0.0.1:3100';
const withCloud = process.argv.includes('--with-cloud');
const smokeId = `smoke-${Date.now()}`;
const libraryName = `简历-${smokeId}`;
const tmpDir = path.join(process.cwd(), 'tmp', 'smoke');
const tmpFile = path.join(tmpDir, `${smokeId}-resume.txt`);

let createdLibraryKey = '';
let uploadedDocumentId = '';

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

async function readJson(response, context) {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${context} returned non-JSON response: ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `${context} failed`;
    throw new Error(`${context} failed: ${message}`);
  }

  return payload;
}

async function fetchJson(url, init, context) {
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
  });
  return readJson(response, context);
}

async function poll(fn, { timeoutMs = 15000, intervalMs = 700, label = 'poll' } = {}) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) throw lastError;
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

async function ensureHealthy() {
  const api = await fetchJson(`${baseApi}/api/health`, undefined, 'api health');
  if (api?.status !== 'ok') throw new Error('api health status is not ok');

  const web = await fetch(`${baseWeb}/documents`, { cache: 'no-store' });
  if (!web.ok) throw new Error(`web documents page failed with ${web.status}`);

  log('health', 'API and Web are reachable');
}

async function createLibrary() {
  const payload = await fetchJson(`${baseApi}/api/documents/libraries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: libraryName }),
  }, 'create library');

  createdLibraryKey = payload?.item?.key || '';
  if (!createdLibraryKey) throw new Error('created library key missing');
  log('library', `Created ${libraryName}`);
}

async function uploadResume() {
  await fs.mkdir(tmpDir, { recursive: true });
  const content = [
    '郑宇宁简历',
    '候选人：郑宇宁',
    '目标岗位：技术合伙人',
    '工作经验：15年',
    '教育背景：硕士',
    '技能：AI应用、系统架构、全栈开发、自动化运营',
    '工作经历：曾在互联网公司、科研机构和创业公司负责技术与产品架构。',
  ].join('\n');

  await fs.writeFile(tmpFile, content, 'utf8');
  const fileBuffer = await fs.readFile(tmpFile);
  const form = new FormData();
  form.append('note', 'local smoke test');
  form.append('files', new Blob([fileBuffer], { type: 'text/plain' }), path.basename(tmpFile));

  const payload = await fetchJson(`${baseWeb}/api/documents/upload`, {
    method: 'POST',
    body: form,
  }, 'upload document');

  if (payload?.summary?.successCount !== 1) {
    throw new Error(`upload successCount mismatch: ${payload?.summary?.successCount}`);
  }

  const firstItem = payload?.ingestItems?.[0];
  uploadedDocumentId = firstItem?.id || '';
  if (!uploadedDocumentId) throw new Error('uploaded document id missing');

  const suggested = firstItem?.groupSuggestion?.suggestedGroups || [];
  const suggestedKeys = suggested.map((item) => item.key);
  if (!suggestedKeys.includes(createdLibraryKey)) {
    throw new Error(`resume upload did not suggest ${createdLibraryKey}`);
  }

  log('upload', 'Resume uploaded and suggested into the resume library');
}

async function verifyDocumentVisible() {
  const item = await poll(async () => {
    const payload = await fetchJson(`${baseWeb}/api/documents`, undefined, 'documents list');
    return payload?.items?.find((entry) => entry.id === uploadedDocumentId);
  }, { label: 'uploaded document visibility' });

  if (!item?.suggestedGroups?.includes(createdLibraryKey)) {
    throw new Error('uploaded document is visible but suggestedGroups is missing expected library');
  }

  log('documents', 'Uploaded document is visible in document center');
}

async function confirmGroupAssignment() {
  await fetchJson(`${baseWeb}/api/documents/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: uploadedDocumentId, groups: [createdLibraryKey] }] }),
  }, 'confirm document groups');

  const confirmedItem = await poll(async () => {
    const payload = await fetchJson(`${baseWeb}/api/documents`, undefined, 'documents list after assign');
    const item = payload?.items?.find((entry) => entry.id === uploadedDocumentId);
    return item?.confirmedGroups?.includes(createdLibraryKey) ? item : null;
  }, { label: 'confirm assigned groups' });

  if (!confirmedItem) {
    throw new Error('document group confirmation did not persist');
  }

  log('groups', 'Manual group assignment persisted');
}

async function runCloudChecks() {
  const general = await fetchJson(`${baseWeb}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: '你好' }),
  }, 'general cloud chat');

  if (general?.mode !== 'openclaw' && general?.message?.meta !== '云端智能回复') {
    throw new Error('general chat did not return cloud response');
  }

  const report = await fetchJson(`${baseWeb}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: '请按奶粉配方建议知识库内容输出一份表格报表' }),
  }, 'knowledge report chat');

  if (!['table', 'page', 'pdf', 'ppt'].includes(report?.output?.type)) {
    throw new Error(`knowledge report output type invalid: ${report?.output?.type}`);
  }

  if (!Array.isArray(report?.libraries) || !report.libraries.length) {
    throw new Error('knowledge report did not return matched libraries');
  }

  log('cloud', `Cloud chat ok, report output type: ${report.output.type}`);
}

async function cleanup() {
  if (uploadedDocumentId) {
    try {
      await fetchJson(`${baseWeb}/api/documents/ignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: uploadedDocumentId, ignored: true }] }),
      }, 'cleanup uploaded document');
      log('cleanup', 'Uploaded document removed');
    } catch (error) {
      log('cleanup', `Document cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (createdLibraryKey) {
    try {
      const response = await fetch(`${baseApi}/api/documents/libraries/${encodeURIComponent(createdLibraryKey)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      if (response.ok) {
        log('cleanup', 'Temporary library removed');
      }
    } catch (error) {
      log('cleanup', `Library cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    await fs.rm(tmpFile, { force: true });
  } catch {
    // ignore
  }
}

async function main() {
  try {
    await ensureHealthy();
    await createLibrary();
    await uploadResume();
    await verifyDocumentVisible();
    await confirmGroupAssignment();
    if (withCloud) {
      await runCloudChecks();
    }
    log('done', withCloud ? 'Local + cloud smoke checks passed' : 'Local smoke checks passed');
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
