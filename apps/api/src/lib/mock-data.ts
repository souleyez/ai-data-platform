export const sourceItems = [
  { id: 'docs-contracts', name: '合同文档库', type: 'documents', status: 'connected', mode: 'read-only' },
  { id: 'docs-tech', name: '技术文档目录', type: 'documents', status: 'connected', mode: 'read-only' },
  { id: 'db-erp', name: 'ERP 订单库', type: 'database', status: 'warning', mode: 'read-only' },
  { id: 'db-oa', name: 'OA 流程数据库', type: 'database', status: 'connected', mode: 'read-only' },
  { id: 'web-shop', name: '商城后台采集', type: 'web', status: 'idle', mode: 'read-only' },
];

export const scenarios = {
  default: {
    reply: '我已基于只读数据源完成模拟分析。当前订单规模整体平稳增长，建议重点关注回款周期较长合同，以及成交额波动较大的客户。',
    source: '来源：ERP 订单库 / 合同文档库 / 技术文档目录',
    stats: [
      { label: '本月订单额', value: '¥ 1,286,300', trend: '+12.4%', tone: 'up' },
      { label: '合同风险数', value: '3', trend: '待关注', tone: 'warning' },
      { label: '文档总量', value: '2,481', trend: '已索引', tone: 'neutral' },
    ],
    chartTitle: '综合经营趋势',
    chartSubtitle: '近 6 个月核心经营指标模拟图',
    chartBars: [
      { month: '10月', height: '32%' },
      { month: '11月', height: '48%' },
      { month: '12月', height: '40%' },
      { month: '1月', height: '61%' },
      { month: '2月', height: '72%' },
      { month: '3月', height: '84%', active: true },
    ],
    tableTitle: '高风险合同',
    tableSubtitle: '按付款条款、期限、违约责任综合识别',
    rows: [
      { code: 'HT-2026-018', customer: '华东某项目', risk: '付款节点不明确', level: '高', tone: 'danger' },
      { code: 'HT-2026-024', customer: '某设备采购', risk: '违约责任偏弱', level: '中', tone: 'warning' },
      { code: 'HT-2026-031', customer: '系统集成服务', risk: '付款周期过长', level: '中', tone: 'warning' },
    ],
    sources: [{ type: 'database', name: 'ERP 订单库', table: 'orders_view' }],
  },
  order: {
    reply: '订单趋势模拟分析已完成：本月订单额较上月增长 12.4%，核心增长来自华东和线上商城渠道；下滑客户主要集中在渠道代理类。',
    source: '来源：ERP 订单明细表 / 商城订单统计表 / 客户回款视图',
    stats: [
      { label: '本月订单额', value: '¥ 1,286,300', trend: '+12.4%', tone: 'up' },
      { label: '退款率', value: '2.1%', trend: '-1.8%', tone: 'up' },
      { label: '下滑客户数', value: '6', trend: '需跟进', tone: 'warning' },
    ],
    chartTitle: '订单趋势',
    chartSubtitle: '近 6 个月订单金额模拟图',
    chartBars: [
      { month: '10月', height: '30%' },
      { month: '11月', height: '42%' },
      { month: '12月', height: '39%' },
      { month: '1月', height: '58%' },
      { month: '2月', height: '70%' },
      { month: '3月', height: '86%', active: true },
    ],
    tableTitle: '重点下滑客户',
    tableSubtitle: '按订单额环比下滑排序',
    rows: [
      { code: 'KH-019', customer: '某区域代理', risk: '环比下降 31%', level: '高', tone: 'danger' },
      { code: 'KH-027', customer: '华南工程客户', risk: '环比下降 18%', level: '中', tone: 'warning' },
      { code: 'KH-041', customer: '渠道零售客户', risk: '环比下降 15%', level: '中', tone: 'warning' },
    ],
    sources: [{ type: 'database', name: 'ERP 订单库', table: 'orders_view' }],
  },
  contract: {
    reply: '合同风险归纳已完成：当前高风险点主要集中在付款节点定义不清、回款周期过长、违约责任条款偏弱。',
    source: '来源：合同文档库 / 合同结构化字段索引',
    stats: [
      { label: '合同总数', value: '168', trend: '本月新增 16', tone: 'neutral' },
      { label: '高风险合同', value: '3', trend: '需优先复核', tone: 'warning' },
      { label: '中风险合同', value: '11', trend: '建议排查', tone: 'warning' },
    ],
    chartTitle: '合同风险分布',
    chartSubtitle: '近 6 个月合同风险数量模拟图',
    chartBars: [
      { month: '10月', height: '22%' },
      { month: '11月', height: '28%' },
      { month: '12月', height: '34%' },
      { month: '1月', height: '30%' },
      { month: '2月', height: '41%' },
      { month: '3月', height: '55%', active: true },
    ],
    tableTitle: '高风险合同',
    tableSubtitle: '按付款条款、期限、违约责任综合识别',
    rows: [
      { code: 'HT-2026-018', customer: '华东某项目', risk: '付款节点不明确', level: '高', tone: 'danger' },
      { code: 'HT-2026-024', customer: '某设备采购', risk: '违约责任偏弱', level: '中', tone: 'warning' },
      { code: 'HT-2026-031', customer: '系统集成服务', risk: '付款周期过长', level: '中', tone: 'warning' },
    ],
    sources: [{ type: 'documents', name: '合同文档库', table: 'contracts_index' }],
  },
  doc: {
    reply: '技术文档汇总已完成：当前文档主要集中在设备接入、边缘计算、数据采集和告警联动四个主题。',
    source: '来源：技术文档目录 / PDF 文本索引 / 摘要结果集',
    stats: [
      { label: '文档总量', value: '2,481', trend: '已索引', tone: 'neutral' },
      { label: '主题分类', value: '24', trend: '自动归类', tone: 'up' },
      { label: '重复率较高', value: '13%', trend: '建议整理', tone: 'warning' },
    ],
    chartTitle: '技术文档主题分布',
    chartSubtitle: '主要知识主题覆盖度模拟图',
    chartBars: [
      { month: '接入', height: '80%' },
      { month: '边缘', height: '64%' },
      { month: '采集', height: '76%' },
      { month: '告警', height: '58%' },
      { month: '部署', height: '69%' },
      { month: '接口', height: '72%', active: true },
    ],
    tableTitle: '重点知识主题',
    tableSubtitle: '适合后续整理为知识卡片',
    rows: [
      { code: 'DOC-01', customer: '设备接入协议', risk: '出现频次最高', level: '高', tone: 'danger' },
      { code: 'DOC-02', customer: '部署规范', risk: '重复内容较多', level: '中', tone: 'warning' },
      { code: 'DOC-03', customer: '告警联动', risk: '跨文档依赖强', level: '中', tone: 'warning' },
    ],
    sources: [{ type: 'documents', name: '技术文档目录', table: 'docs_index' }],
  },
} as const;

export type ScenarioKey = keyof typeof scenarios;

export function resolveScenario(input = ''): ScenarioKey {
  const text = input.toLowerCase();
  if (text.includes('订单') || text.includes('客户') || text.includes('退款')) return 'order';
  if (text.includes('合同') || text.includes('付款') || text.includes('风险')) return 'contract';
  if (text.includes('文档') || text.includes('论文') || text.includes('技术')) return 'doc';
  return 'default';
}
