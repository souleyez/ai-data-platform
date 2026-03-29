import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DatasourceCredentialSecret } from './datasource-credentials.js';
import type { DatasourceDefinition } from './datasource-definitions.js';
import type { ErpExecutionPlan } from './datasource-erp-connector.js';
import type { ErpOrderCaptureResolution } from './datasource-erp-order-capture.js';

const execFileAsync = promisify(execFile);
const DEFAULT_BROWSER_TIMEOUT_MS = 7_200_000;

export type ErpSessionBrowserExecutorMode =
  | 'contract'
  | 'mcporter';

export type ErpSessionBrowserLaunchContract = {
  datasourceId: string;
  datasourceName: string;
  endpointTarget: string;
  transport: 'session';
  captureMode: 'portal_export' | 'hybrid';
  startUrl: string;
  taskPrompt: string;
  commandPreview: string;
  timeoutMs: number;
  readonlyGuards: string[];
  listPathHints: string[];
  detailPathHints: string[];
  incrementalSync: {
    cursorCandidates: string[];
    dedupeKeys: string[];
    watermarkPolicy: string;
  };
  credentialSummary: {
    requiredCredentials: string[];
    satisfiedCredentials: string[];
    missingCredentials: string[];
    maskedUsername: string;
    hasCookies: boolean;
  };
  steps: string[];
  warnings: string[];
  execution: {
    requested: boolean;
    mode: ErpSessionBrowserExecutorMode;
    status: 'not_requested' | 'completed' | 'unavailable' | 'failed';
    outputPreview: string;
    errorMessage: string;
  };
};

function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

function unique(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function maskUsername(value: unknown) {
  const text = sanitizeText(value, 120);
  if (!text) return '';
  if (text.length <= 2) return `${text[0] || '*'}*`;
  return `${text.slice(0, 2)}***${text.slice(-1)}`;
}

function resolveStartUrl(definition: DatasourceDefinition, entryPath: string) {
  const rawUrl = sanitizeText(definition.config?.url, 240);
  if (!rawUrl) return sanitizeText(entryPath || '/', 160) || '/';

  try {
    return new URL(entryPath || '/', rawUrl).toString();
  } catch {
    return rawUrl;
  }
}

function buildCredentialSummary(requiredCredentials: string[], secret?: DatasourceCredentialSecret | null) {
  const satisfied: string[] = [];
  const missing: string[] = [];

  for (const item of requiredCredentials) {
    if (item === 'username' && sanitizeText(secret?.username, 120)) satisfied.push(item);
    else if (item === 'password' && sanitizeText(secret?.password, 120)) satisfied.push(item);
    else if (item === 'session_cookie' && sanitizeText(secret?.cookies, 240)) satisfied.push(item);
    else if (item === 'api_token' && sanitizeText(secret?.token, 240)) satisfied.push(item);
    else missing.push(item);
  }

  return {
    requiredCredentials,
    satisfiedCredentials: satisfied,
    missingCredentials: missing,
    maskedUsername: maskUsername(secret?.username),
    hasCookies: Boolean(sanitizeText(secret?.cookies, 240)),
  };
}

function buildReadonlySteps(
  definition: DatasourceDefinition,
  executionPlan: ErpExecutionPlan,
  captureResolution: ErpOrderCaptureResolution,
  startUrl: string,
) {
  const capturePlan = captureResolution.plan;
  const modules = executionPlan.modules.join(', ') || 'orders';
  const listPath = capturePlan.listCapture.pathHints[0] || '/portal/orders';
  const detailPath = capturePlan.detailCapture.pathHints[0] || '/portal/orders/detail';
  const cursor = capturePlan.incrementalSync.cursorCandidates[0] || 'updated_at';
  const dedupeKey = capturePlan.incrementalSync.dedupeKeys[0] || 'order_no';
  const targets = definition.targetLibraries.map((item) => item.key).join(', ') || 'orders';

  return [
    `Open ${startUrl} and establish a readonly ERP session for ${modules}.`,
    `Navigate to the order list using ${listPath} and keep the capture scoped to ${targets}.`,
    `Apply readonly filters for date range, status, and ${cursor} overlap windows.`,
    `Collect order headers with ${capturePlan.listCapture.columns.slice(0, 6).join(', ')}.`,
    `Open order detail views through ${detailPath} and capture detail plus line-item fields.`,
    `Use ${dedupeKey} as the primary dedupe key and report blockers instead of taking write actions.`,
  ];
}

function buildTaskPrompt(
  definition: DatasourceDefinition,
  executionPlan: ErpExecutionPlan,
  captureResolution: ErpOrderCaptureResolution,
  credentialSummary: ReturnType<typeof buildCredentialSummary>,
  startUrl: string,
  options?: { includeSecret?: boolean; secret?: DatasourceCredentialSecret | null },
) {
  const capturePlan = captureResolution.plan;
  const lines = [
    'Read-only ERP portal order capture task.',
    `Datasource: ${definition.name} (${definition.id})`,
    `Endpoint target: ${executionPlan.endpointTarget}`,
    `Start URL: ${startUrl}`,
    `Capture mode: ${capturePlan.captureMode}`,
    `Objective: ${capturePlan.objective}`,
    `Readonly guards: ${capturePlan.readonlyGuards.join(' | ')}`,
    `Order list path hints: ${capturePlan.listCapture.pathHints.join(', ')}`,
    `Order detail path hints: ${capturePlan.detailCapture.pathHints.join(', ')}`,
    `Required list columns: ${capturePlan.listCapture.columns.join(', ')}`,
    `Required detail fields: ${capturePlan.detailCapture.fields.join(', ')}`,
    `Required line item fields: ${capturePlan.detailCapture.lineItemFields.join(', ')}`,
    `Incremental cursor candidates: ${capturePlan.incrementalSync.cursorCandidates.join(', ')}`,
    `Primary dedupe keys: ${capturePlan.incrementalSync.dedupeKeys.join(', ')}`,
    `Success signals: ${capturePlan.login.successSignals.join(', ')}`,
    `Credential requirements: ${credentialSummary.requiredCredentials.join(', ') || 'none'}`,
    'Do not submit forms other than the login form needed for readonly access.',
    'Do not create, approve, edit, delete, or trigger workflow actions.',
    'Return a concise JSON summary with usedListPath, usedDetailPath, visibleColumns, blockers, and nextCursorHint.',
  ];

  if (options?.includeSecret) {
    const secretLines = [
      sanitizeText(options.secret?.username, 160) ? `Secure username: ${sanitizeText(options.secret?.username, 160)}` : '',
      sanitizeText(options.secret?.password, 240) ? `Secure password: ${sanitizeText(options.secret?.password, 240)}` : '',
      sanitizeText(options.secret?.cookies, 400) ? `Secure session cookie: ${sanitizeText(options.secret?.cookies, 400)}` : '',
      sanitizeText(options.secret?.token, 240) ? `Secure api token: ${sanitizeText(options.secret?.token, 240)}` : '',
    ].filter(Boolean);
    if (secretLines.length) {
      lines.push(...secretLines);
    }
  }

  return lines.join('\n');
}

function buildCommandPreview(startUrl: string, timeoutMs: number) {
  return `mcporter call autoglm-browser-agent.browser_subagent task="<see taskPrompt>" start_url="${startUrl}" --timeout ${timeoutMs}`;
}

export function resolveErpSessionBrowserExecutorMode(
  value = process.env.ERP_SESSION_BROWSER_EXECUTOR || 'contract',
): ErpSessionBrowserExecutorMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'mcporter') return 'mcporter';
  return 'contract';
}

export function buildErpSessionBrowserLaunchContract(input: {
  definition: DatasourceDefinition;
  executionPlan: ErpExecutionPlan;
  captureResolution: ErpOrderCaptureResolution;
  credentialSecret?: DatasourceCredentialSecret | null;
  requestedExecution?: boolean;
}) {
  if (input.executionPlan.preferredTransport !== 'session') {
    throw new Error('ERP session launch only supports session transport datasources');
  }

  const capturePlan = input.captureResolution.plan;
  const startUrl = resolveStartUrl(input.definition, capturePlan.login.entryPath);
  const credentialSummary = buildCredentialSummary(capturePlan.login.requiredCredentials, input.credentialSecret);
  const warnings = unique([
    ...capturePlan.warnings,
    ...(credentialSummary.missingCredentials.length
      ? [`Missing credential material: ${credentialSummary.missingCredentials.join(', ')}`]
      : []),
  ]).slice(0, 6);
  const timeoutMs = DEFAULT_BROWSER_TIMEOUT_MS;
  const taskPrompt = buildTaskPrompt(
    input.definition,
    input.executionPlan,
    input.captureResolution,
    credentialSummary,
    startUrl,
  );

  return {
    datasourceId: input.definition.id,
    datasourceName: input.definition.name,
    endpointTarget: input.executionPlan.endpointTarget,
    transport: 'session',
    captureMode: input.captureResolution.plan.captureMode === 'portal_export' ? 'portal_export' : 'hybrid',
    startUrl,
    taskPrompt,
    commandPreview: buildCommandPreview(startUrl, timeoutMs),
    timeoutMs,
    readonlyGuards: capturePlan.readonlyGuards.slice(0, 6),
    listPathHints: capturePlan.listCapture.pathHints.slice(0, 5),
    detailPathHints: capturePlan.detailCapture.pathHints.slice(0, 5),
    incrementalSync: {
      cursorCandidates: capturePlan.incrementalSync.cursorCandidates.slice(0, 4),
      dedupeKeys: capturePlan.incrementalSync.dedupeKeys.slice(0, 4),
      watermarkPolicy: capturePlan.incrementalSync.watermarkPolicy,
    },
    credentialSummary,
    steps: buildReadonlySteps(input.definition, input.executionPlan, input.captureResolution, startUrl),
    warnings,
    execution: {
      requested: Boolean(input.requestedExecution),
      mode: resolveErpSessionBrowserExecutorMode(),
      status: input.requestedExecution ? 'unavailable' : 'not_requested',
      outputPreview: '',
      errorMessage: '',
    },
  } satisfies ErpSessionBrowserLaunchContract;
}

export async function runErpSessionBrowserLaunch(input: {
  definition: DatasourceDefinition;
  executionPlan: ErpExecutionPlan;
  captureResolution: ErpOrderCaptureResolution;
  credentialSecret?: DatasourceCredentialSecret | null;
  execute?: boolean;
  executorMode?: ErpSessionBrowserExecutorMode;
}) {
  const contract = buildErpSessionBrowserLaunchContract({
    definition: input.definition,
    executionPlan: input.executionPlan,
    captureResolution: input.captureResolution,
    credentialSecret: input.credentialSecret,
    requestedExecution: input.execute,
  });
  const executorMode = input.executorMode || resolveErpSessionBrowserExecutorMode();

  if (!input.execute) {
    return {
      ...contract,
      execution: {
        ...contract.execution,
        mode: executorMode,
        status: 'not_requested',
      },
    } satisfies ErpSessionBrowserLaunchContract;
  }

  if (executorMode !== 'mcporter') {
    return {
      ...contract,
      execution: {
        ...contract.execution,
        mode: executorMode,
        status: 'unavailable',
        errorMessage: 'ERP session browser executor is not enabled on this runtime.',
      },
    } satisfies ErpSessionBrowserLaunchContract;
  }

  if (contract.credentialSummary.missingCredentials.length) {
    return {
      ...contract,
      execution: {
        ...contract.execution,
        mode: executorMode,
        status: 'unavailable',
        errorMessage: `Missing credential material: ${contract.credentialSummary.missingCredentials.join(', ')}`,
      },
    } satisfies ErpSessionBrowserLaunchContract;
  }

  try {
    const executableTaskPrompt = buildTaskPrompt(
      input.definition,
      input.executionPlan,
      input.captureResolution,
      contract.credentialSummary,
      contract.startUrl,
      {
        includeSecret: true,
        secret: input.credentialSecret,
      },
    );

    const { stdout, stderr } = await execFileAsync(
      'mcporter',
      [
        'call',
        'autoglm-browser-agent.browser_subagent',
        `task=${executableTaskPrompt}`,
        `start_url=${contract.startUrl}`,
        '--timeout',
        String(contract.timeoutMs),
      ],
      {
        timeout: contract.timeoutMs + 10_000,
        maxBuffer: 32 * 1024 * 1024,
      },
    );

    const outputPreview = sanitizeText([stdout, stderr].filter(Boolean).join('\n'), 600);
    return {
      ...contract,
      execution: {
        ...contract.execution,
        mode: executorMode,
        status: 'completed',
        outputPreview,
      },
    } satisfies ErpSessionBrowserLaunchContract;
  } catch (error) {
    return {
      ...contract,
      execution: {
        ...contract.execution,
        mode: executorMode,
        status: 'failed',
        outputPreview: '',
        errorMessage: sanitizeText(error instanceof Error ? error.message : 'ERP session launch failed', 300),
      },
    } satisfies ErpSessionBrowserLaunchContract;
  }
}
