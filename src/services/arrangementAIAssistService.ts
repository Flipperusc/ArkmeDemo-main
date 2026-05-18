import { callDeepSeekJSON } from "@/services/deepseekClient";
import {
  buildArrangementAIAssistGenerationPrompt,
  buildArrangementAIAssistSuggestionPrompt,
} from "@/services/arrangementAIAssistPrompt";
import {
  ARRANGEMENT_AI_ASSIST_GENERATION_JSON_MAX_TOKENS,
  ARRANGEMENT_AI_ASSIST_JSON_MAX_TOKENS,
  DEFAULT_THINKING_MODE,
  type AIServiceResult,
  type AIThinkingMode,
} from "@/types/ai";
import type {
  ArrangementAIAssistOutputType,
  ArrangementAIAssistRiskLevel,
  ArrangementAIAssistSuggestedAction,
  ArrangementExecutionType,
} from "@/types/arrangement";
import type {
  ArrangementAIAssistGenerationInput,
  ArrangementAIAssistGenerationResult,
  ArrangementAIAssistSuggestionInput,
  ArrangementAIAssistSuggestionResult,
} from "@/types/arrangementAI";

const executionTypes: ArrangementExecutionType[] = [
  "user_only",
  "ai_assist",
  "ai_executable",
];
const riskLevels: ArrangementAIAssistRiskLevel[] = ["low", "medium", "high"];
const outputTypes: ArrangementAIAssistOutputType[] = [
  "draft",
  "checklist",
  "steps",
  "reminder",
  "summary",
];
const suggestedActionLimit = 5;

export async function analyzeArrangementAIAssist(
  input: ArrangementAIAssistSuggestionInput,
  options: {
    callJSON?: <T>(request: {
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      jsonExample: unknown;
      maxTokens?: number;
      thinkingMode?: AIThinkingMode;
    }) => Promise<AIServiceResult<T>>;
  } = {}
): Promise<AIServiceResult<ArrangementAIAssistSuggestionResult>> {
  if (!input.arrangement.title.trim()) {
    return {
      ok: true,
      data: createArrangementAIAssistFallback("安排标题为空，暂不建议 AI 协助。"),
    };
  }

  const prompt = buildArrangementAIAssistSuggestionPrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: ARRANGEMENT_AI_ASSIST_JSON_MAX_TOKENS,
    thinkingMode: DEFAULT_THINKING_MODE,
  });

  if (!response.ok) {
    return {
      ok: true,
      data: createArrangementAIAssistFallback(response.error.message),
    };
  }

  return {
    ok: true,
    data: normalizeArrangementAIAssistSuggestionResult(response.data, input),
  };
}

export async function generateArrangementAIAssistContent(
  input: ArrangementAIAssistGenerationInput,
  options: {
    callJSON?: <T>(request: {
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      jsonExample: unknown;
      maxTokens?: number;
      thinkingMode?: AIThinkingMode;
    }) => Promise<AIServiceResult<T>>;
  } = {}
): Promise<AIServiceResult<ArrangementAIAssistGenerationResult>> {
  if (!input.arrangement.title.trim() || !input.action.actionId.trim()) {
    return {
      ok: false,
      error: {
        code: "unexpected_response",
        message: "缺少可生成内容的安排或动作",
        retryable: false,
      },
    };
  }

  const prompt = buildArrangementAIAssistGenerationPrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: ARRANGEMENT_AI_ASSIST_GENERATION_JSON_MAX_TOKENS,
  });

  if (!response.ok) {
    return response;
  }

  const normalized = normalizeArrangementAIAssistGenerationResult(
    response.data,
    input
  );
  if (!normalized.content.trim()) {
    return {
      ok: false,
      error: {
        code: "empty_content",
        message: "这次没有生成可保存的内容",
        retryable: true,
      },
    };
  }

  return {
    ok: true,
    data: normalized,
  };
}

export function normalizeArrangementAIAssistSuggestionResult(
  rawValue: unknown,
  input: ArrangementAIAssistSuggestionInput
): ArrangementAIAssistSuggestionResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const rawExecutionType = normalizeExecutionType(raw.executionType);
  const confidence = normalizeConfidence(raw.confidence, 0);
  const rawActions = Array.isArray(raw.suggestedActions) ? raw.suggestedActions : [];
  const actions = rawActions
    .map((action, index) => normalizeSuggestedAction(action, index, input))
    .filter((action): action is ArrangementAIAssistSuggestedAction => Boolean(action))
    .slice(0, suggestedActionLimit);
  const executionType =
    confidence < 0.45 || actions.length === 0 ? "user_only" : rawExecutionType;
  const suggestedActions =
    executionType === "ai_executable"
      ? actions.map((action) => ({ ...action, requiresUserConfirmation: true }))
      : actions;

  return {
    executionType,
    confidence,
    suggestedActions: executionType === "user_only" ? [] : suggestedActions,
    reason: normalizeString(raw.reason),
    risks: normalizeStringList(raw.risks),
  };
}

export function normalizeArrangementAIAssistGenerationResult(
  rawValue: unknown,
  input: ArrangementAIAssistGenerationInput
): ArrangementAIAssistGenerationResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const actionRequiresConfirmation = requiresUserConfirmation(
    input.action,
    input.arrangement.title,
    input.arrangement.note
  );

  return {
    title: normalizeString(raw.title) || input.action.title,
    content: normalizeString(raw.content),
    outputType: normalizeOutputType(raw.outputType, input.action.outputType),
    requiresUserConfirmation:
      raw.requiresUserConfirmation === true ||
      input.action.requiresUserConfirmation ||
      actionRequiresConfirmation,
    safetyNote: normalizeString(raw.safetyNote) || buildDefaultSafetyNote(input),
    reason: normalizeString(raw.reason),
    risks: normalizeStringList(raw.risks),
  };
}

export function createArrangementAIAssistFallback(
  reason: string
): ArrangementAIAssistSuggestionResult {
  return {
    executionType: "user_only",
    confidence: 0,
    suggestedActions: [],
    reason: reason || "这次没有成功判断 AI 协助能力，暂不展示建议动作。",
    risks: [],
  };
}

function normalizeSuggestedAction(
  value: unknown,
  index: number,
  input: ArrangementAIAssistSuggestionInput
): ArrangementAIAssistSuggestedAction | null {
  if (!value || typeof value !== "object") return null;

  const action = value as Partial<ArrangementAIAssistSuggestedAction>;
  const title = normalizeString(action.title);
  const description = normalizeString(action.description);
  if (!title && !description) return null;

  const actionId = normalizeActionId(action.actionId, title, index);
  const outputType = normalizeOutputType(action.outputType, "draft");
  const riskLevel = normalizeRiskLevel(action.riskLevel);
  const normalizedAction: ArrangementAIAssistSuggestedAction = {
    actionId,
    title: title || getDefaultActionTitle(outputType),
    description,
    riskLevel,
    requiresUserConfirmation: action.requiresUserConfirmation === true,
    outputType,
  };

  return {
    ...normalizedAction,
    requiresUserConfirmation:
      normalizedAction.requiresUserConfirmation ||
      requiresUserConfirmation(
        normalizedAction,
        input.arrangement.title,
        input.arrangement.note
      ),
  };
}

function normalizeExecutionType(value: unknown): ArrangementExecutionType {
  return executionTypes.includes(value as ArrangementExecutionType)
    ? (value as ArrangementExecutionType)
    : "user_only";
}

function normalizeRiskLevel(value: unknown): ArrangementAIAssistRiskLevel {
  return riskLevels.includes(value as ArrangementAIAssistRiskLevel)
    ? (value as ArrangementAIAssistRiskLevel)
    : "low";
}

function normalizeOutputType(
  value: unknown,
  fallback: ArrangementAIAssistOutputType
): ArrangementAIAssistOutputType {
  return outputTypes.includes(value as ArrangementAIAssistOutputType)
    ? (value as ArrangementAIAssistOutputType)
    : fallback;
}

function normalizeActionId(value: unknown, title: string, index: number) {
  const normalized = normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized) return normalized.slice(0, 64);

  const titleBased = title
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return (titleBased || `ai_action_${index + 1}`).slice(0, 64);
}

function requiresUserConfirmation(
  action: Pick<
    ArrangementAIAssistSuggestedAction,
    "actionId" | "title" | "description" | "riskLevel"
  >,
  arrangementTitle: string,
  arrangementNote: string
) {
  if (action.riskLevel === "high") return true;

  const text = normalizeString(
    `${action.actionId} ${action.title} ${action.description} ${arrangementTitle} ${arrangementNote}`
  ).toLowerCase();
  const sensitiveKeywords = [
    "send",
    "notify",
    "delete",
    "remove",
    "reschedule",
    "modify_time",
    "medical",
    "doctor",
    "hospital",
    "legal",
    "lawyer",
    "finance",
    "financial",
    "payment",
    "diagnosis",
    "发送",
    "通知",
    "删除",
    "修改时间",
    "改时间",
    "医疗",
    "医生",
    "医院",
    "检查",
    "诊断",
    "法律",
    "律师",
    "财务",
    "理财",
    "支付",
  ];

  return sensitiveKeywords.some((keyword) => text.includes(keyword));
}

function buildDefaultSafetyNote(input: ArrangementAIAssistGenerationInput) {
  const text = `${input.arrangement.title} ${input.arrangement.note}`;
  if (/医院|医生|医疗|检查|症状|doctor|hospital|medical/i.test(text)) {
    return "这只是准备材料，不构成诊断或治疗建议。";
  }
  if (/法律|律师|合同|legal|lawyer/i.test(text)) {
    return "这只是资料整理，不构成法律意见。";
  }
  if (/财务|理财|投资|报税|finance|financial|tax/i.test(text)) {
    return "这只是资料整理，不构成财务或投资建议。";
  }
  if (input.action.requiresUserConfirmation) {
    return "请确认内容无误后再使用，不会自动对外发送或执行。";
  }
  return "";
}

function getDefaultActionTitle(outputType: ArrangementAIAssistOutputType) {
  if (outputType === "checklist") return "生成准备清单";
  if (outputType === "steps") return "拆解步骤";
  if (outputType === "reminder") return "生成提醒建议";
  if (outputType === "summary") return "整理资料";
  return "生成草稿";
}

function normalizeConfidence(value: unknown, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(Math.max(value, 0), 1);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value) ? value.map(normalizeString).filter(Boolean) : [];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
