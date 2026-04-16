export type DocumentVectorIndexEntry = {
  path: string;
  name: string;
  schemaType: string;
  parseStage: string;
  recordCount: number;
  priority: number;
  contentHash: string;
  indexedAt: string;
  groups: string[];
};

export type DocumentVectorIndexMeta = {
  updatedAt: string;
  documentCount: number;
  recordCount: number;
  entries: DocumentVectorIndexEntry[];
};

export type DocumentVectorRecallHit = {
  documentPath: string;
  score: number;
  matchedKinds: string[];
  recordCount: number;
};

export type DocumentVectorSearchOptions = {
  intent?: string;
  templateTask?: string;
};
