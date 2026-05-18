import { callDeepSeekJSON } from "@/services/deepseekClient";
import {
  buildArrangementStatusChangePrompt,
} from "@/services/arrangementStatusChangePrompt";
import {
  ARRANGEMENT_STATUS_CHANGE_JSON_MAX_TOKENS,
  DEFAULT_THINKING_MODE,
  type AIServiceResult,
  type AIThinkingMode,
} from "@/types/ai";
import type {
  ArrangementItem,
  ArrangementStatus,
  ArrangementStatusChangeType,
} from "@/types/arrangement";
import type {
  ArrangementStatusChangeInput,
  ArrangementStatusChangeResult,
} from "@/types/arrangementAI";

export const arrangementStatusChangeCandidateLimit = 5;
export const statusChangeRecentWindowMs = 30 * 24 * 60 * 60 * 1000;
export const statusChangeTimeWindowMs = 14 * 24 * 60 * 60 * 1000;

const statusChangeTypes: ArrangementStatusChangeType[] = [
  "completed",
  "in_progress",
  "canceled",
  "rescheduled",
  "progress_update",
  "ignore",
];

const arrangementStatuses: ArrangementStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "later",
  "canceled",
  "ignored",
];

export type ArrangementStatusChangeCandidateFilterInput = {
  arrangements: ArrangementItem[];
  sourceType: "self_chat" | "private_chat";
  sourceLabel?: string;
  sourceText: string;
  now?: number;
};

export async function analyzeArrangementStatusChange(
  input: ArrangementStatusChangeInput,
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
): Promise<AIServiceResult<ArrangementStatusChangeResult>> {
  if (!input.sourceText.trim() || input.candidateArrangements.length === 0) {
    return {
      ok: true,
      data: createArrangementStatusChangeFallback("没有可判断状态变化的候选安排。"),
    };
  }

  const prompt = buildArrangementStatusChangePrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: ARRANGEMENT_STATUS_CHANGE_JSON_MAX_TOKENS,
    thinkingMode: DEFAULT_THINKING_MODE,
  });

  if (!response.ok) {
    return {
      ok: true,
      data: createArrangementStatusChangeFallback(response.error.message),
    };
  }

  return {
    ok: true,
    data: normalizeArrangementStatusChangeResult(response.data, input),
  };
}

export function selectArrangementStatusChangeCandidates(
  input: ArrangementStatusChangeCandidateFilterInput
) {
  const now = input.now ?? Date.now();
  const incomingText = normalizeText(input.sourceText);
  const statusSignal = getStatusSignal(incomingText);
  if (!statusSignal.hasSignal) return [];

  const incomingKeywords = extractKeywords(incomingText);
  const sourceLabel = normalizeText(input.sourceLabel);

  return input.arrangements
    .map((arrangement) => ({
      arrangement,
      score: scoreArrangementCandidate({
        arrangement,
        sourceType: input.sourceType,
        sourceLabel,
        incomingText,
        incomingKeywords,
        statusSignal,
        now,
      }),
    }))
    .filter((candidate) => candidate.score >= 2.5)
    .sort((a, b) => b.score - a.score || b.arrangement.updatedAt - a.arrangement.updatedAt)
    .slice(0, arrangementStatusChangeCandidateLimit)
    .map((candidate) => candidate.arrangement);
}

export function normalizeArrangementStatusChangeResult(
  rawValue: unknown,
  input: ArrangementStatusChangeInput
): ArrangementStatusChangeResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const allowedArrangementIds = new Set(
    input.candidateArrangements.map((arrangement) => arrangement.id)
  );
  const allowedSourceIds = new Set([
    input.sourceMessageId,
    ...input.sourceMessages.map((message) => message.id),
  ]);
  const confidence = normalizeConfidence(
    raw.confidence,
    raw.hasStatusChange === true ? 0.5 : 0
  );
  const relatedArrangementId = normalizeString(raw.relatedArrangementId);
  const statusChangeType = normalizeStatusChangeType(raw.statusChangeType);
  const sourceMessageIds = normalizeStringList(raw.sourceMessageIds).filter((id) =>
    allowedSourceIds.has(id)
  );
  if (sourceMessageIds.length === 0 && allowedSourceIds.has(input.sourceMessageId)) {
    sourceMessageIds.push(input.sourceMessageId);
  }

  const hasStatusChange =
    raw.hasStatusChange === true &&
    statusChangeType !== "ignore" &&
    confidence >= 0.5 &&
    allowedArrangementIds.has(relatedArrangementId) &&
    sourceMessageIds.length > 0;
  const newStatus = hasStatusChange
    ? normalizeNewStatus(raw.newStatus, statusChangeType)
    : "pending";

  return {
    hasStatusChange,
    relatedArrangementId: hasStatusChange ? relatedArrangementId : "",
    confidence,
    statusChangeType: hasStatusChange ? statusChangeType : "ignore",
    newStatus,
    progressNote: hasStatusChange ? normalizeString(raw.progressNote) : "",
    newTime:
      hasStatusChange && statusChangeType === "rescheduled"
        ? normalizeNullableString(raw.newTime)
        : null,
    sourceMessageIds: hasStatusChange ? sourceMessageIds : [],
    needsUserConfirmation:
      hasStatusChange &&
      (raw.needsUserConfirmation === true ||
        confidence < 0.8 ||
        statusChangeType === "rescheduled" ||
        statusChangeType === "canceled"),
    reason: normalizeString(raw.reason),
  };
}

export function createArrangementStatusChangeFallback(
  reason: string
): ArrangementStatusChangeResult {
  return {
    hasStatusChange: false,
    relatedArrangementId: "",
    confidence: 0,
    statusChangeType: "ignore",
    newStatus: "pending",
    progressNote: "",
    newTime: null,
    sourceMessageIds: [],
    needsUserConfirmation: false,
    reason: reason || "这次没有成功判断安排状态，暂不更新。",
  };
}

function scoreArrangementCandidate({
  arrangement,
  sourceType,
  sourceLabel,
  incomingText,
  incomingKeywords,
  statusSignal,
  now,
}: {
  arrangement: ArrangementItem;
  sourceType: "self_chat" | "private_chat";
  sourceLabel: string;
  incomingText: string;
  incomingKeywords: string[];
  statusSignal: ReturnType<typeof getStatusSignal>;
  now: number;
}) {
  if (
    arrangement.status !== "pending" &&
    arrangement.status !== "later" &&
    arrangement.status !== "in_progress"
  ) {
    return 0;
  }

  const plannedTime = getArrangementPlannedTime(arrangement);
  const isRecentlyUpdated = now - arrangement.updatedAt <= statusChangeRecentWindowMs;
  const isTimeNearby =
    plannedTime !== null && Math.abs(now - plannedTime) <= statusChangeTimeWindowMs;
  if (!isRecentlyUpdated && !isTimeNearby) return 0;

  let score = arrangement.status === "pending" ? 1.2 : 0.9;
  const arrangementText = buildArrangementComparableText(arrangement);
  const arrangementKeywords = extractKeywords(arrangementText);
  const keywordOverlap = countOverlap(incomingKeywords, arrangementKeywords);
  const sharedPhrase =
    incomingText && arrangementText && containsSharedPhrase(incomingText, arrangementText);

  if (keywordOverlap >= 2) score += 3;
  else if (keywordOverlap === 1) score += 1.5;
  if (sharedPhrase) score += 1.5;
  if (isTimeNearby) score += 1;
  if (isRecentlyUpdated) score += 0.75;
  if (statusSignal.isReschedule || statusSignal.isCancel) score += 1;

  const sameSourceType = arrangement.sourceType === sourceType;
  if (sameSourceType) score += 0.75;
  const sameSourceLabel = Boolean(
    sourceLabel &&
      arrangement.sourceContext?.sourceLabel &&
      arrangement.sourceContext.sourceLabel === sourceLabel
  );
  if (sameSourceLabel) score += 1.5;

  const arrangementPeople = [
    ...arrangement.relatedPeople.map((person) => person.name),
    arrangement.sourceContext?.sourceLabel ?? "",
    arrangement.sourceContext?.executor ?? "",
    arrangement.sourceContext?.beneficiary ?? "",
  ].filter(Boolean);
  const peopleOverlap = countOverlap(
    extractPeople(incomingText, sourceLabel),
    arrangementPeople.map(normalizeText)
  );
  if (peopleOverlap > 0) score += 1.25;

  if (
    keywordOverlap === 0 &&
    peopleOverlap === 0 &&
    !sharedPhrase &&
    !sameSourceLabel &&
    !statusSignal.isReschedule &&
    !statusSignal.isCancel
  ) {
    return 0;
  }

  return score;
}

function getStatusSignal(text: string) {
  const normalizedText = normalizeText(text);
  const isCompleted = /已经|已|处理好|弄好|做完|完成|搞定|发给|发送|寄出|交了|提交|体检了|去过|去了/.test(
    normalizedText
  );
  const isProgress = /挂号|预约|联系|问过|约了|排队|准备|在路上|到了|开始/.test(
    normalizedText
  );
  const isReschedule = /改到|改成|改为|延期|推迟|提前|换到|下周|明天再|后天再/.test(
    normalizedText
  );
  const isCancel = /不用了|不需要|取消|算了|没事|不用去|先不|别.*了|不用.*了/.test(
    normalizedText
  );

  return {
    hasSignal: isCompleted || isProgress || isReschedule || isCancel,
    isCompleted,
    isProgress,
    isReschedule,
    isCancel,
  };
}

function buildArrangementComparableText(arrangement: ArrangementItem) {
  return [
    arrangement.title,
    arrangement.note,
    arrangement.location,
    arrangement.fuzzyTimeLabel,
    arrangement.items.join(" "),
    arrangement.relatedPeople.map((person) => person.name).join(" "),
    arrangement.relatedContexts.map((context) => context.content).join(" "),
    arrangement.progressNotes.map((note) => note.content).join(" "),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
}

function extractPeople(text: string, sourceLabel: string) {
  const candidates = [sourceLabel];
  const personMatches = normalizeText(text).match(/[爸妈哥姐弟妹医生同事客户老板老师朋友张王李赵][\u4e00-\u9fa5]{0,2}/g);
  if (personMatches) candidates.push(...personMatches);
  return candidates.map(normalizeText).filter(Boolean);
}

function extractKeywords(value: string) {
  const normalizedValue = normalizeText(value)
    .replace(/[，。！？、,.!?;；:：()[\]【】"'“”‘’]/g, " ")
    .toLowerCase();
  const asciiWords = normalizedValue.match(/[a-z0-9]{2,}/g) ?? [];
  const cjkParts = normalizedValue.match(/[\u4e00-\u9fa5]{2,}/g) ?? [];
  const cjkTokens = cjkParts.flatMap((part) => {
    const tokens = new Set<string>();
    for (let index = 0; index < part.length - 1; index += 1) {
      tokens.add(part.slice(index, index + 2));
    }
    for (let index = 0; index < part.length - 2; index += 1) {
      tokens.add(part.slice(index, index + 3));
    }
    return Array.from(tokens);
  });

  return Array.from(new Set([...asciiWords, ...cjkTokens])).filter(
    (token) => !isWeakKeyword(token)
  );
}

function containsSharedPhrase(left: string, right: string) {
  const leftText = normalizeText(left);
  const rightText = normalizeText(right);
  if (!leftText || !rightText) return false;
  const shorter = leftText.length <= rightText.length ? leftText : rightText;
  const longer = leftText.length > rightText.length ? leftText : rightText;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;
  return extractKeywords(shorter).some((keyword) => keyword.length >= 3 && longer.includes(keyword));
}

function isWeakKeyword(token: string) {
  return [
    "这个",
    "那个",
    "一下",
    "已经",
    "今天",
    "上午",
    "下午",
    "晚上",
    "明天",
    "后天",
    "下周",
    "改到",
    "不用",
    "不用了",
    "没事",
    "可以",
    "情况",
  ].includes(token);
}

function countOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return Array.from(new Set(left)).filter((item) => rightSet.has(item)).length;
}

function getArrangementPlannedTime(arrangement: ArrangementItem) {
  if (arrangement.dueTime) return arrangement.dueTime;
  if (arrangement.startTime) return arrangement.startTime;
  if (arrangement.endTime) return arrangement.endTime;
  return null;
}

function normalizeStatusChangeType(value: unknown): ArrangementStatusChangeType {
  return statusChangeTypes.includes(value as ArrangementStatusChangeType)
    ? (value as ArrangementStatusChangeType)
    : "ignore";
}

function normalizeNewStatus(
  value: unknown,
  statusChangeType: ArrangementStatusChangeType
): ArrangementStatus {
  if (arrangementStatuses.includes(value as ArrangementStatus)) {
    return value as ArrangementStatus;
  }
  if (statusChangeType === "completed") return "completed";
  if (statusChangeType === "canceled") return "canceled";
  if (statusChangeType === "in_progress") return "in_progress";
  return "pending";
}

function normalizeConfidence(value: unknown, fallback: number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(Math.max(numericValue, 0), 1);
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeText(value: unknown) {
  return normalizeString(value);
}

function normalizeNullableString(value: unknown) {
  const text = normalizeString(value);
  return text || null;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
