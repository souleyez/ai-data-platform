import { loadDocumentLibraries } from './document-libraries.js';
import {
  buildKnowledgePlanMessage,
  buildKnowledgePlanPrompt,
  buildLocalKnowledgePlan,
  buildNoPlanMessage,
  buildPromptForScoring,
  collectLibraryMatches,
  extractPlanningResult,
  shouldFallbackToLocalPlan,
  type KnowledgePlan,
} from './knowledge-plan.js';
import { runOpenClawChat } from './openclaw-adapter.js';
import type { ChatOutput } from './knowledge-output.js';

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export async function executeKnowledgePlan(
  prompt: string,
  chatHistory: ChatHistoryItem[],
  sessionUser?: string,
) {
  const documentLibraries = await loadDocumentLibraries();
  const localPlan = buildLocalKnowledgePlan(prompt, chatHistory);
  let planning = localPlan;

  try {
    const cloud = await runOpenClawChat({
      prompt: buildKnowledgePlanPrompt(prompt, chatHistory),
      sessionUser,
      chatHistory: [],
    });
    const cloudPlan = extractPlanningResult(cloud.content, localPlan.request);
    if (!shouldFallbackToLocalPlan(cloudPlan.request)) {
      planning = {
        request: cloudPlan.request || localPlan.request,
        outputType: (cloudPlan.outputType || localPlan.outputType) as 'table' | 'page' | 'pdf' | 'ppt',
      };
    }
  } catch {
    planning = localPlan;
  }

  const matchedLibraries = collectLibraryMatches(
    buildPromptForScoring(planning.request, chatHistory),
    documentLibraries,
  ).map((item) => ({ key: item.library.key, label: item.library.label }));

  const knowledgePlan: KnowledgePlan = {
    request: planning.request,
    libraries: matchedLibraries,
    outputType: planning.outputType,
  };

  const content = planning.request ? buildKnowledgePlanMessage() : buildNoPlanMessage();
  const output: ChatOutput = { type: 'answer', content };

  return {
    libraries: matchedLibraries,
    knowledgePlan,
    content,
    output,
    intent: 'report' as const,
    mode: 'openclaw' as const,
  };
}
