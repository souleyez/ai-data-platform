import type { ParsedDocument } from './document-parser.js';
import type { OrderOutputDeps } from './knowledge-output-order.js';
import {
  addOrderAmount,
  extractOrderCsvTable,
  findOrderHeaderIndex,
  formatOrderSignalLabel,
  normalizeOrderPriority,
  parseOrderNumericValue,
  pickTopOrderHighlights,
  rankOrderAmounts,
  scoreOrderRiskHighlight,
  shouldTreatOrderRiskAsMaterial,
} from './knowledge-output-order-csv-support.js';

export {
  collectOrderCsvMetricSignals,
  collectOrderCsvSupportingLines,
  collectOrderCsvValues,
  collectOrderProfileStrings,
  formatOrderSignalLabel,
} from './knowledge-output-order-csv-support.js';

export function buildOrderCsvDerivedFacts(
  documents: ParsedDocument[],
  deps: Pick<OrderOutputDeps, 'normalizeText' | 'sanitizeText' | 'containsAny'>,
) {
  const platformAmounts = new Map<string, { label: string; value: number }>();
  const categoryAmounts = new Map<string, { label: string; value: number }>();
  const riskEntries: Array<{ key?: string; text: string; score: number }> = [];
  const actionEntries: Array<{ key?: string; text: string; score: number }> = [];

  for (const item of documents) {
    const table = extractOrderCsvTable(item, deps, 240);
    if (!table) continue;

    const platformIndex = findOrderHeaderIndex(table.headers, ['platform', 'platform_focus'], deps);
    const categoryIndex = findOrderHeaderIndex(table.headers, ['category'], deps);
    const skuIndex = findOrderHeaderIndex(table.headers, ['sku'], deps);
    const netSalesIndex = findOrderHeaderIndex(table.headers, ['net_sales', 'net_amount'], deps);
    const inventoryIndexIndex = findOrderHeaderIndex(table.headers, ['inventory_index'], deps);
    const daysOfCoverIndex = findOrderHeaderIndex(table.headers, ['days_of_cover'], deps);
    const riskIndex = findOrderHeaderIndex(table.headers, ['risk_flag', 'risk', 'inventory_risk'], deps);
    const priorityIndex = findOrderHeaderIndex(table.headers, ['replenishment_priority'], deps);
    const recommendationIndex = findOrderHeaderIndex(table.headers, ['recommendation'], deps);

    for (const row of table.rows) {
      const platform = platformIndex >= 0 ? formatOrderSignalLabel(row[platformIndex] || '', deps) : '';
      const category = categoryIndex >= 0 ? formatOrderSignalLabel(row[categoryIndex] || '', deps) : '';
      const sku = skuIndex >= 0 ? deps.sanitizeText(row[skuIndex]).slice(0, 60).trim() : '';
      const netSales = netSalesIndex >= 0 ? parseOrderNumericValue(row[netSalesIndex], deps) : null;
      const inventoryIndex = inventoryIndexIndex >= 0 ? parseOrderNumericValue(row[inventoryIndexIndex], deps) : null;
      const daysOfCover = daysOfCoverIndex >= 0 ? parseOrderNumericValue(row[daysOfCoverIndex], deps) : null;
      const risk = riskIndex >= 0 ? formatOrderSignalLabel(row[riskIndex] || '', deps) : '';
      const priority = priorityIndex >= 0 ? normalizeOrderPriority(row[priorityIndex], deps) : '';
      const recommendation = recommendationIndex >= 0 ? deps.sanitizeText(row[recommendationIndex]).slice(0, 80).trim() : '';

      if (platform && netSales !== null) addOrderAmount(platformAmounts, platform, netSales, deps);
      if (category && netSales !== null) addOrderAmount(categoryAmounts, category, netSales, deps);

      const subject = deps.sanitizeText(sku || category || platform).slice(0, 60).trim();
      if (!subject) continue;

      const score = scoreOrderRiskHighlight(risk, priority, inventoryIndex, daysOfCover, deps);
      const highlightKey = [deps.normalizeText(subject), deps.normalizeText(platform)].filter(Boolean).join('::');
      if (shouldTreatOrderRiskAsMaterial(risk, priority, inventoryIndex, daysOfCover, deps)) {
        const text = [
          subject,
          platform && subject !== platform ? platform : '',
          risk ? `风险 ${risk}` : '',
          inventoryIndex !== null ? `库存指数 ${inventoryIndex.toFixed(2).replace(/\.00$/, '')}` : '',
          daysOfCover !== null ? `覆盖 ${Math.round(daysOfCover)} 天` : '',
        ]
          .filter(Boolean)
          .join(' / ');
        riskEntries.push({ key: highlightKey, text, score });
      }

      if (priority || recommendation) {
        const text = [
          subject,
          platform && subject !== platform ? platform : '',
          priority ? `优先级 ${priority}` : '',
          recommendation ? `建议 ${recommendation}` : '',
        ]
          .filter(Boolean)
          .join(' / ');
        actionEntries.push({ key: highlightKey, text, score: score + (recommendation ? 1 : 0) });
      }
    }
  }

  return {
    platformAmounts: rankOrderAmounts(platformAmounts, 8),
    categoryAmounts: rankOrderAmounts(categoryAmounts, 8),
    riskHighlights: pickTopOrderHighlights(riskEntries, deps, 4),
    actionHighlights: pickTopOrderHighlights(actionEntries, deps, 4),
  };
}
