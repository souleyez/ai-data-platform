export type {
  RetrievalIntent,
  TemplateTask,
} from './document-retrieval-template-candidate-types.js';

export {
  hasFormulaLibraryBias,
  isBidTemplateCandidate,
  isFootfallTemplateCandidate,
  isHighValueKnowledgeDocument,
  isIotTemplateCandidate,
  isOrderTemplateCandidate,
  isPurePaperCandidate,
  isReliableResumeCandidate,
  isStoredKnowledgeDocument,
  matchesTemplateTask,
} from './document-retrieval-template-candidate-support.js';

export {
  preselectDocumentsByTemplateTask,
  preselectEvidencePoolByTemplateTask,
  selectTemplateCandidates,
} from './document-retrieval-template-candidate-selectors.js';
