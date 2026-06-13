export type AIProvider = 'ANTHROPIC' | 'GEMINI';

export type AIKeyMode =
  | 'SERVER' // server-stored env keys
  | 'USER'   // user-supplied keys, encrypted at rest
  | 'EXPORT'; // no SDK call, prompt is exported for manual paste

export interface AnalysisRequest {
  provider: AIProvider;
  model?: string;
  activityIds: string[];
  question: string;
  keyMode?: AIKeyMode; // defaults to SERVER if env key is set, else EXPORT
}

export interface AnalysisResult {
  id: string;
  provider: AIProvider;
  model: string;
  prompt: string;
  response: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: number | null;
  createdAt: string;
}

export interface ExportedPrompt {
  prompt: string;
  attachments: Array<{ filename: string; mimeType: string; content: string }>;
}
