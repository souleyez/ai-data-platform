export type JsonRecord = Record<string, unknown>;
export type ComposerPromptMode = 'rich' | 'compact';
export type OrderInventoryRequestView = 'generic' | 'platform' | 'category' | 'stock';

export type OrderInventoryPageComposerExecution = {
  content: string | null;
  error: string;
  attemptMode: ComposerPromptMode | '';
  attemptedModes: ComposerPromptMode[];
};
