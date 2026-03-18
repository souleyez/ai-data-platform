export const NAV_ITEMS = ['智能问答', '文档中心', '数据源管理', '报表中心', '审计日志'];

export const QUICK_ACTIONS = [
  { label: '订单趋势分析', prompt: '请做订单趋势分析' },
  { label: '合同风险归纳', prompt: '请归纳合同风险' },
  { label: '技术文档汇总', prompt: '请汇总技术文档主题' },
  { label: '生成周报', prompt: '请生成本周经营周报' },
];

export function formatDocumentBusinessResult(item) {
  if (!item) return '-';
  if (item.category === 'contract') return `风险等级：${item.riskLevel || 'unknown'}`;
  if (item.category === 'technical' || item.category === 'paper') return `主题：${(item.topicTags || []).join('、') || '未识别'}`;
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
  const modeLabel = orchestration.mode === 'openclaw' ? '增强分析' : '标准分析';
  return `${modeLabel} · 命中资料 ${matches} 项`;
}

export function normalizeChatResponse(data, fallbackPanel) {
  const scenario = data?.scenario || 'default';
  const message = {
    role: data?.message?.role || 'assistant',
    content: data?.message?.content || '暂无返回内容',
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
  return {
    mode: data?.mode || 'read-only',
    total: data?.total || 0,
    items: Array.isArray(data?.items)
      ? data.items.map((item) => ({
          name: item.name || item.id || 'unknown',
          status: item.status === 'connected' ? 'success' : item.status || 'idle',
          type: item.type || 'unknown',
          mode: item.mode || 'read-only',
          capability: item.type === 'documents'
            ? '浏览 / 解析 / 问答引用'
            : item.type === 'database'
              ? '只读查询 / 报表支撑'
              : item.type === 'web'
                ? '采集占位 / 待接实'
                : '待定义',
          group: item.type === 'documents'
            ? '文档型'
            : item.type === 'database'
              ? '数据库型'
              : item.type === 'web'
                ? 'Web采集型'
                : '其他',
        }))
      : [],
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
    meta: data?.meta || null,
    customCategories: Array.isArray(data?.config?.customCategories) ? data.config.customCategories : [],
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
    items: Array.isArray(data?.items) ? data.items : [],
    meta: data?.meta || null,
  };
}
