import path from 'node:path';
import { promises as fs } from 'node:fs';

function parseArgs(argv) {
  const options = {
    protocol: 'http',
    host: process.env.AIDP_REMOTE_HOST || '120.24.251.24',
    webPort: process.env.AIDP_REMOTE_WEB_PORT || '3002',
    outputDir: path.join(process.cwd(), 'tmp', 'resume-remote-samples'),
    only: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
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
      continue;
    }
    if (value === '--only' && next) {
      options.only = next;
      index += 1;
    }
  }

  return options;
}

function buildBaseUrl(protocol, host, port) {
  return `${protocol}://${host}:${port}`;
}

function simplify(payload) {
  const output = payload?.output || {};
  const page = output?.page || {};
  const resumeDebug = payload?.debug?.resumePage || null;
  return {
    intent: payload?.intent || '',
    libraries: Array.isArray(payload?.libraries) ? payload.libraries.map((item) => item.label || item.key) : [],
    type: output?.type || '',
    title: output?.title || '',
    summary: page?.summary || output?.content || '',
    cards: Array.isArray(page?.cards) ? page.cards : [],
    sections: Array.isArray(page?.sections)
      ? page.sections.map((item) => ({
          title: item?.title || '',
          body: item?.body || '',
          bullets: Array.isArray(item?.bullets) ? item.bullets : [],
        }))
      : [],
    charts: Array.isArray(page?.charts) ? page.charts : [],
    reportTemplate: payload?.reportTemplate || null,
    debug: resumeDebug
      ? {
        templateMode: resumeDebug.templateMode || '',
        displayProfileCount: Array.isArray(resumeDebug.displayProfiles) ? resumeDebug.displayProfiles.length : 0,
        initialNeedsFallback: resumeDebug.initialNeedsFallback === true,
        composerAttempted: Boolean(resumeDebug.composerModelContent),
        composerNeedsFallback: resumeDebug.composerNeedsFallback,
        errorStage: resumeDebug.errorStage || '',
        errorMessage: resumeDebug.errorMessage || '',
        finalStage: resumeDebug.finalStage || '',
      }
      : null,
  };
}

async function postJsonUtf8(url, payload, context) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': String(body.byteLength),
    },
    body,
    cache: 'no-store',
  });

  const text = Buffer.from(await response.arrayBuffer()).toString('utf8');
  const json = JSON.parse(text);
  if (!response.ok) {
    throw new Error(`${context} failed: ${json?.message || json?.error || response.status}`);
  }
  return json;
}

async function writeArtifact(outputDir, name, payload) {
  await fs.mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, name);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseWeb = buildBaseUrl(options.protocol, options.host, options.webPort);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  const prompts = [
    {
      key: 'resume-company-page',
      prompt: '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u516c\u53f8\u7ef4\u5ea6\u6574\u7406\u6d89\u53ca\u516c\u53f8\u7684IT\u9879\u76ee\u4fe1\u606f\uff0c\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002',
    },
    {
      key: 'resume-project-page',
      prompt: '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u9879\u76ee\u7ef4\u5ea6\u6574\u7406 IT \u9879\u76ee\u4fe1\u606f\uff0c\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002',
    },
    {
      key: 'resume-talent-page',
      prompt: '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u4eba\u624d\u7ef4\u5ea6\u6574\u7406\u5019\u9009\u4eba\u80cc\u666f\u548c\u9879\u76ee\u4fe1\u606f\uff0c\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\u3002',
    },
    {
      key: 'resume-skill-page',
      prompt: '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u6309\u6280\u80fd\u7ef4\u5ea6\u751f\u6210\u6570\u636e\u53ef\u89c6\u5316\u9759\u6001\u9875\u62a5\u8868\uff0c\u7a81\u51fa\u6280\u80fd\u8986\u76d6\u3001\u5019\u9009\u4eba\u5206\u5e03\u548c\u9879\u76ee\u5173\u8054\u3002',
    },
    {
      key: 'resume-client-page',
      prompt: '\u8bf7\u57fa\u4e8e\u4eba\u624d\u7b80\u5386\u77e5\u8bc6\u5e93\u4e2d\u5168\u90e8\u65f6\u95f4\u8303\u56f4\u7684\u7b80\u5386\uff0c\u4e3a\u5ba2\u6237\u6c47\u62a5\u51c6\u5907\u4e00\u9875\u53ef\u89c6\u5316\u9759\u6001\u9875\uff0c\u9700\u8981\u7a81\u51fa\u4eba\u624d\u6982\u89c8\u3001\u4ee3\u8868\u9879\u76ee\u3001\u6838\u5fc3\u6280\u80fd\u3001\u5339\u914d\u5efa\u8bae\u548c AI \u7efc\u5408\u5206\u6790\u3002',
    },
  ];
  const onlyKeys = String(options.only || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const activePrompts = onlyKeys.length
    ? prompts.filter((item) => onlyKeys.includes(item.key))
    : prompts;

  for (const item of activePrompts) {
    const payload = await postJsonUtf8(`${baseWeb}/api/chat`, {
      prompt: item.prompt,
      debugResumePage: true,
    }, item.key);
    const simplified = simplify(payload);
    await writeArtifact(options.outputDir, `${timestamp}-${item.key}.json`, payload);
    await writeArtifact(options.outputDir, `${timestamp}-${item.key}-summary.json`, simplified);
    if (payload?.debug?.resumePage) {
      await writeArtifact(options.outputDir, `${timestamp}-${item.key}-debug.json`, payload.debug.resumePage);
    }
    console.log(`[sample] ${item.key} -> ${simplified.title || 'untitled'} | ${simplified.libraries.join(', ')}`);
  }
}

main().catch((error) => {
  console.error(`[fail] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
