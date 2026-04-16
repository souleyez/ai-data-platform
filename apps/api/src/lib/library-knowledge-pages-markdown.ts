import type { LibraryKnowledgeCompilation } from './library-knowledge-pages-types.js';

export function buildOverviewMarkdown(summary: LibraryKnowledgeCompilation) {
  return [
    `# ${summary.libraryLabel} Knowledge Overview`,
    '',
    `- Updated: ${summary.updatedAt}`,
    `- Mode: ${summary.mode}`,
    `- Document count: ${summary.documentCount}`,
    summary.description ? `- Description: ${summary.description}` : '',
    '',
    '## Overview',
    summary.overview || '- No overview available yet',
    '',
    '## Suggested Questions',
    ...(summary.suggestedQuestions.length ? summary.suggestedQuestions.map((entry) => `- ${entry}`) : ['- No suggested questions yet']),
    '',
    '## Key Topics',
    ...(summary.keyTopics.length ? summary.keyTopics.map((entry) => `- ${entry}`) : ['- No stable topic clusters yet']),
    '',
    '## Key Facts',
    ...(summary.keyFacts.length ? summary.keyFacts.map((entry) => `- ${entry}`) : ['- No extracted key facts yet']),
    '',
    '## Focused Field Coverage',
    ...(summary.focusedFieldCoverage?.length
      ? summary.focusedFieldCoverage.map((entry) => {
        const coverage = `${entry.populatedDocumentCount}/${entry.totalDocumentCount}`;
        const resolvedValues = entry.resolvedValues.length ? ` => ${entry.resolvedValues.join(' / ')}` : '';
        const prompt = entry.prompt ? ` [hint: ${entry.prompt}]` : '';
        return `- ${entry.alias} (${coverage}, ${Math.round(entry.coverageRatio * 100)}%, ${entry.conflictStrategy})${resolvedValues}${prompt}`;
      })
      : ['- No governed field coverage yet']),
    '',
    '## Field Conflicts',
    ...(summary.fieldConflicts?.length
      ? summary.fieldConflicts.map((entry) => `- ${entry.alias} (${entry.conflictStrategy}): ${entry.values.join(' / ')}`)
      : ['- No multi-value conflicts detected']),
    '',
    '## Representative Documents',
    ...(summary.representativeDocuments.length
      ? summary.representativeDocuments.map((item) => item.summary ? `- ${item.title}: ${item.summary}` : `- ${item.title}`)
      : ['- No representative documents yet']),
    '',
  ].filter(Boolean).join('\n');
}

export function buildUpdatesMarkdown(summary: LibraryKnowledgeCompilation) {
  return [
    `# ${summary.libraryLabel} Knowledge Updates`,
    '',
    `- Updated: ${summary.updatedAt}`,
    `- Trigger: ${summary.trigger}`,
    `- Mode: ${summary.mode}`,
    '',
    '## Recent Source Updates',
    ...(summary.recentUpdates.length
      ? summary.recentUpdates.map((item) => item.summary
        ? `- [${item.updatedAt || '-'}] ${item.title}: ${item.summary}`
        : `- [${item.updatedAt || '-'}] ${item.title}`)
      : ['- No recent source updates']),
    '',
  ].join('\n');
}
