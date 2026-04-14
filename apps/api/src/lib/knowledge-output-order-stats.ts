import type { ParsedDocument } from './document-parser.js';
import type { OrderOutputDeps, OrderPageStats } from './knowledge-output-order.js';
import { buildOrderCsvDerivedFacts } from './knowledge-output-order-csv.js';
import {
  buildOrderSupportingLines,
  collectOrderAnomalySignals,
  collectOrderCategorySignals,
  collectOrderChannelSignals,
  collectOrderMetricSignals,
  collectOrderReplenishmentSignals,
} from './knowledge-output-order-signals.js';

export function buildOrderPageStats(documents: ParsedDocument[], deps: OrderOutputDeps): OrderPageStats {
  const derived = buildOrderCsvDerivedFacts(documents, deps);
  return {
    documentCount: documents.length,
    channels: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderChannelSignals(item, deps)), 8),
    categories: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderCategorySignals(item, deps)), 8),
    metrics: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderMetricSignals(item, deps)), 8),
    replenishment: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderReplenishmentSignals(item, deps)), 8),
    anomalies: deps.buildRankedLabelCounts(documents.flatMap((item) => collectOrderAnomalySignals(item, deps)), 8),
    supportingLines: buildOrderSupportingLines(documents, deps),
    platformAmounts: derived.platformAmounts,
    categoryAmounts: derived.categoryAmounts,
    riskHighlights: derived.riskHighlights,
    actionHighlights: derived.actionHighlights,
  };
}
