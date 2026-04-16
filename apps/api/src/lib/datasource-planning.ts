import { loadDocumentLibraries } from './document-libraries.js';
import type {
  DatasourceAuthMode,
  DatasourceKind,
} from './datasource-definitions.js';
import { collectLibraryMatches } from './knowledge-plan.js';
import { listDatasourcePresets } from './datasource-presets.js';
import {
  buildFallbackDraft,
  buildFallbackTargetLibraries,
  detectAuthMode,
  detectKind,
  detectSchedule,
  matchPresets,
  type DatasourcePlanDraft,
} from './datasource-planning-support.js';
import {
  looksLikeBrokenPlan,
  parseCloudPlan,
  tryCloudPlanning,
} from './datasource-planning-cloud.js';

export type { DatasourcePlanDraft } from './datasource-planning-support.js';

export async function planDatasourceFromPrompt(prompt: string) {
  const [libraries, presets] = await Promise.all([loadDocumentLibraries(), Promise.resolve(listDatasourcePresets())]);
  const libraryMatches = collectLibraryMatches(prompt, libraries);
  const presetMatches = matchPresets(prompt, presets);
  const fallbackKind = detectKind(prompt);
  const fallbackAuth = detectAuthMode(prompt, fallbackKind);
  const fallbackSchedule = detectSchedule(prompt);
  const fallbackTargets = buildFallbackTargetLibraries(prompt, presetMatches, libraryMatches);

  const fallbackDraft = buildFallbackDraft(
    prompt,
    fallbackKind,
    fallbackAuth,
    fallbackSchedule,
    fallbackTargets,
    presetMatches,
    libraryMatches,
  );

  const canTrustFallback = fallbackKind === 'database' || fallbackKind === 'erp' || fallbackTargets[0]?.key === 'bids' || presetMatches.length > 0;
  if (canTrustFallback) return fallbackDraft;

  try {
    const result = await tryCloudPlanning(
      prompt,
      libraries.map((item) => ({ key: item.key, label: item.label })),
      presets,
    );
    if (!result) return fallbackDraft;
    const parsed = parseCloudPlan(result.content);
    if (looksLikeBrokenPlan(parsed)) return fallbackDraft;

    const cloudPlan = parsed as Record<string, unknown>;
    const targetLibraries = Array.isArray(cloudPlan.targetLibraries)
      ? cloudPlan.targetLibraries
          .map((item, index) => ({
            key: String(item?.key || '').trim(),
            label: String(item?.label || '').trim(),
            mode: (String(item?.mode || '') === 'secondary' || index > 0 ? 'secondary' : 'primary') as 'primary' | 'secondary',
          }))
          .filter((item) => item.key && item.label)
      : fallbackTargets;

    const config = cloudPlan.config && typeof cloudPlan.config === 'object' ? cloudPlan.config : {};
    return {
      name: String(cloudPlan.name || fallbackDraft.name).trim() || fallbackDraft.name,
      kind: (['web_public', 'web_login', 'web_discovery', 'database', 'erp'].includes(String(cloudPlan.kind))
        ? cloudPlan.kind
        : fallbackDraft.kind) as DatasourceKind,
      authMode: (['none', 'credential', 'manual_session', 'database_password', 'api_token'].includes(String(cloudPlan.authMode))
        ? cloudPlan.authMode
        : fallbackDraft.authMode) as DatasourceAuthMode,
      schedule: {
        ...fallbackSchedule,
        kind: ['manual', 'daily', 'weekly'].includes(String(cloudPlan.scheduleKind))
          ? (cloudPlan.scheduleKind as 'manual' | 'daily' | 'weekly')
          : fallbackDraft.schedule.kind,
      },
      targetLibraries: targetLibraries.length ? targetLibraries : fallbackTargets,
      config: {
        ...(fallbackDraft.config || {}),
        ...(config as Record<string, unknown>),
      },
      notes: String((config as Record<string, unknown>).notes || fallbackDraft.notes).trim() || fallbackDraft.notes,
      suggestedPresetIds: presetMatches.map((item) => item.id),
      explanation: '已根据自然语言需求整理出可执行的数据源草案。',
    } satisfies DatasourcePlanDraft;
  } catch {
    return fallbackDraft;
  }
}
