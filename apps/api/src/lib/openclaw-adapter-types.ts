export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenClawChatRequest = {
  prompt: string;
  systemPrompt?: string;
  contextBlocks?: string[];
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionUser?: string;
  modelOverride?: string;
  timeoutMs?: number;
  preferResponses?: boolean;
};

export type OpenClawChatResult = {
  content: string;
  provider: 'cloud-gateway';
  model: string;
  raw?: unknown;
};

export type OpenClawResponseInputItem = {
  type: 'message';
  role: 'system' | 'developer' | 'user' | 'assistant';
  content: string;
};

export type OpenClawResponsesPayload = {
  id?: string;
  output?: Array<
    | {
        type?: 'message';
        content?: Array<{ type?: string; text?: string }>;
      }
    | {
        type?: 'reasoning';
        content?: string;
        summary?: string;
      }
  >;
};
