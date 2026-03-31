import path from 'node:path';
import { promises as fs } from 'node:fs';

function parseArgs(argv) {
  const options = {
    protocol: 'http',
    host: process.env.AIDP_REMOTE_HOST || '120.24.251.24',
    webPort: process.env.AIDP_REMOTE_WEB_PORT || '3002',
    outputDir: path.join(process.cwd(), 'tmp', 'remote-order-check'),
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
  const response = await fetch(url, {
    cache: 'no-store',
    ...init,
  });
  return readJson(response, context);
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

function summarizeCase(key, elapsedMs, payload) {
  const output = payload?.output || {};
  const page = output?.page || {};
  const orchestration = payload?.orchestration || {};
  return {
    key,
    elapsedMs,
    intent: payload?.intent || 'unknown',
    routeKind: orchestration?.routeKind || null,
    evidenceMode: orchestration?.evidenceMode || null,
    title: output?.title || null,
    outputType: output?.type || 'answer',
    libraries: Array.isArray(payload?.libraries)
      ? payload.libraries.map((item) => item?.label || item?.key).filter(Boolean)
      : [],
    cardCount: Array.isArray(page?.cards) ? page.cards.length : 0,
    chartCount: Array.isArray(page?.charts) ? page.charts.length : 0,
    summaryStartsWithBrace: typeof page?.summary === 'string' && page.summary.trimStart().startsWith('{'),
    contentStartsWithBrace: typeof output?.content === 'string' && output.content.trimStart().startsWith('{'),
    summaryPreview: typeof page?.summary === 'string' ? page.summary.slice(0, 160) : '',
    contentPreview: typeof output?.content === 'string' ? output.content.slice(0, 160) : '',
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseWeb = buildBaseUrl(options.protocol, options.host, options.webPort);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = path.join(options.outputDir, timestamp);

  const cases = [
    {
      key: 'order-detail-summary',
      prompt: '请查看订单分析知识库中全部时间范围的订单与库存资料，概括各渠道净销售额、前三品类和库存风险重点。',
    },
    {
      key: 'order-output-generic',
      prompt: '请基于订单分析知识库中全部时间范围的订单与库存资料，按多渠道经营与SKU结构维度生成数据可视化静态页报表。',
    },
    {
      key: 'order-output-stock',
      prompt: '请基于订单分析知识库中全部时间范围的订单与库存资料，按库存与补货维度生成数据可视化静态页报表。',
    },
  ];

  const summary = [];
  for (const item of cases) {
    const started = Date.now();
    const payload = await postJsonUtf8(`${baseWeb}/api/chat`, { prompt: item.prompt }, item.key);
    const elapsedMs = Date.now() - started;
    await writeArtifact(outputDir, `${item.key}.json`, payload);
    const row = summarizeCase(item.key, elapsedMs, payload);
    summary.push(row);
    log(item.key, `${row.outputType} route=${row.routeKind || 'none'} evidence=${row.evidenceMode || 'none'} cards=${row.cardCount} charts=${row.chartCount}`);
  }

  await writeArtifact(outputDir, 'summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
