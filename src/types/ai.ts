export const deepseekDefaultBaseUrl = "https://api.deepseek.com";
export const deepseekDefaultModel = "deepseek-v4-pro";
export const deepseekDefaultMaxTokens = 2000;

export type AIThinkingMode = "disabled" | "enabled";
export type AIReasoningEffort = "high" | "max";

export type AISettings = {
  enableAI: boolean;
  baseUrl: string;
  model: string;
  thinkingMode: AIThinkingMode;
  reasoningEffort: AIReasoningEffort;
  maxTokens: number;
  hasApiKey: boolean;
  apiKeyPreview: string;
};

export type AISettingsSaveInput = {
  enableAI: boolean;
  baseUrl: string;
  model: string;
  thinkingMode: AIThinkingMode;
  reasoningEffort: AIReasoningEffort;
  maxTokens: number;
  apiKey?: string;
};

export type AIServiceErrorCode =
  | "ai_disabled"
  | "missing_api_key"
  | "invalid_api_key"
  | "network_error"
  | "json_parse_error"
  | "empty_content"
  | "unexpected_response"
  | "rate_limited"
  | "proxy_unavailable"
  | "unknown_error";

export type AIServiceError = {
  code: AIServiceErrorCode;
  message: string;
  retryable?: boolean;
};

export type AIServiceResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: AIServiceError;
    };

export type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type DeepSeekJSONRequest = {
  messages: DeepSeekMessage[];
  jsonExample: unknown;
  maxTokens?: number;
  thinkingMode?: AIThinkingMode;
  reasoningEffort?: AIReasoningEffort;
};

export const defaultAISettings: AISettings = {
  enableAI: false,
  baseUrl: deepseekDefaultBaseUrl,
  model: deepseekDefaultModel,
  thinkingMode: "disabled",
  reasoningEffort: "high",
  maxTokens: deepseekDefaultMaxTokens,
  hasApiKey: false,
  apiKeyPreview: "",
};
