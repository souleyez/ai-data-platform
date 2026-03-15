export const sourceItems = [
  { name: '合同文档库', status: 'success' },
  { name: '技术文档目录', status: 'success' },
  { name: 'ERP 订单库', status: 'warning' },
  { name: 'OA 流程数据库', status: 'success' },
  { name: '商城后台采集', status: 'idle' },
];

export const scenarios = {
  default: {
    reply:
      '我已基于只读数据源完成模拟分析。当前订单规模整体平稳增长，建议重点关注回款周期较长合同，以及成交额波动较大的客户。右侧面板已同步更新为综合概览。',
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
  },
  order: {
    reply:
      '订单趋势模拟分析已完成：本月订单额较上月增长 12.4%，核心增长来自华东和线上商城渠道；下滑客户主要集中在渠道代理类。建议优先复盘退货率偏高 SKU 和回款慢订单。',
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
  },
  contract: {
    reply:
      '合同风险归纳已完成：当前高风险点主要集中在付款节点定义不清、回款周期过长、违约责任条款偏弱。建议优先复核金额较高且付款条件模糊的合同。',
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
  },
  doc: {
    reply:
      '技术文档汇总已完成：当前文档主要集中在设备接入、边缘计算、数据采集和告警联动四个主题。重复内容较多的是部署说明与接口约束，建议后续整理成标准知识卡片。',
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
  },
};

export const workbenchCategories = [
  { key: 'doc', label: '技术文档' },
  { key: 'contract', label: '合同协议' },
  { key: 'daily', label: '工作日报' },
  { key: 'invoice', label: '发票凭据' },
  { key: 'order', label: '订单分析' },
  { key: 'service', label: '客服采集' },
  { key: 'inventory', label: '库存监控' },
];

scenarios.daily = {
  reply:
    '工作日报面板已切换：当前更适合看团队提交节奏、重点问题、跨部门事项和待办闭环情况。',
  source: '来源：OA 日报库 / 项目协同记录 / 周计划摘要',
  stats: [
    { label: '今日日报', value: '26', trend: '已提交 21', tone: 'neutral' },
    { label: '风险事项', value: '5', trend: '需跟进', tone: 'warning' },
    { label: '延期任务', value: '8', trend: '较昨日 +2', tone: 'warning' },
  ],
  chartTitle: '日报提交与风险趋势',
  chartSubtitle: '近 6 个工作日团队提交节奏与问题暴露情况',
  chartBars: [
    { month: '周一', height: '52%' },
    { month: '周二', height: '68%' },
    { month: '周三', height: '74%' },
    { month: '周四', height: '63%' },
    { month: '周五', height: '78%' },
    { month: '今日', height: '58%', active: true },
  ],
  tableTitle: '重点日报事项',
  tableSubtitle: '需要跨团队跟进的待办与异常',
  rows: [
    { code: 'DR-101', customer: '平台研发组', risk: '接口联调排期顺延', level: '跟进中', tone: 'warning' },
    { code: 'DR-102', customer: '交付支持组', risk: '客户现场验收待确认', level: '待处理', tone: 'danger' },
    { code: 'DR-103', customer: '产品运营组', risk: '需求评审材料未补齐', level: '提醒', tone: 'warning' },
  ],
};

scenarios.invoice = {
  reply:
    '发票凭据面板已切换：当前重点看开票进度、异常凭据、待核销金额和高风险票据。',
  source: '来源：财务票据目录 / OCR 票据索引 / 核销记录',
  stats: [
    { label: '本月票据', value: '312', trend: '已识别 287', tone: 'up' },
    { label: '异常票据', value: '9', trend: '需复核', tone: 'warning' },
    { label: '待核销金额', value: '¥ 86.4万', trend: '本周新增', tone: 'neutral' },
  ],
  chartTitle: '票据处理进度',
  chartSubtitle: '近 6 周开票、入账与核销进度模拟图',
  chartBars: [
    { month: 'W1', height: '36%' },
    { month: 'W2', height: '41%' },
    { month: 'W3', height: '54%' },
    { month: 'W4', height: '63%' },
    { month: 'W5', height: '71%' },
    { month: 'W6', height: '66%', active: true },
  ],
  tableTitle: '异常票据清单',
  tableSubtitle: '按金额、抬头、税号和重复风险识别',
  rows: [
    { code: 'INV-021', customer: '某项目服务费', risk: '抬头与合同主体不一致', level: '高', tone: 'danger' },
    { code: 'INV-037', customer: '设备采购票据', risk: '金额与入库单差异', level: '中', tone: 'warning' },
    { code: 'INV-044', customer: '差旅报销凭据', risk: '重复提交风险', level: '中', tone: 'warning' },
  ],
};

scenarios.service = {
  reply:
    '客服采集面板已切换：更适合看高频问题、投诉趋势、情绪波动和待回访事项。',
  source: '来源：客服会话采集 / 工单系统 / 反馈摘要集',
  stats: [
    { label: '今日会话', value: '428', trend: '自动归类', tone: 'neutral' },
    { label: '投诉升级', value: '12', trend: '较昨日 +3', tone: 'warning' },
    { label: '待回访', value: '19', trend: '需闭环', tone: 'warning' },
  ],
  chartTitle: '客服问题趋势',
  chartSubtitle: '近 6 天高频问题与升级工单趋势',
  chartBars: [
    { month: 'D1', height: '44%' },
    { month: 'D2', height: '49%' },
    { month: 'D3', height: '61%' },
    { month: 'D4', height: '57%' },
    { month: 'D5', height: '73%' },
    { month: '今日', height: '69%', active: true },
  ],
  tableTitle: '高频客服主题',
  tableSubtitle: '适合沉淀成 FAQ 或流程优化项',
  rows: [
    { code: 'CS-018', customer: '物流时效咨询', risk: '咨询量最高', level: '高', tone: 'danger' },
    { code: 'CS-024', customer: '退款审核进度', risk: '升级频次高', level: '中', tone: 'warning' },
    { code: 'CS-031', customer: '账号权限异常', risk: '跨系统问题', level: '中', tone: 'warning' },
  ],
};

scenarios.inventory = {
  reply:
    '库存监控面板已切换：当前重点看低库存 SKU、周转变慢物料和异常出入库。',
  source: '来源：库存台账 / 采购入库单 / 销售出库流水',
  stats: [
    { label: '低库存 SKU', value: '17', trend: '需补货', tone: 'warning' },
    { label: '异常出入库', value: '6', trend: '待核查', tone: 'warning' },
    { label: '库存周转天数', value: '34', trend: '较上周 +4', tone: 'neutral' },
  ],
  chartTitle: '库存健康度趋势',
  chartSubtitle: '近 6 周低库存与异常波动情况',
  chartBars: [
    { month: 'W1', height: '51%' },
    { month: 'W2', height: '47%' },
    { month: 'W3', height: '53%' },
    { month: 'W4', height: '61%' },
    { month: 'W5', height: '72%' },
    { month: 'W6', height: '76%', active: true },
  ],
  tableTitle: '重点库存风险',
  tableSubtitle: '按低库存、异常波动和周转滞后识别',
  rows: [
    { code: 'ST-009', customer: '核心配件 A12', risk: '安全库存低于阈值', level: '高', tone: 'danger' },
    { code: 'ST-014', customer: '包装耗材 B07', risk: '出库波动异常', level: '中', tone: 'warning' },
    { code: 'ST-025', customer: '半成品 C31', risk: '周转天数偏高', level: '中', tone: 'warning' },
  ],
};

export const initialMessages = [
  {
    role: 'assistant',
    title: '欢迎使用',
    content:
      '当前系统已接入聊天、文档、数据源与报表的基础框架。你可以直接提问，或先从左侧进入文档中心、数据源管理、报表中心查看当前可用能力。',
    meta: '模式：read-only / 支持来源、引用与编排状态展示',
  },
];

export function resolveScenario(input = '') {
  const text = input.toLowerCase();
  if (text.includes('订单') || text.includes('客户') || text.includes('退款')) return 'order';
  if (text.includes('合同') || text.includes('付款') || text.includes('风险')) return 'contract';
  if (text.includes('文档') || text.includes('论文') || text.includes('技术')) return 'doc';
  return 'default';
}
