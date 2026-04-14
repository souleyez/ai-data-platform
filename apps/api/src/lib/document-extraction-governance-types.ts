export type DocumentGovernedSchemaType = 'contract' | 'resume' | 'technical' | 'order';
export type DocumentExtractionFieldSet = 'contract' | 'resume' | 'enterprise-guidance' | 'order';
export type DocumentExtractionFieldKey =
  | 'contractNo'
  | 'partyA'
  | 'partyB'
  | 'amount'
  | 'signDate'
  | 'effectiveDate'
  | 'paymentTerms'
  | 'duration'
  | 'candidateName'
  | 'targetRole'
  | 'currentRole'
  | 'yearsOfExperience'
  | 'education'
  | 'major'
  | 'expectedCity'
  | 'expectedSalary'
  | 'latestCompany'
  | 'companies'
  | 'skills'
  | 'highlights'
  | 'projectHighlights'
  | 'itProjectHighlights'
  | 'businessSystem'
  | 'documentKind'
  | 'applicableScope'
  | 'operationEntry'
  | 'approvalLevels'
  | 'policyFocus'
  | 'contacts'
  | 'period'
  | 'platform'
  | 'orderCount'
  | 'netSales'
  | 'grossMargin'
  | 'topCategory'
  | 'inventoryStatus'
  | 'replenishmentAction';

export type DocumentExtractionFieldPromptMap = Partial<Record<DocumentExtractionFieldKey, string>>;
export type DocumentExtractionFieldNormalizationRules = Partial<Record<DocumentExtractionFieldKey, string[]>>;
export type DocumentExtractionFieldConflictStrategy = 'keep-first' | 'keep-last' | 'merge-distinct';
export type DocumentExtractionFieldConflictStrategyMap =
  Partial<Record<DocumentExtractionFieldKey, DocumentExtractionFieldConflictStrategy>>;

export const DOCUMENT_EXTRACTION_FIELD_KEYS_BY_SET: Record<DocumentExtractionFieldSet, DocumentExtractionFieldKey[]> = {
  contract: ['contractNo', 'partyA', 'partyB', 'amount', 'signDate', 'effectiveDate', 'paymentTerms', 'duration'],
  resume: [
    'candidateName',
    'targetRole',
    'currentRole',
    'yearsOfExperience',
    'education',
    'major',
    'expectedCity',
    'expectedSalary',
    'latestCompany',
    'companies',
    'skills',
    'highlights',
    'projectHighlights',
    'itProjectHighlights',
  ],
  'enterprise-guidance': [
    'businessSystem',
    'documentKind',
    'applicableScope',
    'operationEntry',
    'approvalLevels',
    'policyFocus',
    'contacts',
  ],
  order: [
    'period',
    'platform',
    'orderCount',
    'netSales',
    'grossMargin',
    'topCategory',
    'inventoryStatus',
    'replenishmentAction',
  ],
};

export type DocumentLibraryContext = {
  keys: string[];
  labels: string[];
};

export type DocumentExtractionProfile = {
  id: string;
  label: string;
  matchLibraryKeys: string[];
  matchLibraryLabels: string[];
  fieldSet: DocumentExtractionFieldSet;
  fallbackSchemaType?: DocumentGovernedSchemaType;
  preferredFieldKeys?: DocumentExtractionFieldKey[];
  requiredFieldKeys?: DocumentExtractionFieldKey[];
  fieldAliases?: Partial<Record<DocumentExtractionFieldKey, string>>;
  fieldPrompts?: DocumentExtractionFieldPromptMap;
  fieldNormalizationRules?: DocumentExtractionFieldNormalizationRules;
  fieldConflictStrategies?: DocumentExtractionFieldConflictStrategyMap;
};

export type DocumentExtractionGovernanceConfig = {
  version: number;
  updatedAt: string;
  profiles: DocumentExtractionProfile[];
};

export type DocumentLibraryExtractionSettings = {
  profileId?: string;
  fieldSet?: DocumentExtractionFieldSet;
  fallbackSchemaType?: DocumentGovernedSchemaType;
  preferredFieldKeys?: DocumentExtractionFieldKey[];
  requiredFieldKeys?: DocumentExtractionFieldKey[];
  fieldAliases?: Partial<Record<DocumentExtractionFieldKey, string>>;
  fieldPrompts?: DocumentExtractionFieldPromptMap;
  fieldNormalizationRules?: DocumentExtractionFieldNormalizationRules;
  fieldConflictStrategies?: DocumentExtractionFieldConflictStrategyMap;
};
