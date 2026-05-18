import { callDeepSeekJSON } from "@/services/deepseekClient";
import {
  buildGroupChatRelatedArrangementPrompt,
} from "@/services/groupChatRelatedArrangementPrompt";
import { emptyArrangementCandidate } from "@/services/arrangementAIPrompt";
import {
  DEFAULT_THINKING_MODE,
  GROUP_RELATED_ARRANGEMENT_JSON_MAX_TOKENS,
  type AIServiceResult,
} from "@/types/ai";
import type {
  ArrangementAIAction,
  ArrangementAITimeType,
  ArrangementAIType,
  ArrangementCandidateAnalyzeOptions,
  ArrangementCandidateEntity,
  ArrangementCandidateResult,
  ArrangementAIMessage,
  GroupChatMentionInfo,
  GroupChatMemberSummary,
  GroupChatRelatedArrangementInput,
  GroupChatRelatedArrangementResult,
  GroupChatRelationReason,
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
const relationReasons: GroupChatRelationReason[] = [
  "mentioned",
  "committed",
  "assigned",
  "confirmed",
  "not_related",
];

export async function analyzeGroupChatRelatedArrangement(
  input: GroupChatRelatedArrangementInput,
  options: ArrangementCandidateAnalyzeOptions = {}
): Promise<AIServiceResult<GroupChatRelatedArrangementResult>> {
  if (!input.messages.length) {
    return {
      ok: true,
      data: createGroupChatRelatedArrangementFallback(
        "没有可识别的群聊上下文。",
        []
      ),
    };
  }

  const prompt = buildGroupChatRelatedArrangementPrompt(input);
  const callJSON = options.callJSON ?? callDeepSeekJSON;
  const response = await callJSON<unknown>({
    ...prompt,
    maxTokens: GROUP_RELATED_ARRANGEMENT_JSON_MAX_TOKENS,
    thinkingMode: DEFAULT_THINKING_MODE,
  });

  if (!response.ok) {
    return {
      ok: true,
      data: createGroupChatRelatedArrangementFallback(response.error.message, [
        response.error.code,
      ]),
    };
  }

  return {
    ok: true,
    data: normalizeGroupChatRelatedArrangementResult(response.data, input),
  };
}

export function convertGroupRelatedArrangementToCandidate(
  result: GroupChatRelatedArrangementResult
): ArrangementCandidateResult {
  const hasArrangement =
    result.hasArrangement &&
    result.isRelatedToCurrentUser &&
    result.relationReason !== "not_related";
  const action = getCandidateAction(result, hasArrangement);

  return {
    hasArrangement,
    action,
    confidence: result.confidence,
    arrangement: {
      ...result.arrangement,
      type: result.arrangement.type === "unknown" ? "commitment" : result.arrangement.type,
      sourceType: "group_chat",
    },
    needsUserConfirmation:
      result.needsUserConfirmation || (hasArrangement && result.confidence < 0.8),
    reason: result.reason,
    risks: result.risks,
  };
}

export function normalizeGroupChatRelatedArrangementResult(
  rawValue: unknown,
  input: GroupChatRelatedArrangementInput
): GroupChatRelatedArrangementResult {
  const raw = isPlainObject(rawValue) ? rawValue : {};
  const rawArrangement = isPlainObject(raw.arrangement) ? raw.arrangement : {};
  const hasArrangement = raw.hasArrangement === true;
  const relationReason = normalizeRelationReason(raw.relationReason);
  const isRelatedToCurrentUser =
    raw.isRelatedToCurrentUser === true && relationReason !== "not_related";
  const confidence = normalizeConfidence(raw.confidence, hasArrangement ? 0.5 : 0);
  const executor = normalizeParticipant(rawArrangement.executor);
  const shouldCreate =
    raw.shouldCreate === true &&
    hasArrangement &&
    isRelatedToCurrentUser &&
    executor === "current_user" &&
    confidence >= 0.8;
  const needsUserConfirmation =
    raw.needsUserConfirmation === true ||
    (hasArrangement &&
      isRelatedToCurrentUser &&
      confidence >= 0.5 &&
      confidence < 0.8);

  return {
    hasArrangement,
    isRelatedToCurrentUser,
    relationReason: isRelatedToCurrentUser ? relationReason : "not_related",
    hasUserCommitted: raw.hasUserCommitted === true,
    shouldCreate,
    confidence,
    arrangement: normalizeGroupArrangementEntity(
      rawArrangement,
      input,
      hasArrangement && isRelatedToCurrentUser,
      executor
    ),
    needsUserConfirmation,
    reason: normalizeString(raw.reason),
    risks: normalizeStringList(raw.risks),
  };
}

export function createGroupChatRelatedArrangementFallback(
  reason: string,
  risks: string[]
): GroupChatRelatedArrangementResult {
  return {
    hasArrangement: false,
    isRelatedToCurrentUser: false,
    relationReason: "not_related",
    hasUserCommitted: false,
    shouldCreate: false,
    confidence: 0,
    arrangement: {
      ...emptyArrangementCandidate,
      sourceType: "group_chat",
      sourceMessageIds: [],
    },
    needsUserConfirmation: false,
    reason: reason || "这次没有成功识别群聊安排，暂不创建。",
    risks,
  };
}

export function buildGroupChatMentionInfo(
  messages: ArrangementAIMessage[],
  currentUserId: string,
  currentUserAliases: string[],
  memberSummaries: GroupChatMemberSummary[] = []
): GroupChatMentionInfo[] {
  const aliases = normalizeCurrentUserAliases(currentUserAliases);

  return messages.map((message) => {
    const mentionedUserIds = memberSummaries
      .filter((member) => mentionsName(message.content, [member.name, ...(member.nicknames ?? [])]))
      .map((member) => member.id);
    const mentionedCurrentUser =
      message.senderId === currentUserId
        ? false
        : mentionsName(message.content, aliases) ||
          mentionedUserIds.includes(currentUserId);

    return {
      messageId: message.id,
      mentionedCurrentUser,
      mentionedUserIds: mentionedCurrentUser
        ? Array.from(new Set([currentUserId, ...mentionedUserIds]))
        : Array.from(new Set(mentionedUserIds)),
      rawText: message.content,
    };
  });
}

export function shouldConsiderGroupChatRelatedArrangement(input: {
  messages: ArrangementAIMessage[];
  currentMessageId: string;
  currentUserId: string;
  currentUserAliases: string[];
}) {
  const currentMessage = input.messages.find(
    (message) => message.id === input.currentMessageId
  );
  if (!currentMessage || !currentMessage.content.trim()) return false;

  const aliases = normalizeCurrentUserAliases(input.currentUserAliases);
  const text = currentMessage.content.trim();

  if (currentMessage.senderId !== input.currentUserId) {
    return mentionsName(text, aliases) && hasArrangementSignal(text);
  }

  if (!hasCurrentUserCommitmentSignal(text)) return false;

  const previousMessages = input.messages.filter(
    (message) =>
      message.id !== currentMessage.id &&
      message.senderId !== input.currentUserId &&
      new Date(message.createdAt).getTime() <=
        new Date(currentMessage.createdAt).getTime()
  );
  const previousText = previousMessages
    .slice(-8)
    .map((message) => message.content)
    .join("\n");

  return hasArrangementSignal(text) || hasOpenGroupRequestSignal(previousText);
}

function normalizeGroupArrangementEntity(
  rawArrangement: Record<string, unknown>,
  input: GroupChatRelatedArrangementInput,
  hasArrangement: boolean,
  normalizedExecutor: string
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
    executor: hasArrangement ? normalizedExecutor : "",
    beneficiary: hasArrangement ? normalizeParticipant(rawArrangement.beneficiary) : "",
    items: hasArrangement ? normalizeStringList(rawArrangement.items) : [],
    sourceType: "group_chat",
    sourceMessageIds: hasArrangement
      ? normalizeSourceMessageIds(rawArrangement.sourceMessageIds, input)
      : [],
  };
}

function getCandidateAction(
  result: GroupChatRelatedArrangementResult,
  hasArrangement: boolean
): ArrangementAIAction {
  if (!hasArrangement) return "ignore";
  if (result.shouldCreate && result.confidence >= 0.8) return "create";
  if (result.confidence >= 0.5 || result.needsUserConfirmation) return "needs_confirmation";
  return "ignore";
}

function normalizeRelationReason(value: unknown): GroupChatRelationReason {
  return relationReasons.includes(value as GroupChatRelationReason)
    ? (value as GroupChatRelationReason)
    : "not_related";
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
  if (normalizedValue === "current_user") return "current_user";
  if (normalizedValue === "other_user") return "other_user";
  return normalizedValue;
}

function normalizeSourceMessageIds(
  value: unknown,
  input: GroupChatRelatedArrangementInput
) {
  const allowedIds = new Set(input.messages.map((message) => message.id));
  return normalizeStringList(value).filter((id) => allowedIds.has(id));
}

function normalizeCurrentUserAliases(values: string[]) {
  return Array.from(
    new Set(
      values
        .map(normalizeString)
        .filter((value) => value && value !== "我" && value !== "自己")
    )
  );
}

function mentionsName(text: string, aliases: string[]) {
  const normalizedText = normalizeString(text);
  if (!normalizedText) return false;

  return aliases.some((alias) => {
    if (!alias) return false;
    return normalizedText.includes(`@${alias}`) || normalizedText.includes(alias);
  });
}

function hasCurrentUserCommitmentSignal(text: string) {
  return /我来|我处理|我负责|我带|我准备|我提交|我去|我跟|我约|我弄|我会|我可以|交给我|算我|收到|好的|好|可以|没问题|ok|OK/.test(
    text
  );
}

function hasOpenGroupRequestSignal(text: string) {
  return /谁来|哪位|谁负责|谁处理|有人|能不能|可以.*吗|麻烦|帮忙|安排|负责|处理|带|提交|准备|确认|资料|明天|后天|下周|周末/.test(
    text
  );
}

function hasArrangementSignal(text: string) {
  return /明天|后天|今天|今晚|本周|这周|下周|周末|上午|下午|晚上|资料|文件|方案|材料|会议|评审|开会|处理|负责|提交|准备|带|确认|预约|跟进|整理/.test(
    text
  );
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
