import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MAX_TOKENS,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_THINKING_MODE,
  type AIReasoningEffort,
  type AIThinkingMode,
} from "./shared/aiDefaults";

const rootDir = dirname(fileURLToPath(import.meta.url));

type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};
type RuntimeAISettings = {
  enableAI: boolean;
  baseUrl: string;
  model: string;
  thinkingMode: AIThinkingMode;
  reasoningEffort: AIReasoningEffort;
  maxTokens: number;
  apiKey: string;
};
type MiddlewareNext = (error?: unknown) => void;
type MiddlewareContainer = ViteDevServer["middlewares"];
type DeepSeekChatResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
      reasoning_content?: unknown;
    };
  }>;
};

const runtimeAISettings: RuntimeAISettings = {
  enableAI: false,
  baseUrl: process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_DEEPSEEK_BASE_URL,
  model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_DEEPSEEK_MODEL,
  thinkingMode: DEFAULT_THINKING_MODE,
  reasoningEffort: DEFAULT_REASONING_EFFORT,
  maxTokens: DEFAULT_DEEPSEEK_MAX_TOKENS,
  apiKey: process.env.DEEPSEEK_API_KEY?.trim() || "",
};

export default defineConfig({
  plugins: [react(), deepseekProxyPlugin()],
  resolve: {
    alias: {
      "@": resolve(rootDir, "src"),
    },
  },
});

function deepseekProxyPlugin(): Plugin {
  return {
    name: "arkme-deepseek-proxy",
    configureServer(server) {
      registerDeepSeekProxy(server.middlewares);
    },
    configurePreviewServer(server) {
      registerDeepSeekProxy(server.middlewares);
    },
  };
}

function registerDeepSeekProxy(middlewares: MiddlewareContainer) {
  middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: MiddlewareNext) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!requestUrl.pathname.startsWith("/api/ai/deepseek")) {
      next();
      return;
    }

    try {
      await handleDeepSeekProxyRequest(req, res, requestUrl.pathname);
    } catch {
      sendAIError(res, 500, "unknown_error", "AI 识别暂时不可用", true);
    }
  });
}

async function handleDeepSeekProxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
) {
  if (pathname === "/api/ai/deepseek/settings" && req.method === "GET") {
    sendJSON(res, 200, { ok: true, data: toClientAISettings() });
    return;
  }

  if (pathname === "/api/ai/deepseek/settings" && req.method === "POST") {
    const body = await readJSONBody(req);
    if (!isPlainObject(body)) {
      sendAIError(res, 400, "unexpected_response", "AI 识别暂时不可用", false);
      return;
    }

    runtimeAISettings.enableAI = Boolean(body.enableAI);
    runtimeAISettings.baseUrl = normalizeBaseUrl(body.baseUrl);
    runtimeAISettings.model = normalizeModel(body.model);
    runtimeAISettings.thinkingMode = normalizeThinkingMode(body.thinkingMode);
    runtimeAISettings.reasoningEffort = normalizeReasoningEffort(body.reasoningEffort);
    runtimeAISettings.maxTokens = normalizeMaxTokens(body.maxTokens);

    if (typeof body.apiKey === "string" && body.apiKey.trim()) {
      runtimeAISettings.apiKey = body.apiKey.trim();
    }

    sendJSON(res, 200, { ok: true, data: toClientAISettings() });
    return;
  }

  if (pathname === "/api/ai/deepseek/settings" && req.method === "DELETE") {
    runtimeAISettings.enableAI = false;
    runtimeAISettings.baseUrl = DEFAULT_DEEPSEEK_BASE_URL;
    runtimeAISettings.model = DEFAULT_DEEPSEEK_MODEL;
    runtimeAISettings.thinkingMode = DEFAULT_THINKING_MODE;
    runtimeAISettings.reasoningEffort = DEFAULT_REASONING_EFFORT;
    runtimeAISettings.maxTokens = DEFAULT_DEEPSEEK_MAX_TOKENS;
    runtimeAISettings.apiKey = "";
    sendJSON(res, 200, { ok: true, data: toClientAISettings() });
    return;
  }

  if (pathname === "/api/ai/deepseek/test" && req.method === "POST") {
    const result = await callDeepSeek({
      messages: buildJSONMessages(
        [
          {
            role: "user",
            content:
              '请用 json 返回连接测试结果，格式示例：{"ok":true,"service":"deepseek"}',
          },
        ],
        { ok: true, service: "deepseek" }
      ),
      maxTokens: 256,
      thinkingMode: "disabled",
      requireAIEnabled: false,
    });

    if (result.ok === false) {
      sendJSON(res, result.status, { ok: false, error: result.error });
      return;
    }

    sendJSON(res, 200, {
      ok: true,
      data: {
        model: runtimeAISettings.model,
        baseUrl: runtimeAISettings.baseUrl,
      },
    });
    return;
  }

  if (pathname === "/api/ai/deepseek/json" && req.method === "POST") {
    const body = await readJSONBody(req);
    if (!isPlainObject(body)) {
      sendAIError(res, 400, "unexpected_response", "AI 识别暂时不可用", false);
      return;
    }

    const messages = normalizeMessages(body.messages);
    if (!messages.length) {
      sendAIError(res, 400, "unexpected_response", "AI 识别暂时不可用", false);
      return;
    }

    const result = await callDeepSeek({
      messages: buildJSONMessages(messages, body.jsonExample ?? {}),
      maxTokens: normalizeMaxTokens(body.maxTokens),
      thinkingMode: normalizeThinkingMode(body.thinkingMode),
      reasoningEffort: normalizeReasoningEffort(body.reasoningEffort),
      requireAIEnabled: true,
    });

    if (result.ok === false) {
      sendJSON(res, result.status, { ok: false, error: result.error });
      return;
    }

    sendJSON(res, 200, { ok: true, data: result.data });
    return;
  }

  sendAIError(res, 404, "proxy_unavailable", "AI 识别暂时不可用", true);
}

async function callDeepSeek({
  messages,
  maxTokens,
  thinkingMode,
  reasoningEffort = runtimeAISettings.reasoningEffort,
  requireAIEnabled,
}: {
  messages: DeepSeekMessage[];
  maxTokens: number;
  thinkingMode: AIThinkingMode;
  reasoningEffort?: AIReasoningEffort;
  requireAIEnabled: boolean;
}): Promise<
  | { ok: true; status: 200; data: unknown }
  | {
      ok: false;
      status: number;
      error: { code: string; message: string; retryable: boolean };
    }
> {
  if (requireAIEnabled && !runtimeAISettings.enableAI) {
    return {
      ok: false,
      status: 400,
      error: { code: "ai_disabled", message: "AI 识别暂时不可用", retryable: false },
    };
  }

  if (!runtimeAISettings.apiKey) {
    return {
      ok: false,
      status: 400,
      error: { code: "missing_api_key", message: "未配置 DeepSeek API Key", retryable: false },
    };
  }

  try {
    const response = await fetch(`${runtimeAISettings.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtimeAISettings.apiKey}`,
      },
      body: JSON.stringify({
        model: runtimeAISettings.model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: maxTokens,
        thinking: {
          type: thinkingMode,
        },
        ...(thinkingMode === "enabled" ? { reasoning_effort: reasoningEffort } : {}),
      }),
    });

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        status: response.status,
        error: { code: "invalid_api_key", message: "AI 识别暂时不可用", retryable: false },
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        status: 429,
        error: {
          code: "rate_limited",
          message: "这次没有成功识别，可以稍后重试或手动创建",
          retryable: true,
        },
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: {
          code: "network_error",
          message: "这次没有成功识别，可以稍后重试或手动创建",
          retryable: response.status >= 500,
        },
      };
    }

    const responseBody = (await response.json().catch(() => null)) as DeepSeekChatResponse | null;
    if (!responseBody || !Array.isArray(responseBody.choices)) {
      return {
        ok: false,
        status: 502,
        error: { code: "unexpected_response", message: "AI 识别暂时不可用", retryable: true },
      };
    }

    const content = responseBody.choices[0]?.message?.content;
    if (typeof content !== "string") {
      return {
        ok: false,
        status: 502,
        error: { code: "unexpected_response", message: "AI 识别暂时不可用", retryable: true },
      };
    }

    if (!content.trim()) {
      return {
        ok: false,
        status: 502,
        error: { code: "empty_content", message: "AI 识别暂时不可用", retryable: true },
      };
    }

    try {
      return { ok: true, status: 200, data: JSON.parse(content) };
    } catch {
      return {
        ok: false,
        status: 502,
        error: {
          code: "json_parse_error",
          message: "这次没有成功识别，可以稍后重试或手动创建",
          retryable: true,
        },
      };
    }
  } catch {
    return {
      ok: false,
      status: 503,
      error: {
        code: "network_error",
        message: "这次没有成功识别，可以稍后重试或手动创建",
        retryable: true,
      },
    };
  }
}

function buildJSONMessages(messages: DeepSeekMessage[], jsonExample: unknown): DeepSeekMessage[] {
  const exampleText = stringifyJSONExample(jsonExample);
  return [
    {
      role: "system",
      content: `你会稳定返回 json 对象，不要输出解释文字。请严格符合这个 JSON 示例：${exampleText}`,
    },
    ...messages,
  ];
}

function stringifyJSONExample(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();

  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

async function readJSONBody(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body is too large");
    }
  }

  if (!body) return {};
  return JSON.parse(body) as unknown;
}

function sendAIError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  retryable: boolean
) {
  sendJSON(res, status, {
    ok: false,
    error: {
      code,
      message,
      retryable,
    },
  });
}

function sendJSON(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function toClientAISettings() {
  return {
    enableAI: runtimeAISettings.enableAI,
    baseUrl: runtimeAISettings.baseUrl,
    model: runtimeAISettings.model,
    thinkingMode: runtimeAISettings.thinkingMode,
    reasoningEffort: runtimeAISettings.reasoningEffort,
    maxTokens: runtimeAISettings.maxTokens,
    hasApiKey: Boolean(runtimeAISettings.apiKey),
    apiKeyPreview: runtimeAISettings.apiKey ? maskApiKey(runtimeAISettings.apiKey) : "",
  };
}

function maskApiKey(apiKey: string) {
  if (apiKey.length <= 8) return "••••";
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}

function normalizeMessages(value: unknown): DeepSeekMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDeepSeekMessage);
}

function isDeepSeekMessage(value: unknown): value is DeepSeekMessage {
  if (!isPlainObject(value)) return false;
  return (
    (value.role === "system" || value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    Boolean(value.content.trim())
  );
}

function normalizeBaseUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_DEEPSEEK_BASE_URL;
  return value.trim().replace(/\/+$/, "");
}

function normalizeModel(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_DEEPSEEK_MODEL;
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
  if (!Number.isFinite(numericValue)) return DEFAULT_DEEPSEEK_MAX_TOKENS;
  return Math.min(Math.max(Math.round(numericValue), 256), 8000);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
