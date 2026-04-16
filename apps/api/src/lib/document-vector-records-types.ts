import type { ParsedDocument } from './document-parser.js';

export type DocumentVectorRecordKind =
  | 'summary'
  | 'profile'
  | 'profile-field'
  | 'evidence'
  | 'claim';

export type DocumentVectorRecord = {
  id: string;
  documentPath: string;
  documentName: string;
  schemaType: NonNullable<ParsedDocument['schemaType']>;
  parseStage: NonNullable<ParsedDocument['parseStage']>;
  kind: DocumentVectorRecordKind;
  text: string;
  metadata: Record<string, unknown>;
};
