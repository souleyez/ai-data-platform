import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ErpSessionBrowserLaunchContract,
  ErpSessionLaunchContractInput,
  ErpSessionLaunchRunnerInput,
} from './datasource-erp-session-launch-types.js';
import {
  buildCommandPreview,
  buildCredentialSummary,
  buildReadonlySteps,
  buildTaskPrompt,
  DEFAULT_BROWSER_TIMEOUT_MS,
  resolveErpSessionBrowserExecutorMode,
  resolveStartUrl,
  sanitizeText,
  unique,
} from './datasource-erp-session-launch-support.js';

const execFileAsync = promisify(execFile);

export function buildErpSessionBrowserLaunchContract(input: ErpSessionLaunchContractInput) {
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

export async function runErpSessionBrowserLaunch(input: ErpSessionLaunchRunnerInput) {
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
