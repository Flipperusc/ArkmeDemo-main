import { callDeepSeekJSON } from "@/services/deepseekClient";
import {
  buildArrangementCandidatePrompt,
  emptyArrangementCandidate,
} from "@/services/arrangementAIPrompt";
import {
  ARRANGEMENT_AI_JSON_MAX_TOKENS,
  DEFAULT_THINKING_MODE,
  type AIServiceResult,
} from "@/types/ai";
import type {
  ArrangementAIAction,
  ArrangementAITimeType,
  ArrangementAIType,
  ArrangementCandidateAnalyzeOptions,
  ArrangementCandidateEntity,
  ArrangementCandidateInput,
  ArrangementCandidateResult,
} from "@/types/arrangementAI";

export type ArrangementTextAnalysis = {
  shouldCreateArrangement: boolean;
  confidence: number;
  sourceText: string;
  note: string;
};

const arrangementActions: ArrangementAIAction[] = [
  "create",
  "update",
  "merge",
  "ignore",
  "needs_confirmation",
];
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

export async function analyzeArrangementCandidate(
  input: ArrangementCandidateInput,
  options: ArrangementCandidateAnalyzeOptions = {}
): Promise<AIServiceResult<ArrangementCandidateResult>> {
  if (!input.messages.length) {
    return {
      ok: true,
      data: createArrangementCandidateFallback(input, "没有可识别的消息内容。", []),
    };
  }

  const prompt = buildArrangementCandidatePrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: ARRANGEMENT_AI_JSON_MAX_TOKENS,
    thinkingMode: DEFAULT_THINKING_MODE,
  });

  if (!response.ok) {
    return {
      ok: true,
      data: createArrangementCandidateFallback(input, response.error.message, [
        response.error.code,
      ]),
    };
  }

  return {
    ok: true,
    data: normalizeArrangementCandidateResult(response.data, input),
  };
}

export async function analyzeArrangementFromText(
  text: string
): Promise<AIServiceResult<ArrangementTextAnalysis>> {
  const result = await analyzeArrangementCandidate({
    scene: "manual_text",
    currentUserId: "current-user",
    messages: [
      {
        id: "manual-text-1",
        senderId: "current-user",
        content: text,
        createdAt: new Date().toISOString(),
      },
    ],
    timezone: getRuntimeTimezone(),
    now: new Date().toISOString(),
  });

  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      shouldCreateArrangement: result.data.hasArrangement,
      confidence: result.data.confidence,
      sourceText: text,
      note: result.data.reason,
    },
  };
}

export function normalizeArrangementCandidateResult(
  rawValue: unknown,
  input: ArrangementCandidateInput
): ArrangementCandidateResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const rawArrangement = isPlainObject(raw.arrangement) ? raw.arrangement : {};
  const rawHasArrangement = raw.hasArrangement === true;
  const action = normalizeAction(raw.action, rawHasArrangement ? "needs_confirmation" : "ignore");
  const hasArrangement = rawHasArrangement && action !== "ignore";
  const confidence = normalizeConfidence(raw.confidence, hasArrangement ? 0.5 : 0);
  const needsUserConfirmation =
    raw.needsUserConfirmation === true ||
    (hasArrangement && confidence < 0.6) ||
    action === "needs_confirmation";

  return {
    hasArrangement,
    action: hasArrangement && confidence < 0.6 ? "needs_confirmation" : action,
    confidence,
    arrangement: normalizeArrangementEntity(rawArrangement, input, hasArrangement),
    needsUserConfirmation,
    reason: normalizeString(raw.reason),
    risks: normalizeStringList(raw.risks),
  };
}

export function createArrangementCandidateFallback(
  input: ArrangementCandidateInput,
  reason: string,
  risks: string[]
): ArrangementCandidateResult {
  return {
    hasArrangement: false,
    action: "ignore",
    confidence: 0,
    arrangement: {
      ...emptyArrangementCandidate,
      sourceType: input.scene,
      sourceMessageIds: [],
    },
    needsUserConfirmation: false,
    reason: reason || "这次没有成功识别，可以稍后重试或手动创建",
    risks,
  };
}

function normalizeArrangementEntity(
  rawArrangement: Record<string, unknown>,
  input: ArrangementCandidateInput,
  hasArrangement: boolean
): ArrangementCandidateEntity {
  const sourceMessageIds = normalizeSourceMessageIds(
    rawArrangement.sourceMessageIds,
    input
  );
  const timeType = hasArrangement
    ? normalizeTimeType(rawArrangement.timeType)
    : "none";
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
    startTime: timeType === "date" || timeType === "datetime" || timeType === "range"
      ? startTime
      : null,
    endTime: timeType === "range" ? endTime : null,
    dueTime: timeType === "due" ? dueTime : null,
    location: hasArrangement ? normalizeString(rawArrangement.location) : "",
    relatedPeople: hasArrangement ? normalizeStringList(rawArrangement.relatedPeople) : [],
    executor: hasArrangement ? normalizeString(rawArrangement.executor) : "",
    beneficiary: hasArrangement ? normalizeString(rawArrangement.beneficiary) : "",
    items: hasArrangement ? normalizeStringList(rawArrangement.items) : [],
    sourceType: hasArrangement
      ? normalizeString(rawArrangement.sourceType) || input.scene
      : input.scene,
    sourceMessageIds: hasArrangement ? sourceMessageIds : [],
  };
}

function normalizeAction(value: unknown, fallback: ArrangementAIAction): ArrangementAIAction {
  return arrangementActions.includes(value as ArrangementAIAction)
    ? (value as ArrangementAIAction)
    : fallback;
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

function normalizeSourceMessageIds(value: unknown, input: ArrangementCandidateInput) {
  const allowedIds = new Set(input.messages.map((message) => message.id));
  return normalizeStringList(value).filter((id) => allowedIds.has(id));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRuntimeTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}
