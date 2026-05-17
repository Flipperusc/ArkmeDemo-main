import {
  defaultAISettings,
  deepseekDefaultBaseUrl,
  deepseekDefaultMaxTokens,
  deepseekDefaultModel,
  type AIServiceError,
  type AIServiceResult,
  type AISettings,
  type AISettingsSaveInput,
  type AIThinkingMode,
  type AIReasoningEffort,
} from "@/types/ai";

const aiSettingsStorageKey = "arkme-demo.aiSettings";
const aiProxyBasePath = "/api/ai/deepseek";

// The browser stores only redacted, non-secret preferences. The API Key is sent to
// the same-origin proxy and must be kept in a real server-side secret store in production.
type StoredAISettings = AISettings;

export async function getAISettings(): Promise<AISettings> {
  const cachedSettings = readCachedAISettings();

  try {
    const response = await fetch(`${aiProxyBasePath}/settings`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    const result = await readProxyResult<AISettings>(response);
    if (result.ok) {
      const settings = normalizeAISettings(result.data);
      writeCachedAISettings(settings);
      return settings;
    }
  } catch {
    return cachedSettings;
  }

  return cachedSettings;
}

export async function saveAISettings(
  input: AISettingsSaveInput
): Promise<AIServiceResult<AISettings>> {
  const normalizedInput = normalizeSaveInput(input);

  try {
    const response = await fetch(`${aiProxyBasePath}/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(normalizedInput),
    });
    const result = await readProxyResult<AISettings>(response);
    if (!result.ok) return result;

    const settings = normalizeAISettings(result.data);
    writeCachedAISettings(settings);
    return { ok: true, data: settings };
  } catch {
    return createAIError("proxy_unavailable", "AI 识别暂时不可用", true);
  }
}

export async function clearAISettings(): Promise<AIServiceResult<AISettings>> {
  removeCachedAISettings();

  try {
    await fetch(`${aiProxyBasePath}/settings`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    // Production should clear the server-side secret store. The browser never stores the API Key.
  }

  return { ok: true, data: defaultAISettings };
}

export function createAIError(
  code: AIServiceError["code"],
  message: string,
  retryable = false
): AIServiceResult<never> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
    },
  };
}

export async function readProxyResult<T>(
  response: Response
): Promise<AIServiceResult<T>> {
  const body = await response.json().catch(() => null);

  if (body && typeof body === "object" && "ok" in body) {
    return body as AIServiceResult<T>;
  }

  if (response.status === 401 || response.status === 403) {
    return createAIError("invalid_api_key", "AI 识别暂时不可用", false);
  }

  if (response.status === 404) {
    return createAIError("proxy_unavailable", "AI 识别暂时不可用", true);
  }

  if (response.status === 429) {
    return createAIError("rate_limited", "这次没有成功识别，可以稍后重试或手动创建", true);
  }

  return createAIError("unexpected_response", "AI 识别暂时不可用", response.status >= 500);
}

function readCachedAISettings(): AISettings {
  if (typeof window === "undefined") return defaultAISettings;

  try {
    const rawValue = window.localStorage.getItem(aiSettingsStorageKey);
    if (!rawValue) return defaultAISettings;
    return normalizeAISettings(JSON.parse(rawValue));
  } catch {
    return defaultAISettings;
  }
}

function writeCachedAISettings(settings: AISettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    aiSettingsStorageKey,
    JSON.stringify(normalizeAISettings(settings))
  );
}

function removeCachedAISettings() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(aiSettingsStorageKey);
}

function normalizeSaveInput(input: AISettingsSaveInput): AISettingsSaveInput {
  return {
    enableAI: Boolean(input.enableAI),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: normalizeModel(input.model),
    thinkingMode: normalizeThinkingMode(input.thinkingMode),
    reasoningEffort: normalizeReasoningEffort(input.reasoningEffort),
    maxTokens: normalizeMaxTokens(input.maxTokens),
    ...(input.apiKey ? { apiKey: input.apiKey.trim() } : {}),
  };
}

function normalizeAISettings(input: Partial<StoredAISettings>): AISettings {
  return {
    enableAI: Boolean(input.enableAI),
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: normalizeModel(input.model),
    thinkingMode: normalizeThinkingMode(input.thinkingMode),
    reasoningEffort: normalizeReasoningEffort(input.reasoningEffort),
    maxTokens: normalizeMaxTokens(input.maxTokens),
    hasApiKey: Boolean(input.hasApiKey),
    apiKeyPreview: typeof input.apiKeyPreview === "string" ? input.apiKeyPreview : "",
  };
}

function normalizeBaseUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return deepseekDefaultBaseUrl;
  return value.trim().replace(/\/+$/, "");
}

function normalizeModel(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return deepseekDefaultModel;
  return value.trim();
}

function normalizeThinkingMode(value: unknown): AIThinkingMode {
  return value === "enabled" ? "enabled" : "disabled";
}

function normalizeReasoningEffort(value: unknown): AIReasoningEffort {
  return value === "max" ? "max" : "high";
}

function normalizeMaxTokens(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return deepseekDefaultMaxTokens;
  return Math.min(Math.max(Math.round(numericValue), 256), 8000);
}
