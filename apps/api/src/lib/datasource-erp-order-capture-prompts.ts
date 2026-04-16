import type { DatasourceDefinition } from './datasource-definitions.js';
import type { ErpExecutionPlan } from './datasource-erp-connector.js';
import type {
  ErpOrderCapturePlan,
  ErpOrderCaptureProviderMode,
} from './datasource-erp-order-capture-types.js';
import {
  extractJsonObject,
  isObject,
  sanitizeArray,
  sanitizeText,
  unique,
} from './datasource-erp-order-capture-support.js';
import { loadWorkspaceSkillBundle } from './workspace-skills.js';

export async function buildErpOrderCaptureSystemPrompt(
  mode: Extract<ErpOrderCaptureProviderMode, 'openclaw-chat' | 'openclaw-skill'> = 'openclaw-chat',
) {
  const base = [
    'You are a readonly ERP order-capture planner for a private enterprise ingestion system.',
    'Return strict JSON only. No markdown. No explanation.',
    'Plan capture contracts for order headers, line items, payment status, delivery status, and incremental sync.',
    'Never propose POST, PUT, PATCH, DELETE, approve, submit, or workflow actions.',
    'Prefer stable readonly paths, export pages, and list/detail routes.',
    'If the evidence is weak, keep the contract conservative instead of inventing deep routes.',
  ].join(' ');

  if (mode !== 'openclaw-skill') return base;

  const skillInstruction = await loadWorkspaceSkillBundle('erp-order-capture', [
    'references/output-schema.md',
  ]);

  return [
    base,
    skillInstruction
      ? [
          'Follow the project-side workspace skill below as the authoritative ERP order-capture contract.',
          skillInstruction,
        ].join('\n\n')
      : '',
  ].filter(Boolean).join('\n\n');
}

export function buildErpOrderCapturePrompt(
  definition: DatasourceDefinition,
  executionPlan: ErpExecutionPlan,
  fallbackPlan: ErpOrderCapturePlan,
) {
  const payload = {
    datasource: {
      id: definition.id,
      name: definition.name,
      authMode: definition.authMode,
      targetLibraries: definition.targetLibraries.map((item) => item.key),
      url: sanitizeText(definition.config?.url, 200),
      focus: sanitizeText(definition.config?.focus, 200),
      notes: sanitizeText(definition.notes, 240),
    },
    executionPlan: {
      endpointTarget: executionPlan.endpointTarget,
      preferredTransport: executionPlan.preferredTransport,
      bootstrapMode: executionPlan.bootstrapMode,
      executionReadiness: executionPlan.executionReadiness,
      modules: executionPlan.modules,
      endpointHints: executionPlan.endpointHints,
      bootstrapRequests: executionPlan.bootstrapRequests,
      readonlyGuards: executionPlan.readonlyGuards,
      modulePlans: executionPlan.modulePlans,
    },
    seedContract: fallbackPlan,
  };

  return [
    'Build the final readonly ERP order-capture contract for this datasource.',
    'Keep the JSON compact but operationally useful.',
    'Use the seedContract as the safe baseline and only refine it when the input supports the refinement.',
    'Input:',
    JSON.stringify(payload, null, 2),
  ].join('\n\n');
}

export function normalizeCapturePlan(
  rawText: string,
  fallback: ErpOrderCapturePlan,
): ErpOrderCapturePlan | null {
  const raw = extractJsonObject(rawText);
  if (!isObject(raw)) return null;

  const login = isObject(raw.login) ? raw.login : {};
  const listCapture = isObject(raw.listCapture) ? raw.listCapture : {};
  const detailCapture = isObject(raw.detailCapture) ? raw.detailCapture : {};
  const incrementalSync = isObject(raw.incrementalSync) ? raw.incrementalSync : {};
  const transport = sanitizeText(raw.transport, 40);
  const captureMode = sanitizeText(raw.captureMode, 40);

  return {
    transport: transport === 'api' || transport === 'session' || transport === 'generic'
      ? transport
      : fallback.transport,
    captureMode: captureMode === 'list_then_detail' || captureMode === 'portal_export' || captureMode === 'hybrid'
      ? captureMode
      : fallback.captureMode,
    objective: sanitizeText(raw.objective, 220) || fallback.objective,
    readonlyGuards: unique([
      ...sanitizeArray(raw.readonlyGuards, 180),
      ...fallback.readonlyGuards,
    ]).slice(0, 6),
    login: {
      entryPath: sanitizeText(login.entryPath, 120) || fallback.login.entryPath,
      successSignals: unique([
        ...sanitizeArray(login.successSignals, 80),
        ...fallback.login.successSignals,
      ]).slice(0, 4),
      requiredCredentials: unique([
        ...sanitizeArray(login.requiredCredentials, 40),
        ...fallback.login.requiredCredentials,
      ]).slice(0, 4),
    },
    listCapture: {
      pathHints: unique([
        ...sanitizeArray(listCapture.pathHints, 120),
        ...fallback.listCapture.pathHints,
      ]).slice(0, 5),
      filterHints: unique([
        ...sanitizeArray(listCapture.filterHints, 120),
        ...fallback.listCapture.filterHints,
      ]).slice(0, 5),
      columns: unique([
        ...sanitizeArray(listCapture.columns, 40),
        ...fallback.listCapture.columns,
      ]).slice(0, 8),
      paginationHints: unique([
        ...sanitizeArray(listCapture.paginationHints, 140),
        ...fallback.listCapture.paginationHints,
      ]).slice(0, 4),
    },
    detailCapture: {
      pathHints: unique([
        ...sanitizeArray(detailCapture.pathHints, 120),
        ...fallback.detailCapture.pathHints,
      ]).slice(0, 5),
      fields: unique([
        ...sanitizeArray(detailCapture.fields, 40),
        ...fallback.detailCapture.fields,
      ]).slice(0, 10),
      lineItemFields: unique([
        ...sanitizeArray(detailCapture.lineItemFields, 40),
        ...fallback.detailCapture.lineItemFields,
      ]).slice(0, 8),
    },
    incrementalSync: {
      cursorCandidates: unique([
        ...sanitizeArray(incrementalSync.cursorCandidates, 40),
        ...fallback.incrementalSync.cursorCandidates,
      ]).slice(0, 4),
      dedupeKeys: unique([
        ...sanitizeArray(incrementalSync.dedupeKeys, 40),
        ...fallback.incrementalSync.dedupeKeys,
      ]).slice(0, 4),
      watermarkPolicy: sanitizeText(incrementalSync.watermarkPolicy, 220) || fallback.incrementalSync.watermarkPolicy,
    },
    warnings: unique([
      ...fallback.warnings,
      ...sanitizeArray(raw.warnings, 160),
    ]).slice(0, 6),
  };
}
