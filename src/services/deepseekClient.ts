import {
  createAIError,
  getAISettings,
  readProxyResult,
} from "@/services/aiSettings";
import {
  DEFAULT_DEEPSEEK_MAX_TOKENS,
  type AIServiceResult,
  type DeepSeekJSONRequest,
} from "@/types/ai";

const aiProxyBasePath = "/api/ai/deepseek";

export async function testDeepSeekConnection(): Promise<
  AIServiceResult<{ model: string; baseUrl: string }>
> {
  try {
    const response = await fetch(`${aiProxyBasePath}/test`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
    return readProxyResult<{ model: string; baseUrl: string }>(response);
  } catch {
    return createAIError("proxy_unavailable", "AI 识别暂时不可用", true);
  }
}

export async function callDeepSeekJSON<T>(
  request: DeepSeekJSONRequest
): Promise<AIServiceResult<T>> {
  const settings = await getAISettings();
  if (!settings.enableAI) {
    return createAIError("ai_disabled", "AI 识别暂时不可用", false);
  }
  if (!settings.hasApiKey) {
    return createAIError("missing_api_key", "未配置 DeepSeek API Key", false);
  }

  try {
    const response = await fetch(`${aiProxyBasePath}/json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...request,
        maxTokens: request.maxTokens ?? settings.maxTokens ?? DEFAULT_DEEPSEEK_MAX_TOKENS,
        thinkingMode: request.thinkingMode ?? settings.thinkingMode,
        reasoningEffort: request.reasoningEffort ?? settings.reasoningEffort,
      }),
    });
    return readProxyResult<T>(response);
  } catch {
    return createAIError("network_error", "这次没有成功识别，可以稍后重试或手动创建", true);
  }
}
