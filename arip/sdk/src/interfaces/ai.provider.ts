export interface AICompletionRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  stream?: boolean;
  tools?: AITool[];
}

export interface AITool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AICompletionResult {
  text: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length' | 'tool_use' | 'error';
  toolCalls?: AIToolCall[];
}

export interface AIToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AIEmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface AIEmbeddingResult {
  embeddings: number[][];
  model: string;
  usage: { inputTokens: number };
}

export interface AIClassificationResult {
  label: string;
  score: number;
}

export interface AIProvider {
  readonly name: string;
  readonly capabilities: Array<'completion' | 'embedding' | 'classification' | 'vision' | 'speech'>;

  complete(request: AICompletionRequest): Promise<AICompletionResult>;
  embed(request: AIEmbeddingRequest): Promise<AIEmbeddingResult>;
  classify(text: string, labels: string[]): Promise<AIClassificationResult[]>;
  isAvailable(): Promise<boolean>;
}
