import { callDeepSeekJSON } from "@/services/deepseekClient";
import {
  buildArrangementSimilarityMergePrompt,
} from "@/services/arrangementSimilarityMergePrompt";
import {
  ARRANGEMENT_SIMILAR_MERGE_JSON_MAX_TOKENS,
  DEFAULT_THINKING_MODE,
  type AIServiceResult,
  type AIThinkingMode,
} from "@/types/ai";
import type { ArrangementItem } from "@/types/arrangement";
import type {
  ArrangementAIScene,
  ArrangementCandidateResult,
  ArrangementSimilarityMergeAction,
  ArrangementSimilarityMergeInput,
  ArrangementSimilarityMergeResult,
} from "@/types/arrangementAI";

export const similarArrangementCandidateLimit = 5;
export const recentCompletedMergeWindowMs = 14 * 24 * 60 * 60 * 1000;
export const similarArrangementTimeWindowMs = 7 * 24 * 60 * 60 * 1000;

const mergeActions: ArrangementSimilarityMergeAction[] = [
  "merge_duplicate",
  "add_context",
  "update_progress",
  "update_time",
  "ignore",
];

export type SimilarArrangementCandidateFilterInput = {
  arrangements: ArrangementItem[];
  sourceType: ArrangementAIScene;
  sourceLabel?: string;
  sourceText: string;
  candidateResult?: ArrangementCandidateResult;
  now?: number;
};

export async function analyzeArrangementSimilarityMerge(
  input: ArrangementSimilarityMergeInput,
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
): Promise<AIServiceResult<ArrangementSimilarityMergeResult>> {
  if (!input.sourceText.trim() || input.candidateArrangements.length === 0) {
    return {
      ok: true,
      data: createArrangementSimilarityMergeFallback("没有可归集的候选安排。"),
    };
  }

  const prompt = buildArrangementSimilarityMergePrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: ARRANGEMENT_SIMILAR_MERGE_JSON_MAX_TOKENS,
    thinkingMode: DEFAULT_THINKING_MODE,
  });

  if (!response.ok) {
    return {
      ok: true,
      data: createArrangementSimilarityMergeFallback(response.error.message),
    };
  }

  return {
    ok: true,
    data: normalizeArrangementSimilarityMergeResult(response.data, input),
  };
}

export function selectSimilarArrangementMergeCandidates(
  input: SimilarArrangementCandidateFilterInput
) {
  const now = input.now ?? Date.now();
  const incomingText = buildIncomingComparableText(input);
  const incomingKeywords = extractKeywords(incomingText);
  const incomingPeople = extractPeople(input);
  const incomingTime = getCandidatePlannedTime(input.candidateResult);
  const incomingFuzzyTime = normalizeText(
    input.candidateResult?.arrangement.fuzzyTimeLabel
  );

  return input.arrangements
    .map((arrangement) => ({
      arrangement,
      score: scoreArrangementCandidate({
        arrangement,
        sourceType: input.sourceType,
        sourceLabel: normalizeText(input.sourceLabel),
        incomingText,
        incomingKeywords,
        incomingPeople,
        incomingTime,
        incomingFuzzyTime,
        now,
      }),
    }))
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score || b.arrangement.updatedAt - a.arrangement.updatedAt)
    .slice(0, similarArrangementCandidateLimit)
    .map((candidate) => candidate.arrangement);
}

export function normalizeArrangementSimilarityMergeResult(
  rawValue: unknown,
  input: ArrangementSimilarityMergeInput
): ArrangementSimilarityMergeResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const allowedArrangementIds = new Set(
    input.candidateArrangements.map((arrangement) => arrangement.id)
  );
  const allowedSourceIds = new Set([
    input.sourceMessageId,
    ...input.sourceMessages.map((message) => message.id),
  ]);
  const confidence = normalizeConfidence(raw.confidence, raw.shouldMerge === true ? 0.5 : 0);
  const targetArrangementId = normalizeString(raw.targetArrangementId);
  const mergeAction = normalizeMergeAction(raw.mergeAction);
  const sourceMessageIds = normalizeStringList(raw.sourceMessageIds).filter((id) =>
    allowedSourceIds.has(id)
  );
  if (sourceMessageIds.length === 0 && allowedSourceIds.has(input.sourceMessageId)) {
    sourceMessageIds.push(input.sourceMessageId);
  }
  const shouldMerge =
    raw.shouldMerge === true &&
    mergeAction !== "ignore" &&
    confidence >= 0.5 &&
    allowedArrangementIds.has(targetArrangementId) &&
    sourceMessageIds.length > 0;

  return {
    shouldMerge,
    confidence,
    targetArrangementId: shouldMerge ? targetArrangementId : "",
    mergeAction: shouldMerge ? mergeAction : "ignore",
    progressNote:
      shouldMerge && mergeAction === "update_progress"
        ? normalizeString(raw.progressNote)
        : "",
    updatedFields: shouldMerge && isPlainObject(raw.updatedFields) ? raw.updatedFields : {},
    sourceMessageIds: shouldMerge ? sourceMessageIds : [],
    reason: normalizeString(raw.reason),
    needsUserConfirmation:
      raw.needsUserConfirmation === true ||
      (shouldMerge && confidence >= 0.5 && confidence < 0.8),
  };
}

export function createArrangementSimilarityMergeFallback(
  reason: string
): ArrangementSimilarityMergeResult {
  return {
    shouldMerge: false,
    confidence: 0,
    targetArrangementId: "",
    mergeAction: "ignore",
    progressNote: "",
    updatedFields: {},
    sourceMessageIds: [],
    reason: reason || "这次没有成功判断归集关系，暂不合并。",
    needsUserConfirmation: false,
  };
}

function scoreArrangementCandidate({
  arrangement,
  sourceType,
  sourceLabel,
  incomingText,
  incomingKeywords,
  incomingPeople,
  incomingTime,
  incomingFuzzyTime,
  now,
}: {
  arrangement: ArrangementItem;
  sourceType: ArrangementAIScene;
  sourceLabel: string;
  incomingText: string;
  incomingKeywords: string[];
  incomingPeople: string[];
  incomingTime: number | null;
  incomingFuzzyTime: string;
  now: number;
}) {
  if (arrangement.status === "ignored") return 0;
  if (
    arrangement.status === "completed" &&
    now - arrangement.updatedAt > recentCompletedMergeWindowMs
  ) {
    return 0;
  }

  let score = arrangement.status === "pending" ? 1 : 0.5;
  const arrangementText = buildArrangementComparableText(arrangement);
  const arrangementKeywords = extractKeywords(arrangementText);
  const keywordOverlap = countOverlap(incomingKeywords, arrangementKeywords);
  const sharedPhrase =
    incomingText && arrangementText && containsSharedPhrase(incomingText, arrangementText);

  if (keywordOverlap >= 2) score += 3;
  else if (keywordOverlap === 1) score += 1.5;

  if (sharedPhrase) {
    score += 1.5;
  }

  const arrangementPeople = [
    ...arrangement.relatedPeople.map((person) => person.name),
    arrangement.sourceContext?.sourceLabel ?? "",
    arrangement.sourceContext?.executor ?? "",
    arrangement.sourceContext?.beneficiary ?? "",
  ].filter(Boolean);
  const peopleOverlap = countOverlap(incomingPeople, arrangementPeople.map(normalizeText));
  if (peopleOverlap > 0) score += 1.5;
  const sameSourceLabel = Boolean(
    sourceLabel &&
      arrangement.sourceContext?.sourceLabel &&
      arrangement.sourceContext.sourceLabel === sourceLabel
  );

  const arrangementTime = getArrangementPlannedTime(arrangement);
  if (
    incomingTime !== null &&
    arrangementTime !== null &&
    Math.abs(incomingTime - arrangementTime) <= similarArrangementTimeWindowMs
  ) {
    score += 2;
  }

  if (
    incomingFuzzyTime &&
    arrangement.fuzzyTimeLabel &&
    normalizeText(arrangement.fuzzyTimeLabel).includes(incomingFuzzyTime)
  ) {
    score += 1.5;
  }

  if (arrangement.sourceType === sourceType) score += 0.75;
  if (sameSourceLabel) {
    score += 1.5;
  }

  if (keywordOverlap === 0 && peopleOverlap === 0 && !sharedPhrase && !sameSourceLabel) {
    return 0;
  }

  if (sourceType === "group_chat") score -= 2;
  return score;
}

function buildIncomingComparableText(input: SimilarArrangementCandidateFilterInput) {
  const arrangement = input.candidateResult?.arrangement;
  return [
    input.sourceText,
    arrangement?.title,
    arrangement?.summary,
    arrangement?.location,
    arrangement?.items?.join(" "),
    arrangement?.relatedPeople?.join(" "),
  ]
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
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

function extractPeople(input: SimilarArrangementCandidateFilterInput) {
  return [
    input.sourceLabel,
    ...(input.candidateResult?.arrangement.relatedPeople ?? []),
    input.candidateResult?.arrangement.executor,
    input.candidateResult?.arrangement.beneficiary,
  ]
    .map(normalizeText)
    .filter(Boolean);
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
    "记得",
    "一定",
    "知道",
    "可以",
    "什么",
    "怎么",
    "情况",
    "今天",
    "明天",
    "后天",
    "天去",
    "后天去",
    "周末",
  ].includes(token);
}

function countOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return Array.from(new Set(left)).filter((item) => rightSet.has(item)).length;
}

function getCandidatePlannedTime(result: ArrangementCandidateResult | undefined) {
  if (!result?.hasArrangement) return null;
  const arrangement = result.arrangement;
  if (arrangement.dueTime) return parseTime(arrangement.dueTime);
  if (arrangement.startTime) return parseTime(arrangement.startTime);
  return null;
}

function getArrangementPlannedTime(arrangement: ArrangementItem) {
  if (arrangement.dueTime) return arrangement.dueTime;
  if (arrangement.startTime) return arrangement.startTime;
  if (arrangement.endTime) return arrangement.endTime;
  return null;
}

function parseTime(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeMergeAction(value: unknown): ArrangementSimilarityMergeAction {
  return mergeActions.includes(value as ArrangementSimilarityMergeAction)
    ? (value as ArrangementSimilarityMergeAction)
    : "ignore";
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
