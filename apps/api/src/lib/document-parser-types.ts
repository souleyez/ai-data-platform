export type ParsedDocument = {
  path: string;
  name: string;
  ext: string;
  title: string;
  category: string;
  bizCategory: 'paper' | 'contract' | 'daily' | 'invoice' | 'order' | 'service' | 'inventory' | 'footfall' | 'general';
  groupConfirmedAt?: string;
  parseStatus: 'parsed' | 'unsupported' | 'error';
  parseMethod?: string;
  summary: string;
  excerpt: string;
  fullText?: string;
  markdownText?: string;
  markdownMethod?: string;
  markdownGeneratedAt?: string;
  markdownError?: string;
  canonicalParseStatus?: 'ready' | 'fallback_full_text' | 'failed' | 'unsupported';
  extractedChars: number;
  evidenceChunks?: EvidenceChunk[];
  entities?: StructuredEntity[];
  claims?: StructuredClaim[];
  intentSlots?: IntentSlots;
  resumeFields?: ResumeFields;
  riskLevel?: 'low' | 'medium' | 'high';
  topicTags?: string[];
  groups?: string[];
  confirmedGroups?: string[];
  suggestedGroups?: string[];
  ignored?: boolean;
  contractFields?: {
    contractNo?: string;
    partyA?: string;
    partyB?: string;
    amount?: string;
    signDate?: string;
    effectiveDate?: string;
    paymentTerms?: string;
    duration?: string;
  };
  enterpriseGuidanceFields?: {
    businessSystem?: string;
    documentKind?: string;
    applicableScope?: string;
    operationEntry?: string;
    approvalLevels?: string[];
    policyFocus?: string[];
    contacts?: string[];
  };
  orderFields?: {
    period?: string;
    platform?: string;
    orderCount?: string;
    netSales?: string;
    grossMargin?: string;
    topCategory?: string;
    inventoryStatus?: string;
    replenishmentAction?: string;
  };
  footfallFields?: {
    period?: string;
    totalFootfall?: string;
    topMallZone?: string;
    mallZoneCount?: string;
    aggregationLevel?: string;
  };
  retentionStatus?: 'structured-only';
  retainedAt?: string;
  originalDeletedAt?: string;
  cloudStructuredAt?: string;
  cloudStructuredModel?: string;
  parseStage?: 'quick' | 'detailed';
  detailParseStatus?: 'queued' | 'processing' | 'succeeded' | 'failed';
  detailParseQueuedAt?: string;
  detailParsedAt?: string;
  detailParseAttempts?: number;
  detailParseError?: string;
  analysisEditedAt?: string;
  manualSummary?: boolean;
  manualStructuredProfile?: boolean;
  manualEvidenceChunks?: boolean;
  schemaType?: 'generic' | 'contract' | 'resume' | 'paper' | 'formula' | 'technical' | 'report' | 'order';
  structuredProfile?: Record<string, unknown>;
};

export type EvidenceChunk = {
  id: string;
  order: number;
  text: string;
  charLength: number;
  page?: number;
  sectionTitle?: string;
  regionHint?: string;
  title?: string;
};

export type TableSheetSummary = {
  name: string;
  rowCount: number;
  columnCount: number;
  columns: string[];
  sampleRows: Array<Record<string, string>>;
  recordKeyField?: string;
  recordFieldRoles?: TableRecordFieldRoles;
  recordRows?: TableStructuredRow[];
  recordInsights?: TableRecordInsightSummary;
  insights?: TableInsightSummary;
};

export type TableRecordFieldRoles = {
  periodField?: string;
  platformField?: string;
  categoryField?: string;
  skuField?: string;
  mallZoneField?: string;
  floorZoneField?: string;
  roomUnitField?: string;
  footfallField?: string;
  orderCountField?: string;
  quantityField?: string;
  netSalesField?: string;
  grossAmountField?: string;
  refundAmountField?: string;
  grossProfitField?: string;
  grossMarginField?: string;
  inventoryBeforeField?: string;
  inventoryAfterField?: string;
  inventoryRiskField?: string;
  recommendationField?: string;
  replenishmentPriorityField?: string;
};

export type TableRecordAlert = {
  type: 'low_margin' | 'high_refund' | 'inventory_risk';
  rowNumber: number;
  keyValue?: string;
  severity: 'medium' | 'high';
  message: string;
};

export type TablePlatformBreakdown = {
  platform: string;
  rowCount: number;
  netSales: number;
  inventoryRiskRowCount: number;
};

export type TableMallZoneBreakdown = {
  mallZone: string;
  rowCount: number;
  footfall: number;
  floorZoneCount: number;
  roomUnitCount: number;
};

export type TableCategoryBreakdown = {
  category: string;
  rowCount: number;
  netSales: number;
  inventoryRiskRowCount: number;
};

export type TableSkuNetSalesSummary = {
  sku: string;
  platform?: string;
  rowCount: number;
  netSales: number;
  inventoryStatus?: string;
};

export type TableInventoryRiskBreakdown = {
  inventoryStatus: string;
  count: number;
};

export type TableRecordInsightSummary = {
  topPlatforms?: string[];
  topCategories?: string[];
  topMallZones?: string[];
  totalFootfall?: number;
  lowMarginRowCount?: number;
  highRefundRowCount?: number;
  inventoryRiskRowCount?: number;
  topRiskSkus?: string[];
  priorityReplenishmentItems?: string[];
  refundHotspots?: string[];
  platformBreakdown?: TablePlatformBreakdown[];
  categoryBreakdown?: TableCategoryBreakdown[];
  mallZoneBreakdown?: TableMallZoneBreakdown[];
  topSkuNetSales?: TableSkuNetSalesSummary[];
  inventoryRiskBreakdown?: TableInventoryRiskBreakdown[];
  alerts?: TableRecordAlert[];
};

export type TableStructuredRow = {
  rowNumber: number;
  keyValue?: string;
  values: Record<string, string>;
  derivedFields?: Record<string, string>;
};

export type TableDateSummary = {
  column: string;
  min: string;
  max: string;
  distinctCount: number;
  granularity: 'month' | 'date' | 'datetime';
};

export type TableMetricSummary = {
  column: string;
  kind: 'number' | 'currency' | 'percent';
  nonEmptyCount: number;
  min: number;
  max: number;
  sum: number;
  avg: number;
};

export type TableDimensionValueSummary = {
  value: string;
  count: number;
};

export type TableDimensionSummary = {
  column: string;
  distinctCount: number;
  topValues: TableDimensionValueSummary[];
};

export type TableInsightSummary = {
  dateColumns?: TableDateSummary[];
  metricColumns?: TableMetricSummary[];
  dimensionColumns?: TableDimensionSummary[];
};

export type TableSummary = {
  format: 'csv' | 'xlsx';
  rowCount: number;
  columnCount: number;
  columns: string[];
  sampleRows: Array<Record<string, string>>;
  sheetCount: number;
  primarySheetName?: string;
  recordKeyField?: string;
  recordFieldRoles?: TableRecordFieldRoles;
  recordRows?: TableStructuredRow[];
  recordInsights?: TableRecordInsightSummary;
  sheets?: TableSheetSummary[];
  insights?: TableInsightSummary;
};

export type StructuredEntity = {
  text: string;
  type: 'ingredient' | 'strain' | 'audience' | 'benefit' | 'dose' | 'organization' | 'metric' | 'identifier' | 'term';
  source: 'rule' | 'uie';
  confidence: number;
  evidenceChunkId?: string;
};

export type StructuredClaim = {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  evidenceChunkId?: string;
};

export type IntentSlots = {
  audiences?: string[];
  ingredients?: string[];
  strains?: string[];
  benefits?: string[];
  doses?: string[];
  organizations?: string[];
  metrics?: string[];
};

export type ResumeFields = {
  candidateName?: string;
  targetRole?: string;
  currentRole?: string;
  yearsOfExperience?: string;
  education?: string;
  major?: string;
  expectedCity?: string;
  expectedSalary?: string;
  latestCompany?: string;
  companies?: string[];
  skills?: string[];
  highlights?: string[];
  projectHighlights?: string[];
  itProjectHighlights?: string[];
};

export const DOCUMENT_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'] as const;
export const DOCUMENT_PRESENTATION_EXTENSIONS = ['.ppt', '.pptx', '.pptm'] as const;
export const DOCUMENT_AUDIO_EXTENSIONS = ['.wav', '.mp3'] as const;
export const DOCUMENT_PARSE_SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.docx',
  '.csv',
  '.json',
  '.html',
  '.htm',
  '.xml',
  '.xlsx',
  '.xls',
  '.epub',
  ...DOCUMENT_AUDIO_EXTENSIONS,
  ...DOCUMENT_PRESENTATION_EXTENSIONS,
  ...DOCUMENT_IMAGE_EXTENSIONS,
] as const;
