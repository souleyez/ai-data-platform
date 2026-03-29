import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
  assertInvalidSharedReportHtml,
  assertReportCenterPageHtml,
  assertSectionsContainInOrder,
  assertValidSharedReportHtml,
  buildSharedReportPayload,
} from './report-smoke-helpers.mjs';

function parseArgs(argv) {
  const options = {
    protocol: 'http',
    host: process.env.AIDP_REMOTE_HOST || '120.24.251.24',
    webPort: process.env.AIDP_REMOTE_WEB_PORT || '3002',
    apiPort: process.env.AIDP_REMOTE_API_PORT || '3100',
    outputDir: path.join(process.cwd(), 'tmp', 'smoke-remote'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;

    const next = argv[index + 1];
    if (value === '--protocol' && next) {
      options.protocol = next;
      index += 1;
      continue;
    }
    if (value === '--host' && next) {
      options.host = next;
      index += 1;
      continue;
    }
    if (value === '--web-port' && next) {
      options.webPort = next;
      index += 1;
      continue;
    }
    if (value === '--api-port' && next) {
      options.apiPort = next;
      index += 1;
      continue;
    }
    if (value === '--output-dir' && next) {
      options.outputDir = next;
      index += 1;
    }
  }

  return options;
}

function buildBaseUrl(protocol, host, port) {
  return `${protocol}://${host}:${port}`;
}

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

async function readJson(response, context) {
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');
  let payload = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`${context} returned non-JSON response: ${text.slice(0, 240)}`);
  }

  if (!response.ok) {
    const message = payload?.message || payload?.error || `${context} failed`;
    throw new Error(`${context} failed: ${message}`);
  }

  return payload;
}

async function fetchJson(url, init, context) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        ...init,
      });
      return await readJson(response, context);
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }

  throw new Error(`${context} failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fetchText(url, init, context) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        ...init,
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      const text = buffer.toString('utf8');
      if (!response.ok) {
        throw new Error(`${context} failed with ${response.status}: ${text.slice(0, 240)}`);
      }
      return {
        status: response.status,
        headers: response.headers,
        text,
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }
  }

  throw new Error(`${context} failed after retries: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function postJsonUtf8(url, payload, context) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  return fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.byteLength),
    },
    body,
  }, context);
}

function toEscapedJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/[\u007f-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

async function writeArtifact(outputDir, name, payload) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, name);
  await fs.writeFile(filePath, `${toEscapedJson(payload)}\n`, 'utf8');
  return filePath;
}

async function writeTextArtifact(outputDir, name, text) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, name);
  await fs.writeFile(filePath, text, 'utf8');
  return filePath;
}

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function readInstallMode(payload) {
  return String(
    payload?.installMode
    || payload?.openclaw?.installMode
    || payload?.mode
    || 'unknown',
  );
}

function readModelLabel(payload) {
  const current = payload?.currentModel || payload?.model || {};
  if (typeof current === 'string') return current;
  return String(current?.label || current?.id || 'unknown');
}

function readLibraries(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function matchesLibraryAliases(item, aliases) {
  const normalizedAliases = aliases.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean);
  const key = String(item?.key || '').trim().toLowerCase();
  const label = String(item?.label || '').trim().toLowerCase();
  return normalizedAliases.includes(key) || normalizedAliases.includes(label);
}

function readLibraryCount(libraries, aliases) {
  const library = libraries.find((item) => matchesLibraryAliases(item, aliases));
  return Number(library?.documentCount || 0);
}

function assertMatchedLibrary(payload, aliases, context) {
  assertCondition(
    Array.isArray(payload?.libraries) && payload.libraries.some((item) => matchesLibraryAliases(item, aliases)),
    `${context} did not route to expected library`,
  );
}

function readPageSections(payload) {
  return Array.isArray(payload?.output?.page?.sections)
    ? payload.output.page.sections.map((item) => String(item?.title || '').trim()).filter(Boolean)
    : [];
}

function readPageSummary(payload) {
  return String(payload?.output?.page?.summary || '').trim();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseApi = buildBaseUrl(options.protocol, options.host, options.apiPort);
  const baseWeb = buildBaseUrl(options.protocol, options.host, options.webPort);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  log('target', `${baseWeb} / ${baseApi}`);

  const health = await fetchJson(`${baseApi}/api/health`, undefined, 'api health');
  assertCondition(health?.status === 'ok', 'api health status is not ok');
  await writeArtifact(options.outputDir, `${timestamp}-health.json`, health);
  log('health', 'API health ok');

  const modelConfig = await fetchJson(`${baseApi}/api/model-config`, undefined, 'model config');
  await writeArtifact(options.outputDir, `${timestamp}-model-config.json`, modelConfig);
  log('model', `installMode=${readInstallMode(modelConfig)} model=${readModelLabel(modelConfig)}`);

  const librariesPayload = await fetchJson(`${baseApi}/api/documents/libraries`, undefined, 'document libraries');
  const libraries = readLibraries(librariesPayload);
  await writeArtifact(options.outputDir, `${timestamp}-document-libraries.json`, librariesPayload);
  log('libraries', libraries.map((item) => `${item.label || item.key}:${item.documentCount || 0}`).join(', '));

  const webResponse = await fetch(`${baseWeb}/`, { cache: 'no-store' });
  assertCondition(webResponse.ok, `web root failed with ${webResponse.status}`);
  log('web', 'Web root ok');

  const reportsPage = await fetchText(`${baseWeb}/reports`, undefined, 'reports page');
  await writeTextArtifact(options.outputDir, `${timestamp}-reports-page.html`, reportsPage.text);
  assertReportCenterPageHtml(reportsPage.text, 'reports page');
  log('reports-page', 'Report center page ok');

  const sharedPayload = buildSharedReportPayload({
    title: 'remote-shared-smoke-title',
    createdAt: '2026-03-29T00:00:00.000Z',
    content: 'remote shared smoke content',
    page: {
      summary: 'remote shared smoke summary',
      cards: [{ label: 'Status', value: 'OK', note: 'remote shared smoke card' }],
      sections: [{ title: 'Coverage', body: 'remote shared smoke section body', bullets: ['remote bullet'] }],
      charts: [{ title: 'Chart', items: [{ label: 'passed', value: 1 }] }],
    },
  });
  const sharedReport = await fetchText(
    `${baseWeb}/shared/report?payload=${encodeURIComponent(sharedPayload)}`,
    undefined,
    'shared report page',
  );
  await writeTextArtifact(options.outputDir, `${timestamp}-shared-report-valid.html`, sharedReport.text);
  assertValidSharedReportHtml(sharedReport.text, {
    title: 'remote-shared-smoke-title',
    page: {
      summary: 'remote shared smoke summary',
      cards: [{ label: 'Status', value: 'OK', note: 'remote shared smoke card' }],
    },
  }, 'shared report page');
  log('shared-report', 'Valid shared report page ok');

  const invalidSharedReport = await fetchText(
    `${baseWeb}/shared/report?payload=invalid-smoke`,
    undefined,
    'invalid shared report page',
  );
  await writeTextArtifact(options.outputDir, `${timestamp}-shared-report-invalid.html`, invalidSharedReport.text);
  assertInvalidSharedReportHtml(invalidSharedReport.text, 'invalid shared report page');
  log('shared-report-invalid', 'Invalid shared report fallback ok');

  const generalPrompt = '\u4f60\u597d';
  const reportPrompt = '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u516c\u53f8\u7ef4\u5ea6\u6574\u7406\u6d89\u53ca\u516c\u53f8\u7684IT\u9879\u76ee\u4fe1\u606f\uff0c\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002';
  const projectPagePrompt = '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u9879\u76ee\u7ef4\u5ea6\u6574\u7406 IT \u9879\u76ee\u4fe1\u606f\uff0c\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002';
  const talentPagePrompt = '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u4eba\u624d\u7ef4\u5ea6\u6574\u7406\u5019\u9009\u4eba\u80cc\u666f\u548c\u9879\u76ee\u4fe1\u606f\uff0c\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002';
  const skillTablePrompt = '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u6280\u80fd\u7ef4\u5ea6\u6574\u7406\u5019\u9009\u4eba\u4fe1\u606f\uff0c\u8f93\u51fa\u8868\u683c\u3002';
  const paperPagePrompt = '\u8bf7\u57fa\u4e8e\u5b66\u672f\u8bba\u6587\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u8bba\u6587\uff0c\u6309\u7814\u7a76\u7ed3\u8bba\u7ef4\u5ea6\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002';
  const bidsPagePrompt = '\u8bf7\u57fa\u4e8e bids \u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u6807\u4e66\u8d44\u6599\uff0c\u6309\u98ce\u9669\u7ef4\u5ea6\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002';
  const iotPagePrompt = '\u8bf7\u57fa\u4e8e IOT\u89e3\u51b3\u65b9\u6848 \u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u8d44\u6599\uff0c\u6309\u6a21\u5757\u7ef4\u5ea6\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002';
  const detailPrompt = '\u8bf7\u8be6\u7ec6\u770b\u770b\u6211\u521a\u4e0a\u4f20\u7684\u7b80\u5386\u91cc\u7b2c\u4e00\u5b66\u5386\u548c\u6700\u8fd1\u516c\u53f8\u5206\u522b\u662f\u4ec0\u4e48\uff1f';
  const rejectPrompt = '\u4e0d\u8981\u6309\u5e93\uff0c\u76f4\u63a5\u56de\u7b54\u6211\u4eca\u5929\u5e94\u8be5\u5148\u5173\u6ce8\u4ec0\u4e48\u3002';
  const datasourcePrompt = '\u6bcf\u5468\u6293\u53d6\u4e2d\u56fd\u653f\u5e9c\u91c7\u8d2d\u7f51\u91cc\u533b\u7597\u8bbe\u5907\u76f8\u5173\u7684\u62db\u6807\u516c\u544a\uff0c\u843d\u5230 bids \u77e5\u8bc6\u5e93\u3002';

  const general = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: generalPrompt }, 'general chat');
  assertCondition(Boolean(general?.message?.content || general?.content), 'general chat returned empty content');
  await writeArtifact(options.outputDir, `${timestamp}-general-chat.json`, general);
  log('chat', `general mode=${general?.mode || 'unknown'} intent=${general?.intent || 'unknown'}`);

  const report = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: reportPrompt }, 'resume report chat');
  assertCondition(report?.intent === 'report', `expected report intent, got ${report?.intent || 'unknown'}`);
  assertCondition(report?.output?.type === 'page', `expected page output, got ${report?.output?.type || 'unknown'}`);
  assertCondition(Array.isArray(report?.libraries) && report.libraries.length > 0, 'resume report chat returned no matched libraries');
  await writeArtifact(options.outputDir, `${timestamp}-resume-report-chat.json`, report);
  log('report', `output=${report.output.type} libraries=${report.libraries.map((item) => item.label || item.key).join(', ')}`);

  const projectPage = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: projectPagePrompt }, 'resume project page chat');
  assertCondition(projectPage?.intent === 'report', `expected report intent for project page, got ${projectPage?.intent || 'unknown'}`);
  assertCondition(projectPage?.output?.type === 'page', `expected page output for project page, got ${projectPage?.output?.type || 'unknown'}`);
  assertCondition(Array.isArray(projectPage?.libraries) && projectPage.libraries.length > 0, 'resume project page returned no matched libraries');
  await writeArtifact(options.outputDir, `${timestamp}-resume-project-page-chat.json`, projectPage);
  log('project-page', `output=${projectPage.output.type} libraries=${projectPage.libraries.map((item) => item.label || item.key).join(', ')}`);

  const talentPage = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: talentPagePrompt }, 'resume talent page chat');
  assertCondition(talentPage?.intent === 'report', `expected report intent for talent page, got ${talentPage?.intent || 'unknown'}`);
  assertCondition(talentPage?.output?.type === 'page', `expected page output for talent page, got ${talentPage?.output?.type || 'unknown'}`);
  assertCondition(Array.isArray(talentPage?.libraries) && talentPage.libraries.length > 0, 'resume talent page returned no matched libraries');
  await writeArtifact(options.outputDir, `${timestamp}-resume-talent-page-chat.json`, talentPage);
  log('talent-page', `output=${talentPage.output.type} libraries=${talentPage.libraries.map((item) => item.label || item.key).join(', ')}`);

  const skillTable = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: skillTablePrompt }, 'resume skill table chat');
  assertCondition(skillTable?.intent === 'report', `expected report intent for skill table, got ${skillTable?.intent || 'unknown'}`);
  assertCondition(skillTable?.output?.type === 'table', `expected table output, got ${skillTable?.output?.type || 'unknown'}`);
  assertCondition(Array.isArray(skillTable?.libraries) && skillTable.libraries.length > 0, 'resume skill table returned no matched libraries');
  await writeArtifact(options.outputDir, `${timestamp}-resume-skill-table-chat.json`, skillTable);
  log('skill-table', `output=${skillTable.output.type} libraries=${skillTable.libraries.map((item) => item.label || item.key).join(', ')}`);

  const paperCount = readLibraryCount(libraries, ['paper', '学术论文']);
  if (paperCount > 0) {
    const paperPage = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: paperPagePrompt }, 'paper page chat');
    assertCondition(paperPage?.intent === 'report', `expected report intent for paper page, got ${paperPage?.intent || 'unknown'}`);
    assertCondition(paperPage?.output?.type === 'page', `expected page output for paper page, got ${paperPage?.output?.type || 'unknown'}`);
    assertCondition(Array.isArray(paperPage?.libraries) && paperPage.libraries.length > 0, 'paper page returned no matched libraries');
    await writeArtifact(options.outputDir, `${timestamp}-paper-page-chat.json`, paperPage);
    log('paper-page', `output=${paperPage.output.type} libraries=${paperPage.libraries.map((item) => item.label || item.key).join(', ')}`);
  } else {
    log('paper-page', 'skipped (paper library has no documents)');
  }

  const bidsCount = readLibraryCount(libraries, ['bids', '标书']);
  const bidsPage = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: bidsPagePrompt }, 'bids page chat');
  await writeArtifact(options.outputDir, `${timestamp}-bids-page-chat.json`, bidsPage);
  assertCondition(bidsPage?.intent === 'report', `expected report intent for bids page, got ${bidsPage?.intent || 'unknown'}`);
  assertMatchedLibrary(bidsPage, ['bids', '标书'], 'bids page');
  assertCondition(bidsPage?.reportTemplate == null, 'expected bids page to stay in concept-page mode without shared template');
  if (bidsCount > 0) {
    assertCondition(bidsPage?.output?.type === 'page', `expected page output for bids page, got ${bidsPage?.output?.type || 'unknown'}`);
    assertSectionsContainInOrder(
      readPageSections(bidsPage),
      ['风险概览', '资格风险', '材料缺口', '时间风险', '应答建议', 'AI综合分析'],
      'bids page',
    );
    assertCondition(!/^```json/i.test(readPageSummary(bidsPage)), 'bids page summary should not echo raw supply json');
    assertCondition((bidsPage?.output?.page?.cards?.length || 0) > 0, 'bids page should contain concept-page cards');
  } else {
    assertCondition(bidsPage?.output?.type === 'answer', `expected answer fallback for empty bids library, got ${bidsPage?.output?.type || 'unknown'}`);
  }
  log(
    'bids-page',
    bidsCount > 0
      ? `output=${bidsPage.output.type} libraries=${bidsPage.libraries.map((item) => item.label || item.key).join(', ')}`
      : `fallback=${bidsPage?.output?.type || 'unknown'} libraries=${bidsPage.libraries.map((item) => item.label || item.key).join(', ')}`,
  );

  const iotCount = readLibraryCount(libraries, ['iot解决方案', 'iot']);
  const iotPage = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: iotPagePrompt }, 'iot page chat');
  await writeArtifact(options.outputDir, `${timestamp}-iot-page-chat.json`, iotPage);
  assertCondition(iotPage?.intent === 'report', `expected report intent for iot page, got ${iotPage?.intent || 'unknown'}`);
  assertMatchedLibrary(iotPage, ['iot解决方案', 'iot'], 'iot page');
  assertCondition(iotPage?.reportTemplate == null, 'expected iot page to stay in concept-page mode without shared template');
  if (iotCount > 0) {
    assertCondition(iotPage?.output?.type === 'page', `expected page output for iot page, got ${iotPage?.output?.type || 'unknown'}`);
    assertSectionsContainInOrder(
      readPageSections(iotPage),
      ['模块概览', '设备与网关', '平台能力', '接口集成', '交付关系', 'AI综合分析'],
      'iot page',
    );
    assertCondition(!/^```json/i.test(readPageSummary(iotPage)), 'iot page summary should not echo raw supply json');
    assertCondition((iotPage?.output?.page?.cards?.length || 0) > 0, 'iot page should contain concept-page cards');
  } else {
    assertCondition(iotPage?.output?.type === 'answer', `expected answer fallback for empty iot library, got ${iotPage?.output?.type || 'unknown'}`);
  }
  log(
    'iot-page',
    iotCount > 0
      ? `output=${iotPage.output.type} libraries=${iotPage.libraries.map((item) => item.label || item.key).join(', ')}`
      : `fallback=${iotPage?.output?.type || 'unknown'} libraries=${iotPage.libraries.map((item) => item.label || item.key).join(', ')}`,
  );

  const detail = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: detailPrompt }, 'recent document detail chat');
  assertCondition(detail?.intent === 'general', `expected general intent for detail prompt, got ${detail?.intent || 'unknown'}`);
  assertCondition(detail?.output?.type === 'answer' || !detail?.output, 'detail prompt should not route to report output');
  await writeArtifact(options.outputDir, `${timestamp}-recent-detail-chat.json`, detail);
  log('detail', `intent=${detail?.intent || 'unknown'} output=${detail?.output?.type || 'answer'}`);

  const reject = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: rejectPrompt }, 'reject knowledge chat');
  assertCondition(reject?.intent === 'general', `expected general intent for reject prompt, got ${reject?.intent || 'unknown'}`);
  assertCondition(reject?.output?.type === 'answer' || !reject?.output, 'reject prompt should stay in direct answer mode');
  assertCondition(!Array.isArray(reject?.libraries) || reject.libraries.length === 0, 'reject prompt should not attach matched libraries');
  await writeArtifact(options.outputDir, `${timestamp}-reject-knowledge-chat.json`, reject);
  log('reject', `intent=${reject?.intent || 'unknown'} output=${reject?.output?.type || 'answer'}`);

  const datasourcePlan = await postJsonUtf8(`${baseWeb}/api/datasources/plan`, { prompt: datasourcePrompt }, 'datasource plan');
  assertCondition(datasourcePlan?.status === 'planned', `expected planned status, got ${datasourcePlan?.status || 'unknown'}`);
  assertCondition(datasourcePlan?.draft?.kind === 'web_discovery', `expected web_discovery kind, got ${datasourcePlan?.draft?.kind || 'unknown'}`);
  assertCondition(
    Array.isArray(datasourcePlan?.draft?.targetLibraries)
      && datasourcePlan.draft.targetLibraries.some((item) => item.key === 'bids' || item.label === 'bids'),
    'datasource plan did not route to bids library',
  );
  await writeArtifact(options.outputDir, `${timestamp}-datasource-plan.json`, datasourcePlan);
  log('datasource', `kind=${datasourcePlan.draft.kind} targets=${datasourcePlan.draft.targetLibraries.map((item) => item.label || item.key).join(', ')}`);

  log('done', `UTF-8 safe remote smoke passed. Artifacts: ${options.outputDir}`);
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
