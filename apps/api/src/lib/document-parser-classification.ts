import type { DocumentCategoryConfig } from './document-config.js';
import { detectBizCategoryFromConfig } from './document-config.js';
import { RESUME_HINTS } from './document-parser-resume-fields.js';
import {
  buildEvidence,
  CATEGORY_HINTS,
  detectCategoryByHeuristics,
  scoreHints,
} from './document-parser-classification-support.js';
import { detectTopicTags } from './document-parser-classification-topic-tags.js';

export {
  applyGovernedSchemaType,
  applyGovernedSchemaTypeWithEnterpriseGuidance,
  mergeGovernedTopicTags,
  shouldForceExtraction,
} from './document-parser-classification-governance.js';
export { detectTopicTags } from './document-parser-classification-topic-tags.js';

export type ParsedBizCategory = 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory' | 'footfall' | 'general';
export type ParsedSchemaType = 'generic' | 'contract' | 'resume' | 'paper' | 'formula' | 'technical' | 'report' | 'order';

export function detectCategory(filePath: string, text = '') {
  return detectCategoryByHeuristics(filePath, text);
}

export function detectBizCategory(filePath: string, category: string, text = '', config?: DocumentCategoryConfig): ParsedBizCategory {
  if (config) {
    const matched = detectBizCategoryFromConfig(filePath, config);
    if (matched) return matched;
  }

  const evidence = buildEvidence(filePath, text);
  const hasFootfallMetricSignal = /(footfall|visitor_count|visitor count|visitors|traffic_count|entry_count|passenger_flow|客流|人流|到访量|进店客流|进入人数|进场人数|入场人数|离开人数)/i.test(evidence);
  const hasFootfallSpatialSignal = /(mall_zone|mall zone|mall_area|mall partition|shopping_zone|business_zone|floor_zone|floor zone|room_unit|shop_unit|shop_no|商场分区|商场区域|商业分区|楼层分区|楼层区域|楼层|单间|铺位|店铺|区域|位置|点位)/i.test(evidence);
  const hasOrderFieldSignal = /(order_id|order_count|units_sold|net_sales|gross_profit|gross_margin|avg_order_value|refund_total|discount_total|shop_name)/i.test(evidence);
  const hasInventoryFieldSignal = /(inventory_index|days_of_cover|safety_stock|replenishment_priority|risk_flag|platform_focus|warehouse|inbound_7d)/i.test(evidence);
  const hasFootfallPathSignal = /(?:footfall|visitor|traffic|客流|人流)[-_/\\]/i.test(filePath);
  const hasOrderPathSignal = /(?:order|orders|sales)[-_/\\]/i.test(filePath);
  const hasInventoryPathSignal = /(?:inventory|stock|sku)[-_/\\]/i.test(filePath);
  if (category === 'resume' || RESUME_HINTS.some((hint) => evidence.includes(hint.toLowerCase()))) return 'general';
  if (scoreHints(evidence, ['发票', '票据', '凭据', 'invoice']) >= 4) return 'invoice';
  if ((hasFootfallMetricSignal && hasFootfallSpatialSignal) || (hasFootfallPathSignal && hasFootfallMetricSignal)) return 'footfall';
  if (hasOrderFieldSignal) return 'order';
  if (hasInventoryFieldSignal) return 'inventory';
  if (hasInventoryPathSignal) return 'inventory';
  if (hasOrderPathSignal) return 'order';
  if (scoreHints(evidence, ['客流', '人流', '商场分区', '楼层分区', 'visitor', 'footfall']) >= 6) return 'footfall';
  if (scoreHints(evidence, ['订单', '回款', '销售', 'order']) >= 4) return 'order';
  if (scoreHints(evidence, ['客服', '工单', '投诉', 'service']) >= 4) return 'service';
  if (scoreHints(evidence, ['库存', 'sku', '出入库', 'inventory']) >= 4) return 'inventory';
  if (category === 'contract' || scoreHints(evidence, CATEGORY_HINTS.contract) >= 4) return 'contract';
  if (category === 'report' || scoreHints(evidence, CATEGORY_HINTS.report) >= 4) return 'daily';
  if (category === 'paper' || scoreHints(evidence, CATEGORY_HINTS.paper) >= 5) return 'paper';
  return 'general';
}

export function detectRiskLevel(text: string, category: string): 'low' | 'medium' | 'high' | undefined {
  if (category !== 'contract') return undefined;
  const normalized = text.toLowerCase();
  if (normalized.includes('违约') || normalized.includes('罚则') || normalized.includes('未约定')) return 'high';
  if (normalized.includes('付款') || normalized.includes('账期') || normalized.includes('期限')) return 'medium';
  return 'low';
}
