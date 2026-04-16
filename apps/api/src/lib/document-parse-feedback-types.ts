export type DocumentParseFeedbackSchemaType = 'contract' | 'resume' | 'technical' | 'order';

export type FeedbackFieldKind = 'single' | 'multi';

export type FeedbackFieldDefinition = {
  name: string;
  kind: FeedbackFieldKind;
};

export type DocumentParseFeedbackLibrarySchema = {
  fields: Record<string, string[]>;
};

export type DocumentParseFeedbackLibraryEntry = {
  schemas: Partial<Record<DocumentParseFeedbackSchemaType, DocumentParseFeedbackLibrarySchema>>;
};

export type DocumentParseFeedbackStore = {
  version: number;
  updatedAt: string;
  libraries: Record<string, DocumentParseFeedbackLibraryEntry>;
};

export type CollectInput = Record<string, unknown> | null | undefined;

export type ApplyInput<T extends Record<string, unknown>> = {
  feedback: DocumentParseFeedbackStore;
  libraryKeys: string[];
  schemaType?: string;
  text: string;
  fields?: T;
};

export type RecordInput = {
  libraryKeys: string[];
  schemaType?: string;
  structuredProfile?: Record<string, unknown> | null;
};

export type SnapshotInput = {
  feedback?: DocumentParseFeedbackStore;
  libraryKeys: string[];
  schemaType?: string;
  text?: string;
};

export type ClearInput = {
  libraryKeys: string[];
  schemaType?: string;
  fieldName?: string;
  feedback?: DocumentParseFeedbackStore;
};

export type DocumentParseFeedbackSnapshotField = {
  name: string;
  values: string[];
  valueCount: number;
  matchedValues: string[];
  matchedValueCount: number;
};

export type DocumentParseFeedbackSnapshot = {
  schemaType: DocumentParseFeedbackSchemaType;
  libraryKeys: string[];
  updatedAt: string;
  fieldCount: number;
  totalValueCount: number;
  matchedFieldCount: number;
  fields: DocumentParseFeedbackSnapshotField[];
};

export const CONFIG_VERSION = 1;

export const FEEDBACK_FIELD_DEFINITIONS: Record<DocumentParseFeedbackSchemaType, FeedbackFieldDefinition[]> = {
  contract: [
    { name: 'partyA', kind: 'single' },
    { name: 'partyB', kind: 'single' },
    { name: 'paymentTerms', kind: 'single' },
    { name: 'duration', kind: 'single' },
  ],
  resume: [
    { name: 'targetRole', kind: 'single' },
    { name: 'currentRole', kind: 'single' },
    { name: 'latestCompany', kind: 'single' },
    { name: 'expectedCity', kind: 'single' },
    { name: 'skills', kind: 'multi' },
  ],
  technical: [
    { name: 'businessSystem', kind: 'single' },
    { name: 'documentKind', kind: 'single' },
    { name: 'applicableScope', kind: 'single' },
    { name: 'operationEntry', kind: 'single' },
    { name: 'approvalLevels', kind: 'multi' },
    { name: 'policyFocus', kind: 'multi' },
    { name: 'contacts', kind: 'multi' },
  ],
  order: [
    { name: 'platform', kind: 'single' },
    { name: 'topCategory', kind: 'single' },
    { name: 'inventoryStatus', kind: 'single' },
    { name: 'replenishmentAction', kind: 'single' },
  ],
};
