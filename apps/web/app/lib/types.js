export const NAV_ITEMS = ['智能问答', '文档中心', '数据源管理', '报表中心', '审计日志'];

export const QUICK_ACTIONS = [
  { label: '订单趋势分析', prompt: '请做订单趋势分析' },
  { label: '合同风险归纳', prompt: '请归纳合同风险' },
  { label: '技术文档摘要', prompt: '请总结技术文档重点' },
  { label: '生成周报', prompt: '请生成本周经营周报' },
  { label: '健脑抗抑郁配方建议', prompt: '按中老年健脑抗抑郁提供一个奶粉配方建议' },
];

export function formatDocumentBusinessResult(item) {
  if (!item) return '-';
  if (item.category === 'contract') return `风险等级：${item.riskLevel || 'unknown'}`;
  if (item.category === 'technical' || item.category === 'paper') {
    return `主题：${(item.topicTags || []).join('、') || '未识别'}`;
  }
  return item.ext || '-';
}

export function formatSourceLabel(source) {
  if (!source) return '-';
  const type = source.type || 'source';
  const name = source.name || source.table || 'unknown';
  return `${type}: ${name}`;
}

export function formatOrchestrationLabel(orchestration) {
  if (!orchestration) return '分析信息缺失';
  const matches = orchestration.docMatches ?? 0;
  const modeLabel = orchestration.mode === 'openclaw' ? '云端模型' : '本地AI';
  return `${modeLabel} · 命中资料 ${matches} 项`;
}

export function normalizeChatResponse(data, fallbackPanel) {
  const scenario = data?.scenario || 'default';
  const message = {
    role: data?.message?.role || 'assistant',
    content: data?.message?.content || '暂无返回内容',
    table: data?.message?.table || null,
    meta: data?.message?.meta || '',
    references: Array.isArray(data?.message?.references) ? data.message.references : [],
    sources: Array.isArray(data?.sources) ? data.sources : [],
    orchestration: data?.orchestration || null,
  };

  return {
    scenario,
    panel: data?.panel || fallbackPanel,
    message,
    sources: message.sources,
    orchestration: message.orchestration,
  };
}

export function normalizeDatasourceResponse(data) {
  const normalizeItem = (item) => ({
    id: item.id || item.name || 'unknown',
    name: item.name || item.id || 'unknown',
    status: item.status === 'connected' ? 'success' : item.status || 'idle',
    rawStatus: item.status || 'idle',
    type: item.type || 'unknown',
    mode: item.mode || 'read-only',
    updateMode: item.updateMode || '手动更新',
    capability:
      item.capability ||
      (item.type === 'documents'
        ? '浏览 / 解析 / 问答引用'
        : item.type === 'database'
          ? '只读查询 / 报表支持'
          : item.type === 'web'
            ? '网页内容抓取 / 更新'
            : '待定义'),
    group:
      item.group ||
      (item.type === 'documents'
        ? '文档型'
        : item.type === 'database'
          ? '数据库型'
          : item.type === 'web'
            ? 'Web采集型'
            : '其他'),
    actions: Array.isArray(item.actions) ? item.actions : ['hide', 'delete'],
    hidden: Boolean(item.hidden),
  });

  return {
    mode: data?.mode || 'read-only',
    total: data?.total || 0,
    items: Array.isArray(data?.items) ? data.items.map(normalizeItem) : [],
    activeItems: Array.isArray(data?.activeItems) ? data.activeItems.map(normalizeItem) : [],
    captureTasks: Array.isArray(data?.captureTasks) ? data.captureTasks : [],
    meta: data?.meta || null,
  };
}

export function normalizeDocumentsResponse(data) {
  return {
    mode: data?.mode || 'read-only',
    scanRoot: data?.scanRoot || '-',
    exists: Boolean(data?.exists),
    totalFiles: data?.totalFiles || 0,
    byExtension: data?.byExtension || {},
    byCategory: data?.byCategory || {},
    byBizCategory: data?.byBizCategory || {},
    byStatus: data?.byStatus || {},
    items: Array.isArray(data?.items) ? data.items : [],
    capabilities: Array.isArray(data?.capabilities) ? data.capabilities : [],
    cacheHit: Boolean(data?.cacheHit),
    lastScanAt: data?.lastScanAt || new Date().toISOString(),
    config: data?.config || null,
    libraries: Array.isArray(data?.libraries) ? data.libraries : [],
    meta: data?.meta || null,
    customCategories: Array.isArray(data?.config?.customCategories) ? data.config.customCategories : [],
  };
}

export function normalizeDocumentLibrariesResponse(data) {
  return {
    mode: data?.mode || 'read-only',
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

export function normalizeDocumentDetailResponse(data) {
  return {
    mode: data?.mode || 'read-only',
    item: data?.item || null,
    meta: data?.meta || null,
  };
}

export function normalizeReportsResponse(data) {
  return {
    mode: data?.mode || 'read-only',
    total: data?.total || 0,
    groups: Array.isArray(data?.groups) ? data.groups : [],
    fixedTemplates: Array.isArray(data?.fixedTemplates) ? data.fixedTemplates : [],
    staticPageTemplates: Array.isArray(data?.staticPageTemplates) ? data.staticPageTemplates : [],
    activePages: Array.isArray(data?.activePages) ? data.activePages : [],
    outputRecords: Array.isArray(data?.outputRecords) ? data.outputRecords : [],
    meta: data?.meta || null,
  };
}
