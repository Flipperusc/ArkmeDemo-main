import { callDeepSeekJSON } from "@/services/deepseekClient";
import {
  buildPrivateChatSupplementMergePrompt,
} from "@/services/privateChatSupplementMergePrompt";
import {
  DEFAULT_THINKING_MODE,
  PRIVATE_SUPPLEMENT_MERGE_JSON_MAX_TOKENS,
  type AIServiceResult,
  type AIThinkingMode,
} from "@/types/ai";
import type {
  PrivateChatSupplementMergeInput,
  PrivateChatSupplementMergeResult,
  PrivateChatSupplementMergeType,
} from "@/types/arrangementAI";

export const privateChatSupplementMergeWindowMs = 30 * 60 * 1000;
export const privateChatSupplementMergeContextLimit = 10;

const supplementMergeTypes: PrivateChatSupplementMergeType[] = [
  "add_items",
  "update_time",
  "update_location",
  "add_context",
  "ignore",
];

export async function analyzePrivateChatSupplementMerge(
  input: PrivateChatSupplementMergeInput,
  options: {
    callJSON?: <T>(request: {
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
      jsonExample: unknown;
      maxTokens?: number;
      thinkingMode?: AIThinkingMode;
    }) => Promise<
      | {
          ok: true;
          data: T;
        }
      | {
          ok: false;
          error: {
            code: string;
            message: string;
            retryable?: boolean;
          };
        }
    >;
  } = {}
): Promise<AIServiceResult<PrivateChatSupplementMergeResult>> {
  if (!input.messages.length || input.candidateArrangements.length === 0) {
    return {
      ok: true,
      data: createPrivateChatSupplementMergeFallback("没有可合并的私聊安排候选。"),
    };
  }

  const prompt = buildPrivateChatSupplementMergePrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: PRIVATE_SUPPLEMENT_MERGE_JSON_MAX_TOKENS,
    thinkingMode: DEFAULT_THINKING_MODE,
  });

  if (!response.ok) {
    return {
      ok: true,
      data: createPrivateChatSupplementMergeFallback(response.error.message),
    };
  }

  return {
    ok: true,
    data: normalizePrivateChatSupplementMergeResult(response.data, input),
  };
}

export function normalizePrivateChatSupplementMergeResult(
  rawValue: unknown,
  input: PrivateChatSupplementMergeInput
): PrivateChatSupplementMergeResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const allowedArrangementIds = new Set(
    input.candidateArrangements.map((arrangement) => arrangement.id)
  );
  const targetArrangementId = normalizeString(raw.targetArrangementId);
  const confidence = normalizeConfidence(raw.confidence, raw.shouldMerge === true ? 0.5 : 0);
  const mergeType = normalizeMergeType(raw.mergeType);
  const sourceMessageIds = normalizeSourceMessageIds(raw.sourceMessageIds, input);
  const shouldMerge =
    raw.shouldMerge === true &&
    mergeType !== "ignore" &&
    confidence >= 0.5 &&
    allowedArrangementIds.has(targetArrangementId) &&
    sourceMessageIds.length > 0;

  return {
    shouldMerge,
    confidence,
    targetArrangementId: shouldMerge ? targetArrangementId : "",
    mergeType: shouldMerge ? mergeType : "ignore",
    addedItems: shouldMerge ? normalizeStringList(raw.addedItems) : [],
    updatedFields: shouldMerge && isPlainObject(raw.updatedFields) ? raw.updatedFields : {},
    newTitle: shouldMerge ? normalizeString(raw.newTitle) : "",
    sourceMessageIds: shouldMerge ? sourceMessageIds : [],
    reason: normalizeString(raw.reason),
    needsUserConfirmation:
      raw.needsUserConfirmation === true ||
      (shouldMerge && confidence >= 0.5 && confidence < 0.8),
  };
}

export function createPrivateChatSupplementMergeFallback(
  reason: string
): PrivateChatSupplementMergeResult {
  return {
    shouldMerge: false,
    confidence: 0,
    targetArrangementId: "",
    mergeType: "ignore",
    addedItems: [],
    updatedFields: {},
    newTitle: "",
    sourceMessageIds: [],
    reason: reason || "这次没有成功判断补充关系，暂不合并。",
    needsUserConfirmation: false,
  };
}

function normalizeMergeType(value: unknown): PrivateChatSupplementMergeType {
  return supplementMergeTypes.includes(value as PrivateChatSupplementMergeType)
    ? (value as PrivateChatSupplementMergeType)
    : "ignore";
}

function normalizeSourceMessageIds(
  value: unknown,
  input: PrivateChatSupplementMergeInput
) {
  const allowedIds = new Set(input.messages.map((message) => message.id));
  return normalizeStringList(value).filter((id) => allowedIds.has(id));
}

function normalizeConfidence(value: unknown, fallback: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(Math.max(numericValue, 0), 1);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (isPlainObject(item) && typeof item.name === "string") return item.name.trim();
      if (isPlainObject(item) && typeof item.title === "string") return item.title.trim();
      return "";
    })
    .filter(Boolean);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
