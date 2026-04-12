export const NAV_ITEMS = ['智能会话', '数据集', '采集源', '报表', '审计'];

export const QUICK_ACTIONS = [
  { label: '订单趋势分析', prompt: '请做订单趋势分析' },
  { label: '合同风险归纳', prompt: '请归纳合同风险' },
  { label: '技术文档摘要', prompt: '请总结技术文档重点' },
  { label: '生成周报', prompt: '请生成本周经营周报' },
  { label: '奶粉配方建议', prompt: '请提供一份奶粉配方建议' },
];

export function formatDocumentBusinessResult(item) {
  if (!item) return '-';
  if (item.category === 'contract') return `风险等级: ${item.riskLevel || 'unknown'}`;
  if (item.category === 'technical' || item.category === 'paper') {
    return `主题: ${((item.topicTags || []).join('、')) || '未识别'}`;
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
  const modeLabel = orchestration.mode === 'openclaw' ? '云端模型' : '云端未响应';
  return `${modeLabel} · 命中文档 ${matches} 项`;
}

export function normalizeChatResponse(data, fallbackPanel) {
  const output = data?.output || data?.message?.output || null;
  const message = {
    role: data?.message?.role || 'assistant',
    content: data?.message?.content || '暂无返回内容',
    table: data?.message?.table || null,
    meta: data?.message?.meta || '',
    references: Array.isArray(data?.message?.references) ? data.message.references : [],
    orchestration: data?.orchestration || data?.message?.orchestration || null,
    confirmation: data?.message?.confirmation || data?.guard?.confirmation || null,
    output,
  };

  return {
    message,
    sources: Array.isArray(data?.sources) ? data.sources : [],
    orchestration: message.orchestration,
    mode: data?.mode || data?.orchestration?.mode || 'fallback',
    intent: data?.intent || 'general',
    needsKnowledge: Boolean(data?.needsKnowledge),
    libraries: Array.isArray(data?.libraries) ? data.libraries : [],
    reportTemplate: data?.reportTemplate || null,
    output,
    guard: data?.guard || null,
    conversationState: data?.conversationState || null,
    savedReport: data?.savedReport || null,
  };
}

export function normalizeDatasourceResponse(data) {
  const normalizeItem = (item = {}) => ({
    id: item.id || item.name || 'unknown',
    name: item.name || item.id || 'unknown',
    status: item.status === 'connected' ? 'success' : (item.status || 'idle'),
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
            ? '网页采集 / 内容更新'
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
  const normalizeDocumentItem = (item = {}) => ({
    ...item,
    id: item.id || item.path || `document-${Math.random().toString(36).slice(2)}`,
    path: item.path || '',
    name: item.name || item.title || 'untitled',
    ext: item.ext || '',
    title: item.title || item.name || '',
    summary: typeof item.summary === 'string' ? item.summary : '',
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
    topicTags: Array.isArray(item.topicTags) ? item.topicTags.filter((entry) => typeof entry === 'string') : [],
    groups: Array.isArray(item.groups) ? item.groups.filter((entry) => typeof entry === 'string') : [],
    confirmedGroups: Array.isArray(item.confirmedGroups) ? item.confirmedGroups.filter((entry) => typeof entry === 'string') : [],
    suggestedGroups: Array.isArray(item.suggestedGroups) ? item.suggestedGroups.filter((entry) => typeof entry === 'string') : [],
    ignored: Boolean(item.ignored),
  });

  return {
    mode: data?.mode || 'read-only',
    scanRoot: data?.scanRoot || '-',
    scanRoots: Array.isArray(data?.scanRoots)
      ? data.scanRoots
      : Array.isArray(data?.config?.scanRoots)
        ? data.config.scanRoots
        : (data?.scanRoot ? [data.scanRoot] : []),
    exists: Boolean(data?.exists),
    totalFiles: data?.totalFiles || 0,
    byExtension: data?.byExtension || {},
    byCategory: data?.byCategory || {},
    byStatus: data?.byStatus || {},
    items: Array.isArray(data?.items) ? data.items.map(normalizeDocumentItem) : [],
    capabilities: Array.isArray(data?.capabilities) ? data.capabilities : [],
    cacheHit: Boolean(data?.cacheHit),
    lastScanAt: data?.lastScanAt || new Date().toISOString(),
    config: data?.config || null,
    libraries: Array.isArray(data?.libraries) ? data.libraries : [],
    meta: data?.meta || null,
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
    templates: Array.isArray(data?.templates) ? data.templates : [],
    fixedTemplates: Array.isArray(data?.fixedTemplates) ? data.fixedTemplates : [],
    staticPageTemplates: Array.isArray(data?.staticPageTemplates) ? data.staticPageTemplates : [],
    activePages: Array.isArray(data?.activePages) ? data.activePages : [],
    outputRecords: Array.isArray(data?.outputRecords) ? data.outputRecords : [],
    meta: data?.meta || null,
  };
}
