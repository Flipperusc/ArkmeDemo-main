import { callDeepSeekJSON } from "@/services/deepseekClient";
import {
  buildPrivateChatCommitmentPrompt,
} from "@/services/privateChatCommitmentPrompt";
import { emptyArrangementCandidate } from "@/services/arrangementAIPrompt";
import type { AIServiceResult } from "@/types/ai";
import type {
  ArrangementAIAction,
  ArrangementAITimeType,
  ArrangementAIType,
  ArrangementCandidateAnalyzeOptions,
  ArrangementCandidateEntity,
  ArrangementCandidateResult,
  PrivateChatCommitmentInput,
  PrivateChatCommitmentResult,
} from "@/types/arrangementAI";

const arrangementTypes: ArrangementAIType[] = [
  "todo",
  "schedule",
  "reminder",
  "commitment",
  "follow_up",
  "unknown",
];
const arrangementTimeTypes: ArrangementAITimeType[] = [
  "none",
  "fuzzy",
  "date",
  "datetime",
  "range",
  "due",
];

export async function analyzePrivateChatCommitment(
  input: PrivateChatCommitmentInput,
  options: ArrangementCandidateAnalyzeOptions = {}
): Promise<AIServiceResult<PrivateChatCommitmentResult>> {
  if (!input.messages.length) {
    return {
      ok: true,
      data: createPrivateChatCommitmentFallback(input, "没有可识别的私聊上下文。", []),
    };
  }

  const prompt = buildPrivateChatCommitmentPrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: 2000,
    thinkingMode: "disabled",
  });

  if (!response.ok) {
    return {
      ok: true,
      data: createPrivateChatCommitmentFallback(input, response.error.message, [
        response.error.code,
      ]),
    };
  }

  return {
    ok: true,
    data: normalizePrivateChatCommitmentResult(response.data, input),
  };
}

export function convertPrivateCommitmentToArrangementCandidate(
  result: PrivateChatCommitmentResult
): ArrangementCandidateResult {
  const hasArrangement =
    result.hasArrangement && result.isRelatedToCurrentUser && result.hasUserCommitted;
  const action = getCandidateAction(result, hasArrangement);

  return {
    hasArrangement,
    action,
    confidence: result.confidence,
    arrangement: {
      ...result.arrangement,
      type: result.arrangement.type === "unknown" ? "commitment" : result.arrangement.type,
      sourceType: "private_chat",
    },
    needsUserConfirmation:
      result.needsUserConfirmation || (hasArrangement && result.confidence < 0.8),
    reason: result.reason,
    risks: result.risks,
  };
}

export function normalizePrivateChatCommitmentResult(
  rawValue: unknown,
  input: PrivateChatCommitmentInput
): PrivateChatCommitmentResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const rawArrangement = isPlainObject(raw.arrangement) ? raw.arrangement : {};
  const hasArrangement = raw.hasArrangement === true;
  const isRelatedToCurrentUser = raw.isRelatedToCurrentUser === true;
  const hasUserCommitted = raw.hasUserCommitted === true;
  const confidence = normalizeConfidence(raw.confidence, hasArrangement ? 0.5 : 0);
  const shouldCreate =
    raw.shouldCreate === true &&
    hasArrangement &&
    isRelatedToCurrentUser &&
    hasUserCommitted &&
    confidence >= 0.8;
  const needsUserConfirmation =
    raw.needsUserConfirmation === true ||
    (hasArrangement &&
      isRelatedToCurrentUser &&
      hasUserCommitted &&
      confidence >= 0.5 &&
      confidence < 0.8);

  return {
    hasArrangement,
    isRelatedToCurrentUser,
    hasUserCommitted,
    shouldCreate,
    confidence,
    arrangement: normalizePrivateCommitmentEntity(rawArrangement, input, hasArrangement),
    needsUserConfirmation,
    reason: normalizeString(raw.reason),
    risks: normalizeStringList(raw.risks),
  };
}

export function createPrivateChatCommitmentFallback(
  _input: PrivateChatCommitmentInput,
  reason: string,
  risks: string[]
): PrivateChatCommitmentResult {
  return {
    hasArrangement: false,
    isRelatedToCurrentUser: false,
    hasUserCommitted: false,
    shouldCreate: false,
    confidence: 0,
    arrangement: {
      ...emptyArrangementCandidate,
      sourceType: "private_chat",
      sourceMessageIds: [],
    },
    needsUserConfirmation: false,
    reason: reason || "这次没有成功识别，可以稍后重试或手动创建",
    risks,
  };
}

function normalizePrivateCommitmentEntity(
  rawArrangement: Record<string, unknown>,
  input: PrivateChatCommitmentInput,
  hasArrangement: boolean
): ArrangementCandidateEntity {
  const timeType = hasArrangement ? normalizeTimeType(rawArrangement.timeType) : "none";
  const startTime = normalizeISOTime(rawArrangement.startTime);
  const endTime = normalizeISOTime(rawArrangement.endTime);
  const dueTime = normalizeISOTime(rawArrangement.dueTime);

  return {
    title: hasArrangement ? normalizeString(rawArrangement.title) : "",
    summary: hasArrangement ? normalizeString(rawArrangement.summary) : "",
    type: hasArrangement ? normalizeArrangementType(rawArrangement.type) : "unknown",
    status: "pending",
    timeType,
    fuzzyTimeLabel:
      hasArrangement && timeType === "fuzzy"
        ? normalizeString(rawArrangement.fuzzyTimeLabel)
        : "",
    startTime:
      timeType === "date" || timeType === "datetime" || timeType === "range"
        ? startTime
        : null,
    endTime: timeType === "range" ? endTime : null,
    dueTime: timeType === "due" ? dueTime : null,
    location: hasArrangement ? normalizeString(rawArrangement.location) : "",
    relatedPeople: hasArrangement ? normalizeStringList(rawArrangement.relatedPeople) : [],
    executor: hasArrangement ? normalizeParticipant(rawArrangement.executor) : "",
    beneficiary: hasArrangement ? normalizeParticipant(rawArrangement.beneficiary) : "",
    items: hasArrangement ? normalizeStringList(rawArrangement.items) : [],
    sourceType: "private_chat",
    sourceMessageIds: hasArrangement
      ? normalizeSourceMessageIds(rawArrangement.sourceMessageIds, input)
      : [],
  };
}

function getCandidateAction(
  result: PrivateChatCommitmentResult,
  hasArrangement: boolean
): ArrangementAIAction {
  if (!hasArrangement) return "ignore";
  if (result.shouldCreate && result.confidence >= 0.8) return "create";
  if (result.confidence >= 0.5 || result.needsUserConfirmation) return "needs_confirmation";
  return "ignore";
}

function normalizeArrangementType(value: unknown): ArrangementAIType {
  return arrangementTypes.includes(value as ArrangementAIType)
    ? (value as ArrangementAIType)
    : "unknown";
}

function normalizeTimeType(value: unknown): ArrangementAITimeType {
  return arrangementTimeTypes.includes(value as ArrangementAITimeType)
    ? (value as ArrangementAITimeType)
    : "none";
}

function normalizeParticipant(value: unknown) {
  const normalizedValue = normalizeString(value);
  if (normalizedValue === "current_user" || normalizedValue === "other_user") {
    return normalizedValue;
  }
  return normalizedValue;
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

function normalizeISOTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeSourceMessageIds(value: unknown, input: PrivateChatCommitmentInput) {
  const allowedIds = new Set(input.messages.map((message) => message.id));
  return normalizeStringList(value).filter((id) => allowedIds.has(id));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
