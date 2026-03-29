import { promises as fs } from 'node:fs';
import path from 'node:path';

const baseWeb = process.env.AIDP_WEB_BASE_URL || 'http://127.0.0.1:3002';
const baseApi = process.env.AIDP_API_BASE_URL || 'http://127.0.0.1:3100';
const withCloud = process.argv.includes('--with-cloud');
const smokeId = `smoke-${Date.now()}`;
const libraryName = `简历-${smokeId}`;
const tmpDir = path.join(process.cwd(), 'tmp', 'smoke');
const tmpFile = path.join(tmpDir, `${smokeId}-resume.txt`);
const tmpTemplateFile = path.join(tmpDir, `${smokeId}-template.docx`);

let createdLibraryKey = '';
let uploadedDocumentId = '';
let createdFileTemplateKey = '';
let createdLinkTemplateKey = '';
let createdFileTemplateReferenceId = '';
let createdReportOutputId = '';

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

async function loadReportState(context = 'report center state') {
  return fetchJson(`${baseWeb}/api/reports`, undefined, context);
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

  const reports = await fetch(`${baseWeb}/reports`, { cache: 'no-store' });
  if (!reports.ok) throw new Error(`web reports page failed with ${reports.status}`);
  const reportsHtml = await reports.text();
  for (const sectionLabel of ['\u7528\u6237\u4e0a\u4f20\u7684\u6a21\u677f', '\u5df2\u751f\u6210\u7684\u62a5\u8868']) {
    if (!reportsHtml.includes(sectionLabel)) {
      throw new Error(`web reports page is missing section label: ${sectionLabel}`);
    }
  }

  log('health', 'API, document center, and report center are reachable');
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

function findReportTemplate(state, templateKey) {
  return Array.isArray(state?.templates)
    ? state.templates.find((item) => item?.key === templateKey)
    : null;
}

function findReportOutput(state, outputId) {
  return Array.isArray(state?.outputRecords)
    ? state.outputRecords.find((item) => item?.id === outputId)
    : null;
}

async function waitForReportGroup() {
  const state = await poll(async () => {
    const payload = await loadReportState('report center group list');
    return payload?.groups?.some((item) => item?.key === createdLibraryKey) ? payload : null;
  }, { label: 'report center group visibility' });

  log('reports', `Temporary library is available in report center as ${createdLibraryKey}`);
  return state;
}

async function createReportTemplate({ label, sourceType, description }) {
  const payload = await fetchJson(`${baseWeb}/api/reports/template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, sourceType, description }),
  }, `create ${label} template`);

  const templateKey = payload?.item?.key || '';
  if (!templateKey) throw new Error(`${label} template key missing`);
  return {
    key: templateKey,
    item: payload.item,
  };
}

async function uploadTemplateReferenceFile(templateKey) {
  await fs.mkdir(tmpDir, { recursive: true });
  const content = `Local report template smoke file for ${smokeId}\n`;
  await fs.writeFile(tmpTemplateFile, content, 'utf8');

  const fileBuffer = await fs.readFile(tmpTemplateFile);
  const form = new FormData();
  form.append('file', new Blob([fileBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }), path.basename(tmpTemplateFile));

  const payload = await fetchJson(
    `${baseWeb}/api/reports/template-reference?templateKey=${encodeURIComponent(templateKey)}`,
    {
      method: 'POST',
      body: form,
    },
    'upload report template file reference',
  );

  const referenceId = payload?.item?.id || '';
  if (!referenceId) throw new Error('uploaded report template reference id missing');
  return {
    id: referenceId,
    originalName: payload?.item?.originalName || '',
    expectedContent: content,
  };
}

async function uploadTemplateReferenceLink(templateKey) {
  const url = `https://example.com/report-template-${smokeId}`;
  const payload = await fetchJson(`${baseWeb}/api/reports/template-reference-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateKey,
      url,
      label: `Report template link ${smokeId}`,
    }),
  }, 'upload report template link reference');

  const referenceId = payload?.item?.id || '';
  if (!referenceId) throw new Error('uploaded report template link id missing');
  return {
    id: referenceId,
    url,
  };
}

async function verifyTemplateVisibility(templateKey, referenceId, label) {
  await poll(async () => {
    const payload = await loadReportState(`${label} report template visibility`);
    const template = findReportTemplate(payload, templateKey);
    return template?.referenceImages?.some((item) => item?.id === referenceId) ? template : null;
  }, { label: `${label} report template visibility` });
}

async function downloadTemplateReference(templateKey, referenceId, expectedContent, expectedName) {
  const response = await fetch(
    `${baseWeb}/api/reports/template-reference/${encodeURIComponent(referenceId)}/download?templateKey=${encodeURIComponent(templateKey)}`,
    { cache: 'no-store' },
  );
  if (!response.ok) {
    throw new Error(`download report template reference failed with ${response.status}`);
  }

  const downloaded = Buffer.from(await response.arrayBuffer()).toString('utf8');
  if (!downloaded.includes(expectedContent.trim())) {
    throw new Error('downloaded template reference content did not match uploaded file');
  }

  const disposition = response.headers.get('content-disposition') || '';
  if (!disposition.includes(encodeURIComponent(expectedName))) {
    throw new Error('downloaded template reference filename header is missing the uploaded file name');
  }

  log('reports', 'Uploaded template file can be downloaded through the web proxy');
}

async function createGeneratedReport(templateKey) {
  const payload = await fetchJson(`${baseWeb}/api/reports/chat-output`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      groupKey: createdLibraryKey,
      templateKey,
      title: `local-report-output-${smokeId}`,
      kind: 'page',
      content: `Smoke-generated report content for ${smokeId}`,
      page: {
        summary: `Smoke summary for ${smokeId}`,
        cards: [
          { label: 'templates', value: '2', note: 'file and link uploads verified' },
        ],
        sections: [
          {
            title: 'Coverage',
            body: 'Exercises report template uploads, downloads, and deletions.',
            bullets: ['file upload', 'link upload', 'generated report'],
          },
        ],
        charts: [
          {
            title: 'Checks',
            items: [{ label: 'passed', value: 1 }],
          },
        ],
      },
      libraries: [{ key: createdLibraryKey, label: libraryName }],
    }),
  }, 'create generated report output');

  const outputId = payload?.item?.id || '';
  if (!outputId) throw new Error('generated report output id missing');
  return outputId;
}

async function verifyGeneratedReport(outputId) {
  const record = await poll(async () => {
    const payload = await loadReportState('generated report visibility');
    return findReportOutput(payload, outputId);
  }, { label: 'generated report visibility' });

  if (record?.groupKey !== createdLibraryKey) {
    throw new Error('generated report was saved under an unexpected report group');
  }

  log('reports', 'Generated report is visible in report center');
}

async function deleteGeneratedReport(outputId) {
  await fetchJson(`${baseWeb}/api/reports/output/${encodeURIComponent(outputId)}`, {
    method: 'DELETE',
  }, 'delete generated report output');

  await poll(async () => {
    const payload = await loadReportState('generated report removal');
    return findReportOutput(payload, outputId) ? null : true;
  }, { label: 'generated report removal' });

  log('reports', 'Generated report can be deleted from report center');
}

async function deleteTemplateReference(templateKey, referenceId) {
  await fetchJson(
    `${baseWeb}/api/reports/template-reference/${encodeURIComponent(referenceId)}?templateKey=${encodeURIComponent(templateKey)}`,
    {
      method: 'DELETE',
    },
    'delete report template reference',
  );

  await poll(async () => {
    const payload = await loadReportState('report template reference removal');
    const template = findReportTemplate(payload, templateKey);
    return template?.referenceImages?.some((item) => item?.id === referenceId) ? null : true;
  }, { label: 'report template reference removal' });

  log('reports', 'Single uploaded template reference can be deleted');
}

async function deleteTemplate(templateKey, label) {
  await fetchJson(`${baseWeb}/api/reports/template/${encodeURIComponent(templateKey)}`, {
    method: 'DELETE',
  }, `delete ${label} template`);

  await poll(async () => {
    const payload = await loadReportState(`${label} template removal`);
    return findReportTemplate(payload, templateKey) ? null : true;
  }, { label: `${label} template removal` });

  log('reports', `${label} template can be deleted`);
}

async function runReportCenterChecks() {
  await waitForReportGroup();

  const fileTemplate = await createReportTemplate({
    label: `local-report-template-${smokeId}`,
    sourceType: 'word',
    description: 'Local smoke template upload check',
  });
  createdFileTemplateKey = fileTemplate.key;

  const uploadedFile = await uploadTemplateReferenceFile(createdFileTemplateKey);
  createdFileTemplateReferenceId = uploadedFile.id;
  await verifyTemplateVisibility(createdFileTemplateKey, createdFileTemplateReferenceId, 'file');

  const linkTemplate = await createReportTemplate({
    label: `local-report-link-${smokeId}`,
    sourceType: 'web-link',
    description: 'Local smoke template link check',
  });
  createdLinkTemplateKey = linkTemplate.key;

  const uploadedLink = await uploadTemplateReferenceLink(createdLinkTemplateKey);
  await verifyTemplateVisibility(createdLinkTemplateKey, uploadedLink.id, 'link');

  await downloadTemplateReference(
    createdFileTemplateKey,
    createdFileTemplateReferenceId,
    uploadedFile.expectedContent,
    uploadedFile.originalName,
  );

  createdReportOutputId = await createGeneratedReport(createdFileTemplateKey);
  await verifyGeneratedReport(createdReportOutputId);
  await deleteGeneratedReport(createdReportOutputId);
  createdReportOutputId = '';

  await deleteTemplateReference(createdFileTemplateKey, createdFileTemplateReferenceId);
  createdFileTemplateReferenceId = '';

  await deleteTemplate(createdLinkTemplateKey, 'link');
  createdLinkTemplateKey = '';

  await deleteTemplate(createdFileTemplateKey, 'file');
  createdFileTemplateKey = '';
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
  if (createdReportOutputId) {
    try {
      await fetch(`${baseWeb}/api/reports/output/${encodeURIComponent(createdReportOutputId)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      log('cleanup', 'Generated report removed');
    } catch (error) {
      log('cleanup', `Generated report cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (createdFileTemplateReferenceId && createdFileTemplateKey) {
    try {
      await fetch(
        `${baseWeb}/api/reports/template-reference/${encodeURIComponent(createdFileTemplateReferenceId)}?templateKey=${encodeURIComponent(createdFileTemplateKey)}`,
        {
          method: 'DELETE',
          cache: 'no-store',
        },
      );
      log('cleanup', 'Template file reference removed');
    } catch (error) {
      log('cleanup', `Template file reference cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (createdFileTemplateKey) {
    try {
      await fetch(`${baseWeb}/api/reports/template/${encodeURIComponent(createdFileTemplateKey)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      log('cleanup', 'File template removed');
    } catch (error) {
      log('cleanup', `File template cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (createdLinkTemplateKey) {
    try {
      await fetch(`${baseWeb}/api/reports/template/${encodeURIComponent(createdLinkTemplateKey)}`, {
        method: 'DELETE',
        cache: 'no-store',
      });
      log('cleanup', 'Link template removed');
    } catch (error) {
      log('cleanup', `Link template cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
    await fs.rm(tmpTemplateFile, { force: true });
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
    await runReportCenterChecks();
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
