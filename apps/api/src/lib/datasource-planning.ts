import { createHash } from 'node:crypto';
import { loadDocumentLibraries } from './document-libraries.js';
import type {
  DatasourceAuthMode,
  DatasourceDefinition,
  DatasourceKind,
  DatasourceTargetLibrary,
} from './datasource-definitions.js';
import { collectLibraryMatches } from './knowledge-plan.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import { listDatasourcePresets, type DatasourcePreset } from './datasource-presets.js';

export type DatasourcePlanDraft = Pick<
  DatasourceDefinition,
  'name' | 'kind' | 'targetLibraries' | 'schedule' | 'authMode' | 'config' | 'notes'
> & {
  suggestedPresetIds: string[];
  explanation: string;
};

function normalizeText(value: string) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function buildDatasourceIdSeed(value: string) {
  return createHash('sha1').update(value).digest('hex').slice(0, 10);
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function looksLikeRecurringDiscoveryPrompt(text: string) {
  const hasRecurringSignal = hasAny(text, [
    /每周/,
    /每天/,
    /每日/,
    /定期/,
    /定时/,
    /持续/,
    /周期/,
    /监控/,
    /跟踪/,
    /同步/,
    /weekly/,
    /daily/,
  ]);
  const hasCollectionSignal = hasAny(text, [
    /抓取/,
    /采集/,
    /拉取/,
    /发现/,
    /扫描/,
    /订阅/,
    /跟进/,
    /monitor/,
    /collect/,
    /crawl/,
  ]);
  const hasDiscoveryScope = hasAny(text, [
    /中国政府采购网/,
    /公共资源交易/,
    /采购网/,
    /招标/,
    /投标/,
    /公告/,
    /公示/,
    /论文/,
    /期刊/,
    /文献/,
    /学术/,
    /arxiv/,
    /pubmed/,
    /doaj/,
    /openalex/,
  ]);
  return hasDiscoveryScope && (hasRecurringSignal || hasCollectionSignal);
}

function detectKind(prompt: string): DatasourceKind {
  const text = normalizeText(prompt);
  if (hasAny(text, [/mysql/, /postgres/, /postgresql/, /sqlserver/, /oracle/, /clickhouse/, /sqlite/, /数据库/])) {
    return 'database';
  }
  if (hasAny(text, [/erp/, /crm/, /sap/, /金蝶/, /用友/, /订单后台/, /客诉后台/, /工单后台/])) {
    return 'erp';
  }
  if (hasAny(text, [/登录/, /账号/, /密码/, /cookie/, /会话/, /后台网站/, /需要登录/])) {
    return 'web_login';
  }
  if (
    hasAny(text, [/持续采集/, /定期采集/, /发现链接/, /公开网站/, /公告网站/, /站点列表/, /招标网站/, /论文网站/]) ||
    looksLikeRecurringDiscoveryPrompt(text)
  ) {
    return 'web_discovery';
  }
  return 'web_public';
}

function detectAuthMode(prompt: string, kind: DatasourceKind): DatasourceAuthMode {
  const text = normalizeText(prompt);
  if (kind === 'database') return 'database_password';
  if (kind === 'erp') return 'credential';
  if (hasAny(text, [/token/, /apikey/, /api密钥/])) return 'api_token';
  if (hasAny(text, [/登录/, /账号/, /密码/, /cookie/, /会话/])) return 'credential';
  return 'none';
}

function detectSchedule(prompt: string) {
  const text = normalizeText(prompt);
  if (hasAny(text, [/每周/, /weekly/, /一周一次/])) {
    return { kind: 'weekly' as const, timezone: 'Asia/Shanghai', maxItemsPerRun: 20 };
  }
  if (hasAny(text, [/每天/, /每日/, /daily/, /定时/, /定期/])) {
    return { kind: 'daily' as const, timezone: 'Asia/Shanghai', maxItemsPerRun: 20 };
  }
  return { kind: 'manual' as const, timezone: 'Asia/Shanghai', maxItemsPerRun: 10 };
}

function matchPresets(prompt: string, presets: DatasourcePreset[]) {
  const text = normalizeText(prompt);
  return presets
    .map((preset) => {
      let score = 0;
      const fields = [preset.name, preset.authority, preset.description, preset.focus, preset.baseUrl];
      for (const field of fields) {
        const term = normalizeText(field);
        if (term && text.includes(term)) score += 10;
      }
      if (preset.category === 'bids' && hasAny(text, [/招标/, /投标/, /标书/, /采购/, /中标/])) score += 12;
      if (preset.category === 'academic' && hasAny(text, [/论文/, /研究/, /学术/, /文献/, /期刊/, /公开资料/])) score += 12;
      return { preset, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.preset);
}

function inferDatabaseObjects(prompt: string) {
  const text = normalizeText(prompt);
  const tables = new Set<string>();
  const views = new Set<string>();
  if (hasAny(text, [/订单/, /order/])) tables.add('orders');
  if (hasAny(text, [/客诉/, /投诉/, /complaint/])) tables.add('complaints');
  if (hasAny(text, [/库存/, /inventory/])) tables.add('inventory');
  if (hasAny(text, [/回款/, /payment/, /收款/])) tables.add('payments');
  if (hasAny(text, [/发票/, /invoice/])) tables.add('invoices');
  if (hasAny(text, [/客户/, /customer/])) tables.add('customers');
  if (hasAny(text, [/商品/, /sku/, /product/])) tables.add('products');
  if (hasAny(text, [/视图/, /view/])) views.add('business_view');
  return { tables: Array.from(tables), views: Array.from(views) };
}

function inferErpModules(prompt: string) {
  const text = normalizeText(prompt);
  const modules = new Set<string>();
  if (hasAny(text, [/订单/, /order/])) modules.add('orders');
  if (hasAny(text, [/客诉/, /售后/, /complaint/])) modules.add('complaints');
  if (hasAny(text, [/库存/, /inventory/, /备货/])) modules.add('inventory');
  if (hasAny(text, [/物流/, /delivery/, /发货/])) modules.add('deliveries');
  if (hasAny(text, [/客户/, /customer/])) modules.add('customers');
  if (hasAny(text, [/产品/, /商品/, /sku/])) modules.add('products');
  if (hasAny(text, [/回款/, /payment/, /收款/])) modules.add('payments');
  return Array.from(modules);
}

function buildFallbackTargetLibraries(
  prompt: string,
  presetMatches: DatasourcePreset[],
  libraryMatches: Array<{ library: { key: string; label: string }; score: number }>,
): DatasourceTargetLibrary[] {
  if (libraryMatches.length) {
    return libraryMatches.slice(0, 3).map((item, index) => ({
      key: item.library.key,
      label: item.library.label,
      mode: index === 0 ? 'primary' : 'secondary',
    }));
  }
  const presetLibraries = presetMatches.flatMap((preset) => preset.suggestedLibraries || []);
  if (presetLibraries.length) {
    return presetLibraries.map((item, index) => ({
      key: item.key,
      label: item.label,
      mode: index === 0 ? 'primary' : 'secondary',
    }));
  }
  if (hasAny(prompt, [/招标/, /投标/, /标书/, /采购/])) {
    return [{ key: 'bids', label: 'bids', mode: 'primary' }];
  }
  return [{ key: 'ungrouped', label: '未分组', mode: 'primary' }];
}

function buildFallbackName(prompt: string, kind: DatasourceKind, presetMatches: DatasourcePreset[]) {
  if (presetMatches[0]) return presetMatches[0].name;
  const trimmed = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (trimmed) return trimmed.slice(0, 32);
  if (kind === 'database') return '数据库数据源';
  if (kind === 'erp') return 'ERP数据源';
  return '网页数据源';
}

function buildPlanningPrompt(prompt: string, libraries: Array<{ key: string; label: string }>, presets: DatasourcePreset[]) {
  const libraryText = libraries.map((item) => `${item.label}(${item.key})`).join('、') || '暂无';
  const presetText = presets.map((item) => `${item.name} -> ${item.kind}`).join('\n') || '暂无预置';
  return [
    '请把下面的自然语言采集需求整理成结构化数据源配置草案。',
    '只返回 JSON，不要解释，不要 Markdown。',
    'JSON schema:',
    '{"name":"...","kind":"web_public|web_login|web_discovery|database|erp","authMode":"none|credential|manual_session|database_password|api_token","scheduleKind":"manual|daily|weekly","targetLibraries":[{"key":"...","label":"...","mode":"primary|secondary"}],"config":{"url":"","focus":"","notes":"","keywords":[],"siteHints":[],"tables":[],"views":[],"modules":[]}}',
    `可选知识库：${libraryText}`,
    `可选预置站点：\n${presetText}`,
    `需求：${prompt}`,
  ].join('\n\n');
}

function parseCloudPlan(raw: string) {
  try {
    const trimmed = String(raw || '').trim();
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : trimmed;
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace ? candidate.slice(firstBrace, lastBrace + 1) : candidate;
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function looksLikeBrokenPlan(parsed: Record<string, unknown> | null) {
  if (!parsed) return true;
  return !String(parsed.name || '').trim();
}

async function tryCloudPlanning(prompt: string, libraries: Array<{ key: string; label: string }>, presets: DatasourcePreset[]) {
  const planning = runOpenClawChat({
    prompt: buildPlanningPrompt(prompt, libraries, presets),
    systemPrompt: [
      '你是数据源配置助手。',
      '你的任务是把自然语言采集需求转换成结构化数据源配置草案。',
      '不要输出解释，只返回严格 JSON。',
      '如果用户要持续采集公开站点列表页和详情页，优先使用 web_discovery。',
      '如果提到数据库、SQL、表、视图，使用 database。',
      '如果提到 ERP、订单后台、客诉后台、CRM，使用 erp。',
    ].join('\n'),
  });
  return Promise.race([planning, new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000))]);
}

export async function planDatasourceFromPrompt(prompt: string) {
  const [libraries, presets] = await Promise.all([loadDocumentLibraries(), Promise.resolve(listDatasourcePresets())]);
  const libraryMatches = collectLibraryMatches(prompt, libraries);
  const presetMatches = matchPresets(prompt, presets);
  const fallbackKind = detectKind(prompt);
  const fallbackAuth = detectAuthMode(prompt, fallbackKind);
  const fallbackSchedule = detectSchedule(prompt);
  const fallbackTargets = buildFallbackTargetLibraries(prompt, presetMatches, libraryMatches);
  const databaseObjects = inferDatabaseObjects(prompt);
  const erpModules = inferErpModules(prompt);

  const fallbackDraft: DatasourcePlanDraft = {
    name: buildFallbackName(prompt, fallbackKind, presetMatches),
    kind: fallbackKind,
    targetLibraries: fallbackTargets,
    schedule: fallbackSchedule,
    authMode: fallbackAuth,
    config: {
      url: presetMatches[0]?.baseUrl || '',
      focus: prompt,
      notes: prompt,
      keywords: [],
      siteHints: presetMatches.map((item) => item.name),
      tables: fallbackKind === 'database' ? databaseObjects.tables : [],
      views: fallbackKind === 'database' ? databaseObjects.views : [],
      modules: fallbackKind === 'erp' ? erpModules : [],
      idSeed: buildDatasourceIdSeed(prompt),
    },
    notes: prompt,
    suggestedPresetIds: presetMatches.map((item) => item.id),
    explanation: '已根据当前需求生成一份数据源草案，你可以继续修改后保存。',
  };

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
