import { type KeywordRule, matchesKeyword } from './document-parser-classification-support.js';

export function detectTopicTags(
  text: string,
  category: string,
  bizCategory: 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory' | 'footfall' | 'general',
) {
  if (category === 'resume') {
    const normalized = text.toLowerCase();
    const tags = ['人才简历'];
    if (/(java|spring|backend|后端)/i.test(normalized)) tags.push('Java后端');
    if (/(产品经理|product manager|axure|xmind)/i.test(normalized)) tags.push('产品经理');
    if (/(算法|machine learning|deep learning)/i.test(normalized)) tags.push('算法工程师');
    if (/(前端|frontend|react|vue)/i.test(normalized)) tags.push('前端开发');
    if (/(技术总监|技术负责人|cto)/i.test(normalized)) tags.push('技术管理');
    return tags;
  }

  if (bizCategory === 'order' || bizCategory === 'inventory') {
    const normalized = text.toLowerCase();
    const tags = [bizCategory === 'inventory' ? '库存监控' : '订单分析'];
    if (/(tmall|jd|douyin|pinduoduo|kuaishou|wechatmall|天猫|京东|抖音|拼多多|快手|小程序)/i.test(normalized)) tags.push('渠道经营');
    if (/(sku|category|品类|类目|耳机|智能穿戴|智能家居|平板周边|手机配件|电脑外设)/i.test(normalized)) tags.push('SKU结构');
    if (/(inventory|stock|inventory_index|days_of_cover|safety_stock|库存|周转|安全库存)/i.test(normalized)) tags.push('库存管理');
    if (/(replenishment|restock|备货|补货|调拨|priority|优先级)/i.test(normalized)) tags.push('备货建议');
    if (/(yoy|mom|forecast|gmv|net_sales|gross_margin|同比|环比|预测|净销售额|毛利)/i.test(normalized)) tags.push('经营复盘');
    if (/(risk_flag|anomaly|warning|异常|风险|波动|overstock|stockout)/i.test(normalized)) tags.push('异常波动');
    return [...new Set(tags)];
  }

  if (bizCategory === 'footfall') {
    const normalized = text.toLowerCase();
    const tags = ['客流分析'];
    if (/(mall_zone|mall area|mall partition|shopping_zone|商场分区|商场区域|商业分区)/i.test(normalized)) tags.push('商场分区');
    if (/(floor_zone|floor area|floor partition|楼层分区|楼层区域|楼层)/i.test(normalized)) tags.push('楼层明细');
    if (/(room_unit|shop_unit|shop_no|单间|店铺|铺位|商户)/i.test(normalized)) tags.push('单间明细');
    if (/(visitor_count|visitors|footfall|traffic_count|entry_count|客流|人流|到访量)/i.test(normalized)) tags.push('客流报表');
    return [...new Set(tags)];
  }

  if (category !== 'technical' && category !== 'paper') return [];

  const normalized = text.toLowerCase();
  const tagRules: Array<[string, KeywordRule[]]> = [
    ['企业规范', ['规范', '制度', '标准', '合规']],
    ['审批流程', ['审批', '流程', '申请', '节点']],
    ['预算调整', ['预算调整', '预算', '调整']],
    ['系统操作', ['操作指引', '应用技巧', '登录', '入口', '路径']],
    ['常见问题', [/\bq&a\b/i, /\bfaq\b/i, '常见问题']],
    ['设备接入', ['接入', /\bdevice\b/i, '协议']],
    ['边缘计算', ['边缘', /\bedge\b/i]],
    ['数据采集', ['采集', /\bcollector\b/i]],
    ['告警联动', ['告警', '报警']],
    ['部署规范', ['部署', /\binstall\b/i]],
    ['接口设计', ['接口', /\bapi\b/i]],
    ['肠道健康', [/\bgut\b/i, /\bintestinal\b/i, '肠道', /\bibs\b/i, /\bflora\b/i, /\bmicrobiome\b/i]],
    ['过敏免疫', [/\ballergic\b/i, /\brhinitis\b/i, '过敏', '鼻炎', /\bimmune\b/i]],
    ['脑健康', [/\bbrain\b/i, '脑', '认知', /\balzheimer/i]],
    ['运动代谢', [/\bexercise\b/i, '减脂', '运动', /\bmetabolism\b/i, /weight loss/i]],
    ['奶粉配方', ['奶粉', '配方', '乳粉', '婴配粉', /\bformula\b/i, /\binfant\b/i, /\bpediatric\b/i]],
    ['益生菌', [/\bprobiotic\b/i, /\bprebiotic\b/i, /\bsynbiotic\b/i, /\blactobacillus\b/i, /\bbifidobacterium\b/i, '益生菌', '益生元', '菌株']],
    ['营养强化', [/\bnutrition\b/i, /\bnutritional\b/i, /\bhmo\b/i, /\bhmos\b/i, '营养', '强化']],
    ['白皮书', [/white\s*paper/i, '白皮书']],
    ['随机对照', [/\brandomized\b/i, /\bplacebo\b/i, /double-blind/i, '双盲', '随机']],
  ];

  return tagRules
    .filter(([, keywords]) => keywords.some((keyword) => matchesKeyword(normalized, keyword)))
    .map(([label]) => label);
}
