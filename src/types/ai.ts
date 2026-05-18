import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MAX_TOKENS,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_THINKING_MODE,
  type AIReasoningEffort,
  type AIThinkingMode,
} from "../../shared/aiDefaults";

export {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MAX_TOKENS,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_THINKING_MODE,
  type AIReasoningEffort,
  type AIThinkingMode,
};
export const ARRANGEMENT_AI_JSON_MAX_TOKENS = 2000;
export const PRIVATE_COMMITMENT_JSON_MAX_TOKENS = 2000;
export const PRIVATE_SUPPLEMENT_MERGE_JSON_MAX_TOKENS = 1600;
export const ARRANGEMENT_SIMILAR_MERGE_JSON_MAX_TOKENS = 1800;
export const ARRANGEMENT_STATUS_CHANGE_JSON_MAX_TOKENS = 1600;
export const GROUP_RELATED_ARRANGEMENT_JSON_MAX_TOKENS = 2000;
export const ARRANGEMENT_AI_ASSIST_JSON_MAX_TOKENS = 1600;
export const ARRANGEMENT_AI_ASSIST_GENERATION_JSON_MAX_TOKENS = 2400;

export const deepseekDefaultBaseUrl = DEFAULT_DEEPSEEK_BASE_URL;
export const deepseekDefaultModel = DEFAULT_DEEPSEEK_MODEL;
export const deepseekDefaultMaxTokens = DEFAULT_DEEPSEEK_MAX_TOKENS;

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
  baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
  model: DEFAULT_DEEPSEEK_MODEL,
  thinkingMode: DEFAULT_THINKING_MODE,
  reasoningEffort: DEFAULT_REASONING_EFFORT,
  maxTokens: DEFAULT_DEEPSEEK_MAX_TOKENS,
  hasApiKey: false,
  apiKeyPreview: "",
};
