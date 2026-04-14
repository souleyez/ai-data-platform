import type { ResumeFields, ParsedDocument } from './document-parser.js';
import { deriveSchemaProfile, refreshDerivedSchemaProfile } from './document-parser.js';
import { getParsedDocumentCanonicalText } from './document-canonical-text.js';
import { runDocumentAdvancedParse } from './document-advanced-parse-provider.js';
import { mergeResumeFields } from './resume-canonicalizer.js';
import {
  buildDocumentContext,
  extractJsonObject,
  mergeClaims,
  mergeEntities,
  mergeEvidenceChunks,
  mergeIntentSlots,
  normalizeLegacyBizCategory,
  sanitizeText,
  uniqStrings,
} from './document-cloud-enrichment-common.js';

export async function enrichTextOne(
  item: ParsedDocument,
  runTextParse = runDocumentAdvancedParse,
): Promise<ParsedDocument> {
  const canonicalText = getParsedDocumentCanonicalText(item);
  if (item.parseStatus !== 'parsed' || !canonicalText || item.extractedChars < 80) {
    return item;
  }

  const result = await runTextParse({
    prompt: buildDocumentContext(item),
  });
  if (!result) return item;
  const structured = extractJsonObject(result.content);
  if (!structured) return item;

  const evidenceChunks = mergeEvidenceChunks(item.evidenceChunks, structured.evidenceBlocks);
  const entities = mergeEntities(item.entities, structured.entities, evidenceChunks);
  const claims = mergeClaims(item.claims, structured.claims, evidenceChunks);
  const topicTags = uniqStrings([...(item.topicTags || []), ...(structured.topicTags || [])]).slice(0, 16);
  const intentSlots = mergeIntentSlots(item.intentSlots, structured.intentSlots);
  const summary = sanitizeText(structured.summary, 500) || item.summary;
  const resumeFields = mergeResumeFields(
    [structured.resumeFields as ResumeFields | undefined, item.resumeFields as ResumeFields | undefined],
    {
      title: item.title || item.name,
      sourceName: item.name,
      summary,
      excerpt: item.excerpt,
      fullText: canonicalText,
    },
  );
  const schemaDerived = deriveSchemaProfile({
    category: item.category,
    bizCategory: normalizeLegacyBizCategory(item.bizCategory),
    title: item.title || item.name,
    topicTags,
    summary,
    contractFields: item.contractFields,
    resumeFields,
  });

  return refreshDerivedSchemaProfile({
    ...item,
    parseMethod: item.parseMethod?.includes('openclaw') ? item.parseMethod : `${item.parseMethod || 'parsed'}+openclaw`,
    parseStage: 'detailed',
    summary,
    excerpt: item.excerpt || summary,
    topicTags,
    evidenceChunks,
    entities,
    claims,
    intentSlots,
    resumeFields,
    riskLevel: structured.riskLevel || item.riskLevel,
    schemaType: schemaDerived.schemaType,
    structuredProfile: schemaDerived.structuredProfile,
    cloudStructuredAt: new Date().toISOString(),
    cloudStructuredModel: result.model,
  });
}
