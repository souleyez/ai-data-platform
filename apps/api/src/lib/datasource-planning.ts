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

function detectKind(prompt: string): DatasourceKind {
  const text = normalizeText(prompt);
  if (/(数据库|mysql|postgres|postgresql|sqlserver|oracle|clickhouse|sqlite)/.test(text)) return 'database';
  if (/(erp|订单后台|客诉后台|crm|sap|金蝶|用友|服务工单)/.test(text)) return 'erp';
  if (/(登录|账号|密码|cookie|会话|后台网站|需要登录)/.test(text)) return 'web_login';
  if (/(持续采集|定期采集|发现链接|公开网站|公告网站|站点列表|招标网站|论文网站)/.test(text)) return 'web_discovery';
  return 'web_public';
}

function detectAuthMode(prompt: string, kind: DatasourceKind): DatasourceAuthMode {
  const text = normalizeText(prompt);
  if (kind === 'database') return 'database_password';
  if (kind === 'erp') return 'credential';
  if (/(token|apikey|api密钥)/.test(text)) return 'api_token';
  if (/(登录|账号|密码|cookie|会话)/.test(text)) return 'credential';
  return 'none';
}

function detectSchedule(prompt: string) {
  const text = normalizeText(prompt);
  if (/(每周|weekly|一周一次)/.test(text)) return { kind: 'weekly' as const, timezone: 'Asia/Shanghai', maxItemsPerRun: 20 };
  if (/(每天|每日|daily|定时|定期)/.test(text)) return { kind: 'daily' as const, timezone: 'Asia/Shanghai', maxItemsPerRun: 20 };
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
      if (preset.category === 'bids' && /(招标|投标|标书|采购|中标)/.test(text)) score += 12;
      if (preset.category === 'academic' && /(论文|研究|学术|文献|期刊|公开资料)/.test(text)) score += 12;
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
  if (/(订单|order)/.test(text)) tables.add('orders');
  if (/(客诉|投诉|complaint)/.test(text)) tables.add('complaints');
  if (/(库存|inventory)/.test(text)) tables.add('inventory');
  if (/(回款|payment|收款)/.test(text)) tables.add('payments');
  if (/(发票|invoice)/.test(text)) tables.add('invoices');
  if (/(客户|customer)/.test(text)) tables.add('customers');
  if (/(商品|sku|product)/.test(text)) tables.add('products');
  if (/(视图|view)/.test(text)) views.add('business_view');
  return {
    tables: Array.from(tables),
    views: Array.from(views),
  };
}

function inferErpModules(prompt: string) {
  const text = normalizeText(prompt);
  const modules = new Set<string>();
  if (/(订单|order)/.test(text)) modules.add('orders');
  if (/(客诉|售后|complaint)/.test(text)) modules.add('complaints');
  if (/(库存|inventory|备货)/.test(text)) modules.add('inventory');
  if (/(物流|delivery|发货)/.test(text)) modules.add('deliveries');
  if (/(客户|customer)/.test(text)) modules.add('customers');
  if (/(产品|商品|sku)/.test(text)) modules.add('products');
  if (/(回款|payment|收款)/.test(text)) modules.add('payments');
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

  if (/(招标|投标|标书|采购)/.test(prompt)) {
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
  const name = String(parsed.name || '').trim();
  return !name;
}

export async function planDatasourceFromPrompt(prompt: string) {
  const [libraries, presets] = await Promise.all([
    loadDocumentLibraries(),
    Promise.resolve(listDatasourcePresets()),
  ]);

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
    explanation: '已按当前需求生成数据源草案，可继续编辑后保存。',
  };

  try {
    const result = await runOpenClawChat({
      prompt: buildPlanningPrompt(
        prompt,
        libraries.map((item) => ({ key: item.key, label: item.label })),
        presets,
      ),
      systemPrompt: [
        '你是数据源配置助手。',
        '你的任务是把自然语言采集需求转换成结构化数据源配置草案。',
        '不要输出解释，只返回严格 JSON。',
        '如果用户要持续采集公开站点列表页和详情页，优先使用 web_discovery。',
        '如果提到数据库、SQL、表、视图，使用 database。',
        '如果提到 ERP、订单后台、客诉后台、CRM，使用 erp。',
      ].join('\n'),
    });
    const parsed = parseCloudPlan(result.content);
    if (looksLikeBrokenPlan(parsed)) return fallbackDraft;

    const cloudPlan = parsed as Record<string, unknown>;
    const targetLibraries = Array.isArray(cloudPlan.targetLibraries)
      ? cloudPlan.targetLibraries
          .map((item, index) => ({
            key: String((item as { key?: string })?.key || '').trim(),
            label: String((item as { label?: string })?.label || '').trim(),
            mode: ((item as { mode?: string })?.mode === 'secondary' || index > 0 ? 'secondary' : 'primary') as 'primary' | 'secondary',
          }))
          .filter((item) => item.key && item.label)
      : fallbackTargets;

    const config = (cloudPlan.config && typeof cloudPlan.config === 'object') ? cloudPlan.config as Record<string, unknown> : {};
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
        ...config,
      },
      notes: String(config.notes || fallbackDraft.notes).trim() || fallbackDraft.notes,
      suggestedPresetIds: presetMatches.map((item) => item.id),
      explanation: '已根据自然语言需求整理出可执行的数据源草案。',
    } satisfies DatasourcePlanDraft;
  } catch {
    return fallbackDraft;
  }
}
