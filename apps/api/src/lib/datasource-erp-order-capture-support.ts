import type { DatasourceDefinition, DatasourceRunSummaryItem } from './datasource-definitions.js';
import type { ErpExecutionPlan, ErpTransport } from './datasource-erp-connector.js';
import type {
  ErpOrderCaptureMode,
  ErpOrderCapturePlan,
  ErpOrderCaptureResolution,
} from './datasource-erp-order-capture-types.js';

const ORDER_COLUMNS = [
  'order_no',
  'order_date',
  'customer_name',
  'status',
  'total_amount',
  'updated_at',
];

const DETAIL_FIELDS = [
  'order_no',
  'customer_name',
  'currency',
  'status',
  'total_amount',
  'payment_status',
  'delivery_status',
  'updated_at',
];

const LINE_ITEM_FIELDS = [
  'sku_code',
  'sku_name',
  'quantity',
  'unit_price',
  'line_amount',
  'warehouse',
];

export function sanitizeText(value: unknown, maxLength = 240) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength).trim() : text;
}

export function sanitizeArray(value: unknown, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean);
}

export function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function extractJsonObject(raw: string) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function inferCaptureMode(transport: ErpTransport): ErpOrderCaptureMode {
  if (transport === 'api') return 'list_then_detail';
  if (transport === 'session') return 'portal_export';
  return 'hybrid';
}

function inferRequiredCredentials(definition: DatasourceDefinition, transport: ErpTransport) {
  if (definition.authMode === 'api_token') return ['api_token'];
  if (definition.authMode === 'manual_session') return ['session_cookie'];
  if (definition.authMode === 'credential') {
    return transport === 'session' ? ['username', 'password'] : ['username', 'password'];
  }
  return [];
}

function pickPrimaryModule(plan: ErpExecutionPlan) {
  return plan.modulePlans.find((item) => item.module === 'orders') || plan.modulePlans[0] || null;
}

function buildListPathHints(plan: ErpExecutionPlan) {
  const primary = pickPrimaryModule(plan);
  if (!primary) return ['/api/orders'];
  return unique(
    (primary.resourceHints || [])
      .map((item) => sanitizeText(item, 120))
      .filter(Boolean),
  ).slice(0, 4);
}

function buildDetailPathHints(plan: ErpExecutionPlan, listHints: string[]) {
  const derived = listHints.flatMap((item) => {
    if (plan.preferredTransport === 'api') return [`${item}/{order_id}`, `${item}/detail`, `${item}/items`];
    if (plan.preferredTransport === 'session') return [`${item}/detail`, `${item}/view`, `${item}/items`];
    return [`${item}:detail`, `${item}:items`];
  });

  return unique(derived.map((item) => sanitizeText(item, 120)).filter(Boolean)).slice(0, 4);
}

function buildFilterHints(transport: ErpTransport) {
  if (transport === 'api') {
    return ['updated_at >= watermark', 'status in requested scope', 'page and pageSize', 'sort by updated_at asc'];
  }
  if (transport === 'session') {
    return ['date range', 'order status', 'business unit or org scope', 'export current filtered result'];
  }
  return ['date range', 'updated time', 'status or workflow state'];
}

function buildPaginationHints(transport: ErpTransport) {
  if (transport === 'api') {
    return [
      'Iterate page and pageSize until no new rows remain.',
      'Keep overlap on the last updated_at window.',
    ];
  }
  if (transport === 'session') {
    return [
      'Prefer readonly export when the portal supports it.',
      'Otherwise iterate page index and preserve the active filters.',
    ];
  }
  return ['Use readonly list or export style pagination when available.'];
}

function buildSuccessSignals(plan: ErpExecutionPlan) {
  if (plan.preferredTransport === 'api') return ['auth header accepted', 'readonly order list returns 200'];
  if (plan.preferredTransport === 'session') return ['session cookie issued', 'readonly orders page becomes accessible'];
  return ['readonly entry is reachable', 'order snapshot page can be opened'];
}

function buildWatermarkPolicy(transport: ErpTransport) {
  if (transport === 'session') {
    return 'Use updated time or business date filters with an overlap window and re-open detail pages for changed orders.';
  }
  return 'Use updated_at style watermark with overlap and re-fetch detail payloads for changed orders.';
}

function buildObjective(definition: DatasourceDefinition, plan: ErpExecutionPlan, captureMode: ErpOrderCaptureMode) {
  const libraries = definition.targetLibraries.map((item) => item.key).filter(Boolean).join(', ') || 'erp';
  const modules = plan.modules.join(', ') || 'orders';
  return sanitizeText(
    `Capture readonly ERP order headers, line items, status, payment, and delivery context from ${modules} into ${libraries} using ${captureMode}.`,
    220,
  );
}

export function buildFallbackErpOrderCapturePlan(
  definition: DatasourceDefinition,
  plan: ErpExecutionPlan,
): ErpOrderCapturePlan {
  const transport = plan.preferredTransport;
  const captureMode = inferCaptureMode(transport);
  const listPathHints = buildListPathHints(plan);
  const detailPathHints = buildDetailPathHints(plan, listPathHints);
  const requiredCredentials = inferRequiredCredentials(definition, transport);
  const warnings = unique([
    ...plan.validationWarnings,
    ...(plan.modules.includes('orders') ? [] : ['Orders module is inferred indirectly; verify the order scope before live capture.']),
  ]).slice(0, 4);

  return {
    transport,
    captureMode,
    objective: buildObjective(definition, plan, captureMode),
    readonlyGuards: unique(plan.readonlyGuards.map((item) => sanitizeText(item.rule, 200)).filter(Boolean)).slice(0, 4),
    login: {
      entryPath: sanitizeText(plan.bootstrapRequests[0]?.path || '/', 120),
      successSignals: buildSuccessSignals(plan),
      requiredCredentials,
    },
    listCapture: {
      pathHints: listPathHints,
      filterHints: buildFilterHints(transport),
      columns: ORDER_COLUMNS,
      paginationHints: buildPaginationHints(transport),
    },
    detailCapture: {
      pathHints: detailPathHints,
      fields: DETAIL_FIELDS,
      lineItemFields: LINE_ITEM_FIELDS,
    },
    incrementalSync: {
      cursorCandidates: ['updated_at', 'last_modified_at', 'order_date'],
      dedupeKeys: ['order_no', 'erp_order_id'],
      watermarkPolicy: buildWatermarkPolicy(transport),
    },
    warnings,
  };
}

export function buildErpOrderCaptureSummaryItems(
  executionPlan: ErpExecutionPlan,
  resolution: ErpOrderCaptureResolution,
): DatasourceRunSummaryItem[] {
  const plan = resolution.plan;
  const providerLabel = resolution.provider === 'deterministic'
    ? 'deterministic'
    : `${resolution.provider}${resolution.usedFallback ? ' fallback' : ''}`;
  const credentials = plan.login.requiredCredentials.join(', ') || 'none';
  const signals = plan.login.successSignals.slice(0, 2).join(', ') || 'readonly ready';
  const listHints = plan.listCapture.pathHints.slice(0, 2).join(', ') || '/orders';
  const detailHints = plan.detailCapture.pathHints.slice(0, 2).join(', ') || '/orders/{order_id}';
  const cursors = plan.incrementalSync.cursorCandidates.slice(0, 2).join(', ') || 'updated_at';
  const dedupeKeys = plan.incrementalSync.dedupeKeys.slice(0, 2).join(', ') || 'order_no';
  const fieldHints = plan.detailCapture.fields.slice(0, 4).join(', ') || 'order_no, status';

  return [
    {
      id: `erp:${executionPlan.systemLabel}:capture:objective`,
      label: 'capture:objective',
      summary: `${plan.captureMode} | provider ${providerLabel} | ${plan.objective}`,
    },
    {
      id: `erp:${executionPlan.systemLabel}:capture:login`,
      label: 'capture:login',
      summary: `entry ${plan.login.entryPath || '/'} | credentials ${credentials} | signals ${signals}`,
    },
    {
      id: `erp:${executionPlan.systemLabel}:capture:orders`,
      label: 'capture:orders',
      summary: `list ${listHints} | detail ${detailHints} | fields ${fieldHints} | cursor ${cursors} | dedupe ${dedupeKeys}`,
    },
  ];
}
