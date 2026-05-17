import type {
  ArrangementAIFeedback,
  ArrangementItem,
  ArrangementMergeHistoryItem,
  ArrangementMergeSnapshot,
  ArrangementMergeType,
  ArrangementProgressNote,
  ArrangementReminder,
  ArrangementRelatedContext,
  ArrangementRelatedPerson,
  ArrangementSourceContext,
  ArrangementSourceType,
  ArrangementStatus,
  ArrangementTimeType,
} from "@/types/arrangement";
import type { ArrangementCandidateResult } from "@/types/arrangementAI";
import type { ArrangementAIScene } from "@/types/arrangementAI";

export const arrangementsStorageKey = "arkme-demo.arrangements";
export const arrangementsStorageEvent = "arkme-demo:arrangements-updated";

export type ArrangementDraftTimeType = Exclude<ArrangementTimeType, "range">;

export type ArrangementDraft = {
  title: string;
  note: string;
  timeType: ArrangementDraftTimeType;
  fuzzyTimeLabel: string;
  dateValue: string;
  dateTimeValue: string;
  dueValue: string;
  reminderEnabled: boolean;
  reminderOffsetMinutes: number;
};

export type ArrangementAICreateSource = {
  scene?: ArrangementAIScene;
  sourceLabel?: string;
  sourceMessageId: string;
  sourceMessageIds?: string[];
  sourceText: string;
  requestMessageId?: string;
  requestMessageContent?: string;
  commitmentMessageId?: string;
  commitmentMessageContent?: string;
  executor?: string;
  beneficiary?: string;
  detectedAt: number;
  confidence: number;
  candidateId?: string;
  feedbackStatus?: ArrangementAIFeedback["status"];
  titleOverride?: string;
  noteOverride?: string;
};

export type ArrangementAIMergeSourceMessage = {
  id: string;
  role: "supplement" | "commitment" | "request" | "progress";
  senderName?: string;
  content: string;
  createdAt?: number;
};

export type ArrangementAIMergeSource = {
  targetArrangementId: string;
  mergeType: ArrangementMergeType;
  sourceMessageId: string;
  sourceMessageIds: string[];
  sourceText: string;
  sourceMessages: ArrangementAIMergeSourceMessage[];
  addedItems: string[];
  progressNote?: string;
  updatedFields: Record<string, unknown>;
  newTitle: string;
  detectedAt: number;
  confidence: number;
  reason: string;
};

const now = Date.now();

const defaultArrangements: ArrangementItem[] = [
  {
    id: "arrangement-demo-health",
    title: "周末前整理体检预约",
    note: "先确认时间和需要带的材料，不着急，一步一步来。",
    status: "pending",
    timeType: "fuzzy",
    startTime: null,
    endTime: null,
    dueTime: null,
    fuzzyTimeLabel: "这周内",
    location: "",
    items: [],
    sourceType: "manual",
    sourceMessageIds: [],
    mergedSourceIds: [],
    relatedContexts: [],
    progressNotes: [],
    mergeHistory: [],
    relatedPeople: [],
    reminder: {
      enabled: false,
      remindAt: null,
      offsetMinutes: null,
      repeatRule: null,
      createdFrom: "manual",
    },
    createdAt: now - 1000 * 60 * 60 * 8,
    updatedAt: now - 1000 * 60 * 60 * 8,
  },
  {
    id: "arrangement-demo-breakfast",
    title: "明早到公司前带早餐",
    note: "路上顺手买，不需要提前太多准备。",
    status: "pending",
    timeType: "due",
    startTime: null,
    endTime: null,
    dueTime: now + 1000 * 60 * 60 * 20,
    fuzzyTimeLabel: "",
    location: "",
    items: ["早餐"],
    sourceType: "manual",
    sourceMessageIds: [],
    mergedSourceIds: [],
    relatedContexts: [],
    progressNotes: [],
    mergeHistory: [],
    relatedPeople: [
      {
        id: "person-colleague",
        name: "同事",
        role: "mentioned",
        avatarLabel: "同",
      },
    ],
    reminder: {
      enabled: true,
      remindAt: now + 1000 * 60 * 60 * 19,
      offsetMinutes: 60,
      repeatRule: null,
      createdFrom: "manual",
    },
    createdAt: now - 1000 * 60 * 45,
    updatedAt: now - 1000 * 60 * 45,
  },
  {
    id: "arrangement-demo-reading",
    title: "把安排模块需求再过一遍",
    note: "",
    status: "later",
    timeType: "none",
    startTime: null,
    endTime: null,
    dueTime: null,
    fuzzyTimeLabel: "以后再说",
    location: "",
    items: [],
    sourceType: "manual",
    sourceMessageIds: [],
    mergedSourceIds: [],
    relatedContexts: [],
    progressNotes: [],
    mergeHistory: [],
    relatedPeople: [],
    reminder: {
      enabled: false,
      remindAt: null,
      offsetMinutes: null,
      repeatRule: null,
      createdFrom: "manual",
    },
    createdAt: now - 1000 * 60 * 60 * 24,
    updatedAt: now - 1000 * 60 * 60 * 2,
  },
];

function readJsonValue(key: string): unknown {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeJsonValue(key: string, value: unknown) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the in-memory UI usable if localStorage is unavailable.
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeStatus(value: unknown): ArrangementStatus {
  if (
    value === "pending" ||
    value === "completed" ||
    value === "later" ||
    value === "ignored"
  ) {
    return value;
  }

  return "pending";
}

function normalizeTimeType(value: unknown): ArrangementTimeType {
  if (
    value === "none" ||
    value === "fuzzy" ||
    value === "date" ||
    value === "datetime" ||
    value === "due" ||
    value === "range"
  ) {
    return value;
  }

  return "none";
}

function normalizeSourceType(value: unknown): ArrangementSourceType {
  if (
    value === "manual" ||
    value === "self" ||
    value === "self_chat" ||
    value === "private_chat" ||
    value === "group_chat" ||
    value === "ai_detected"
  ) {
    return value;
  }

  return "manual";
}

function normalizeSourceContext(value: unknown): ArrangementSourceContext | undefined {
  if (!value || typeof value !== "object") return undefined;

  const sourceContext = value as Partial<ArrangementSourceContext>;
  const sourceType =
    sourceContext.sourceType === "self_chat" ||
    sourceContext.sourceType === "manual" ||
    sourceContext.sourceType === "private_chat" ||
    sourceContext.sourceType === "group_chat"
      ? sourceContext.sourceType
      : "manual";
  const messageId = normalizeText(sourceContext.messageId);
  const messageContent = normalizeText(sourceContext.messageContent);

  if (!messageId && !messageContent) return undefined;

  return {
    sourceType,
    sourceLabel: normalizeText(sourceContext.sourceLabel),
    messageId,
    messageContent,
    ...(normalizeText(sourceContext.requestMessageId)
      ? { requestMessageId: normalizeText(sourceContext.requestMessageId) }
      : {}),
    ...(normalizeText(sourceContext.requestMessageContent)
      ? { requestMessageContent: normalizeText(sourceContext.requestMessageContent) }
      : {}),
    ...(normalizeText(sourceContext.commitmentMessageId)
      ? { commitmentMessageId: normalizeText(sourceContext.commitmentMessageId) }
      : {}),
    ...(normalizeText(sourceContext.commitmentMessageContent)
      ? { commitmentMessageContent: normalizeText(sourceContext.commitmentMessageContent) }
      : {}),
    ...(normalizeText(sourceContext.executor)
      ? { executor: normalizeText(sourceContext.executor) }
      : {}),
    ...(normalizeText(sourceContext.beneficiary)
      ? { beneficiary: normalizeText(sourceContext.beneficiary) }
      : {}),
    detectedAt: normalizeTimestamp(sourceContext.detectedAt),
    confidence:
      typeof sourceContext.confidence === "number" &&
      Number.isFinite(sourceContext.confidence)
        ? Math.min(Math.max(sourceContext.confidence, 0), 1)
        : null,
    ...(normalizeText(sourceContext.candidateId)
      ? { candidateId: normalizeText(sourceContext.candidateId) }
      : {}),
  };
}

function normalizeAIFeedback(value: unknown): ArrangementAIFeedback | undefined {
  if (!value || typeof value !== "object") return undefined;

  const feedback = value as Partial<ArrangementAIFeedback>;
  const status =
    feedback.status === "auto_created" ||
    feedback.status === "confirmed" ||
    feedback.status === "edited" ||
    feedback.status === "ignored" ||
    feedback.status === "wrong"
      ? feedback.status
      : null;

  if (!status) return undefined;

  return {
    status,
    updatedAt: normalizeTimestamp(feedback.updatedAt) ?? Date.now(),
    ...(normalizeText(feedback.note) ? { note: normalizeText(feedback.note) } : {}),
  };
}

function normalizeReminder(value: unknown): ArrangementReminder {
  if (!value || typeof value !== "object") {
    return createEmptyReminder();
  }

  const reminder = value as Partial<ArrangementReminder>;
  const offsetMinutes =
    typeof reminder.offsetMinutes === "number" && Number.isFinite(reminder.offsetMinutes)
      ? reminder.offsetMinutes
      : null;
  const remindAt = normalizeTimestamp(reminder.remindAt);
  const createdFrom =
    reminder.createdFrom === "time" || reminder.createdFrom === "ai"
      ? reminder.createdFrom
      : "manual";

  return {
    enabled: Boolean(reminder.enabled && remindAt !== null),
    remindAt,
    offsetMinutes,
    repeatRule: normalizeText(reminder.repeatRule) || null,
    createdFrom,
  };
}

function normalizeRelatedPerson(value: unknown, index: number): ArrangementRelatedPerson | null {
  if (!value || typeof value !== "object") return null;

  const person = value as Partial<ArrangementRelatedPerson>;
  const name = normalizeText(person.name);
  if (!name) return null;

  const role =
    person.role === "owner" ||
    person.role === "participant" ||
    person.role === "mentioned"
      ? person.role
      : undefined;

  return {
    id: normalizeText(person.id) || `person-${index}`,
    name,
    ...(role ? { role } : {}),
    ...(normalizeText(person.avatarLabel)
      ? { avatarLabel: normalizeText(person.avatarLabel).slice(0, 2) }
      : {}),
  };
}

function normalizeRelatedContext(
  value: unknown,
  index: number
): ArrangementRelatedContext | null {
  if (!value || typeof value !== "object") return null;

  const context = value as Partial<ArrangementRelatedContext>;
  const messageId = normalizeText(context.messageId);
  const content = normalizeText(context.content);
  if (!messageId || !content) return null;

  const role =
    context.role === "request" ||
    context.role === "commitment" ||
    context.role === "supplement" ||
    context.role === "progress"
      ? context.role
      : "supplement";

  return {
    id: normalizeText(context.id) || `context-${index}`,
    messageId,
    role,
    ...(normalizeText(context.senderName)
      ? { senderName: normalizeText(context.senderName) }
      : {}),
    content,
    createdAt: normalizeTimestamp(context.createdAt),
    addedAt: normalizeTimestamp(context.addedAt) ?? Date.now() + index,
  };
}

function normalizeProgressNote(
  value: unknown,
  index: number
): ArrangementProgressNote | null {
  if (!value || typeof value !== "object") return null;

  const note = value as Partial<ArrangementProgressNote>;
  const content = normalizeText(note.content);
  if (!content) return null;
  const createdAt = normalizeTimestamp(note.createdAt) ?? Date.now() + index;

  return {
    id: normalizeText(note.id) || `progress-note-${createdAt}-${index}`,
    content,
    sourceMessageIds: Array.isArray(note.sourceMessageIds)
      ? note.sourceMessageIds.map(normalizeText).filter(Boolean)
      : [],
    createdAt,
    confidence:
      typeof note.confidence === "number" && Number.isFinite(note.confidence)
        ? Math.min(Math.max(note.confidence, 0), 1)
        : 0,
    reason: normalizeText(note.reason),
  };
}

function normalizeMergeHistoryItem(
  value: unknown,
  index: number
): ArrangementMergeHistoryItem | null {
  if (!value || typeof value !== "object") return null;

  const history = value as Partial<ArrangementMergeHistoryItem>;
  const mergedAt = normalizeTimestamp(history.mergedAt);
  const previousSnapshot = normalizeMergeSnapshot(history.previousSnapshot);
  if (!mergedAt || !previousSnapshot) return null;

  return {
    id: normalizeText(history.id) || `merge-history-${mergedAt}-${index}`,
    mergeType: normalizeMergeType(history.mergeType),
    mergedAt,
    confidence:
      typeof history.confidence === "number" && Number.isFinite(history.confidence)
        ? Math.min(Math.max(history.confidence, 0), 1)
        : 0,
    sourceMessageIds: Array.isArray(history.sourceMessageIds)
      ? history.sourceMessageIds.map(normalizeText).filter(Boolean)
      : [],
    addedItems: Array.isArray(history.addedItems)
      ? history.addedItems.map(normalizeText).filter(Boolean)
      : [],
    progressNote: normalizeText(history.progressNote),
    previousSnapshot,
    newTitle: normalizeText(history.newTitle),
    reason: normalizeText(history.reason),
  };
}

function normalizeMergeSnapshot(value: unknown): ArrangementMergeSnapshot | null {
  if (!value || typeof value !== "object") return null;

  const snapshot = value as Partial<ArrangementMergeSnapshot>;
  return {
    title: normalizeText(snapshot.title),
    note: normalizeText(snapshot.note),
    timeType: normalizeTimeType(snapshot.timeType),
    startTime: normalizeTimestamp(snapshot.startTime),
    endTime: normalizeTimestamp(snapshot.endTime),
    dueTime: normalizeTimestamp(snapshot.dueTime),
    fuzzyTimeLabel: normalizeText(snapshot.fuzzyTimeLabel),
    location: normalizeText(snapshot.location),
    items: Array.isArray(snapshot.items)
      ? snapshot.items.map(normalizeText).filter(Boolean)
      : [],
    sourceMessageIds: Array.isArray(snapshot.sourceMessageIds)
      ? snapshot.sourceMessageIds.map(normalizeText).filter(Boolean)
      : [],
    mergedSourceIds: Array.isArray(snapshot.mergedSourceIds)
      ? snapshot.mergedSourceIds.map(normalizeText).filter(Boolean)
      : [],
    relatedContexts: Array.isArray(snapshot.relatedContexts)
      ? snapshot.relatedContexts
          .map(normalizeRelatedContext)
          .filter((context): context is ArrangementRelatedContext => Boolean(context))
      : [],
    progressNotes: Array.isArray(snapshot.progressNotes)
      ? snapshot.progressNotes
          .map(normalizeProgressNote)
          .filter((note): note is ArrangementProgressNote => Boolean(note))
      : [],
  };
}

function normalizeMergeType(value: unknown): ArrangementMergeType {
  if (
    value === "add_items" ||
    value === "update_time" ||
    value === "update_location" ||
    value === "add_context" ||
    value === "merge_duplicate" ||
    value === "update_progress" ||
    value === "remove_context" ||
    value === "ignore"
  ) {
    return value;
  }

  return "add_context";
}

function normalizeArrangement(value: unknown, index: number): ArrangementItem | null {
  if (!value || typeof value !== "object") return null;

  const arrangement = value as Partial<ArrangementItem>;
  const title = normalizeText(arrangement.title);
  if (!title) return null;

  const timestamp = Date.now() + index;
  const sourceMessageIds = Array.isArray(arrangement.sourceMessageIds)
    ? arrangement.sourceMessageIds.map(normalizeText).filter(Boolean)
    : [];
  const mergedSourceIds = Array.isArray(arrangement.mergedSourceIds)
    ? arrangement.mergedSourceIds.map(normalizeText).filter(Boolean)
    : [];
  const relatedPeople = Array.isArray(arrangement.relatedPeople)
    ? arrangement.relatedPeople
        .map(normalizeRelatedPerson)
        .filter((person): person is ArrangementRelatedPerson => Boolean(person))
    : [];
  const relatedContexts = Array.isArray(arrangement.relatedContexts)
    ? arrangement.relatedContexts
        .map(normalizeRelatedContext)
        .filter((context): context is ArrangementRelatedContext => Boolean(context))
    : [];
  const progressNotes = Array.isArray(arrangement.progressNotes)
    ? arrangement.progressNotes
        .map(normalizeProgressNote)
        .filter((note): note is ArrangementProgressNote => Boolean(note))
    : [];
  const mergeHistory = Array.isArray(arrangement.mergeHistory)
    ? arrangement.mergeHistory
        .map(normalizeMergeHistoryItem)
        .filter((history): history is ArrangementMergeHistoryItem => Boolean(history))
    : [];

  return {
    id: normalizeText(arrangement.id) || `arrangement-${timestamp}`,
    title,
    note: normalizeText(arrangement.note),
    status: normalizeStatus(arrangement.status),
    timeType: normalizeTimeType(arrangement.timeType),
    startTime: normalizeTimestamp(arrangement.startTime),
    endTime: normalizeTimestamp(arrangement.endTime),
    dueTime: normalizeTimestamp(arrangement.dueTime),
    fuzzyTimeLabel: normalizeText(arrangement.fuzzyTimeLabel),
    location: normalizeText(arrangement.location),
    items: Array.isArray(arrangement.items)
      ? arrangement.items.map(normalizeText).filter(Boolean)
      : [],
    sourceType: normalizeSourceType(arrangement.sourceType),
    sourceMessageIds,
    mergedSourceIds,
    ...(normalizeSourceContext(arrangement.sourceContext)
      ? { sourceContext: normalizeSourceContext(arrangement.sourceContext) }
      : {}),
    relatedContexts,
    progressNotes,
    mergeHistory,
    relatedPeople,
    reminder: normalizeReminder(arrangement.reminder),
    ...(normalizeAIFeedback(arrangement.aiFeedback)
      ? { aiFeedback: normalizeAIFeedback(arrangement.aiFeedback) }
      : {}),
    createdAt: normalizeTimestamp(arrangement.createdAt) ?? timestamp,
    updatedAt: normalizeTimestamp(arrangement.updatedAt) ?? timestamp,
  };
}

export function getInitialArrangements() {
  const parsedValue = readJsonValue(arrangementsStorageKey);
  if (parsedValue === null) return defaultArrangements;
  if (!Array.isArray(parsedValue)) return defaultArrangements;

  return parsedValue
    .map(normalizeArrangement)
    .filter((arrangement): arrangement is ArrangementItem => Boolean(arrangement));
}

export function persistArrangements(arrangements: ArrangementItem[]) {
  writeJsonValue(arrangementsStorageKey, arrangements);
  notifyArrangementChange();
}

export function createArrangement(draft: ArrangementDraft): ArrangementItem | null {
  const title = normalizeText(draft.title);
  if (!title) return null;

  const timestamp = Date.now();
  const timeFields = buildArrangementTimeFields(draft);
  const reminder = buildArrangementReminder(draft, timeFields);
  const arrangement: ArrangementItem = {
    id: `arrangement-${timestamp}`,
    title,
    note: normalizeText(draft.note),
    status: "pending",
    ...timeFields,
    location: "",
    items: [],
    sourceType: "manual",
    sourceMessageIds: [],
    mergedSourceIds: [],
    relatedContexts: [],
    progressNotes: [],
    mergeHistory: [],
    relatedPeople: [],
    reminder,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  persistArrangements([arrangement, ...getInitialArrangements()]);
  return arrangement;
}

export function createArrangementFromAICandidate(
  result: ArrangementCandidateResult,
  source: ArrangementAICreateSource
): ArrangementItem | null {
  if (!result.hasArrangement) return null;

  const title =
    normalizeText(source.titleOverride) ||
    normalizeText(result.arrangement.title) ||
    normalizeText(result.arrangement.summary);
  if (!title) return null;

  const sourceMessageIds = uniqueTextValues([
    source.sourceMessageId,
    ...(source.sourceMessageIds ?? []),
  ]);

  if (sourceMessageIds.some((sourceMessageId) => hasArrangementForSourceMessage(sourceMessageId))) {
    return null;
  }

  const timestamp = Date.now();
  const sourceScene = normalizeAISourceScene(source.scene);
  const timeFields = buildArrangementTimeFieldsFromAI(result);
  const reminder = buildArrangementReminderFromAI(result, timeFields);
  const arrangement: ArrangementItem = {
    id: `arrangement-ai-${timestamp}`,
    title,
    note:
      normalizeText(source.noteOverride) ||
      normalizeText(result.arrangement.summary) ||
      normalizeText(result.reason),
    status: "pending",
    ...timeFields,
    location: normalizeText(result.arrangement.location),
    items: uniqueTextValues(result.arrangement.items),
    sourceType: sourceScene,
    sourceMessageIds,
    mergedSourceIds: [],
    sourceContext: {
      sourceType: sourceScene,
      sourceLabel: normalizeText(source.sourceLabel) || getDefaultAISourceLabel(sourceScene),
      messageId: source.sourceMessageId,
      messageContent: source.sourceText,
      ...(normalizeText(source.requestMessageId)
        ? { requestMessageId: normalizeText(source.requestMessageId) }
        : {}),
      ...(normalizeText(source.requestMessageContent)
        ? { requestMessageContent: normalizeText(source.requestMessageContent) }
        : {}),
      ...(normalizeText(source.commitmentMessageId)
        ? { commitmentMessageId: normalizeText(source.commitmentMessageId) }
        : {}),
      ...(normalizeText(source.commitmentMessageContent)
        ? { commitmentMessageContent: normalizeText(source.commitmentMessageContent) }
        : {}),
      ...(normalizeText(source.executor) ? { executor: normalizeText(source.executor) } : {}),
      ...(normalizeText(source.beneficiary)
        ? { beneficiary: normalizeText(source.beneficiary) }
        : {}),
      detectedAt: source.detectedAt,
      confidence: source.confidence,
      ...(source.candidateId ? { candidateId: source.candidateId } : {}),
    },
    relatedContexts: buildInitialRelatedContexts(source, timestamp),
    progressNotes: [],
    mergeHistory: [],
    relatedPeople: result.arrangement.relatedPeople.map((name, index) => ({
      id: `ai-person-${timestamp}-${index}`,
      name,
      role: "mentioned",
      avatarLabel: name.slice(0, 2),
    })),
    reminder,
    aiFeedback: {
      status: source.feedbackStatus ?? "auto_created",
      updatedAt: timestamp,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  persistArrangements([arrangement, ...getInitialArrangements()]);
  return arrangement;
}

export function updateArrangement(
  arrangementId: string,
  draft: ArrangementDraft
): ArrangementItem | null {
  const title = normalizeText(draft.title);
  if (!title) return null;

  const arrangements = getInitialArrangements();
  const timeFields = buildArrangementTimeFields(draft);
  const reminder = buildArrangementReminder(draft, timeFields);
  let updatedArrangement: ArrangementItem | null = null;

  const updatedArrangements = arrangements.map((arrangement) => {
    if (arrangement.id !== arrangementId) return arrangement;

    const nextArrangement: ArrangementItem = {
      ...arrangement,
      title,
      note: normalizeText(draft.note),
      ...timeFields,
      reminder,
      updatedAt: Date.now(),
    };

    updatedArrangement = nextArrangement;
    return nextArrangement;
  });

  if (!updatedArrangement) return null;
  persistArrangements(updatedArrangements);
  return updatedArrangement;
}

export function updateArrangementStatus(
  arrangementId: string,
  status: ArrangementStatus
): ArrangementItem | null {
  const arrangements = getInitialArrangements();
  let updatedArrangement: ArrangementItem | null = null;

  const updatedArrangements = arrangements.map((arrangement) => {
    if (arrangement.id !== arrangementId) return arrangement;

    const nextArrangement: ArrangementItem = {
      ...arrangement,
      status,
      updatedAt: Date.now(),
    };

    updatedArrangement = nextArrangement;
    return nextArrangement;
  });

  if (!updatedArrangement) return null;
  persistArrangements(updatedArrangements);
  return updatedArrangement;
}

export function ignoreArrangement(arrangementId: string) {
  const arrangements = getInitialArrangements();
  const arrangement = arrangements.find((item) => item.id === arrangementId);
  if (arrangement?.sourceContext && arrangement.sourceContext.sourceType !== "manual") {
    return updateArrangementAIFeedback(arrangementId, "ignored", "ignored");
  }

  return updateArrangementStatus(arrangementId, "ignored");
}

export function markArrangementAIWrong(arrangementId: string) {
  return updateArrangementAIFeedback(arrangementId, "wrong", "ignored");
}

export function continueArrangement(arrangementId: string, fuzzyTimeLabel: string) {
  const arrangements = getInitialArrangements();
  let updatedArrangement: ArrangementItem | null = null;

  const updatedArrangements = arrangements.map((arrangement) => {
    if (arrangement.id !== arrangementId) return arrangement;

    const nextArrangement: ArrangementItem = {
      ...arrangement,
      status: "pending",
      timeType: "fuzzy",
      startTime: null,
      endTime: null,
      dueTime: null,
      fuzzyTimeLabel: normalizeText(fuzzyTimeLabel) || "近期",
      updatedAt: Date.now(),
    };

    updatedArrangement = nextArrangement;
    return nextArrangement;
  });

  if (!updatedArrangement) return null;
  persistArrangements(updatedArrangements);
  return updatedArrangement;
}

export function mergeArrangementSupplement(
  source: ArrangementAIMergeSource
): ArrangementItem | null {
  if (source.mergeType === "ignore") return null;

  const arrangements = getInitialArrangements();
  let updatedArrangement: ArrangementItem | null = null;
  const timestamp = Date.now();

  const updatedArrangements = arrangements.map((arrangement) => {
    if (arrangement.id !== source.targetArrangementId) return arrangement;
    if (arrangement.status === "ignored") return arrangement;

    const normalizedSourceMessageIds = uniqueTextValues([
      source.sourceMessageId,
      ...source.sourceMessageIds,
    ]);
    if (
      normalizedSourceMessageIds.length === 0 ||
      normalizedSourceMessageIds.every((messageId) =>
        arrangement.sourceMessageIds.includes(messageId) ||
        arrangement.mergedSourceIds.includes(messageId)
      )
    ) {
      return arrangement;
    }

    const previousSnapshot = createMergeSnapshot(arrangement);
    const nextItems = uniqueTextValues([...arrangement.items, ...source.addedItems]);
    const nextRelatedContexts = mergeRelatedContexts(
      arrangement.relatedContexts,
      source.sourceMessages,
      timestamp
    );
    const nextProgressNotes = mergeProgressNotes(
      arrangement.progressNotes,
      {
        content: normalizeText(source.progressNote),
        sourceMessageIds: normalizedSourceMessageIds,
        confidence: source.confidence,
        reason: source.reason,
      },
      timestamp
    );
    const updatedTimeFields = buildTimeFieldsFromMerge(source.updatedFields, arrangement);
    const nextLocation =
      normalizeText(source.updatedFields.location) || arrangement.location;
    const nextTitle =
      normalizeText(source.newTitle) ||
      buildTitleWithAddedItems(arrangement.title, source.addedItems);
    const historyItem: ArrangementMergeHistoryItem = {
      id: `arrangement-merge-${timestamp}`,
      mergeType: source.mergeType,
      mergedAt: timestamp,
      confidence: source.confidence,
      sourceMessageIds: normalizedSourceMessageIds,
      addedItems: uniqueTextValues(source.addedItems),
      progressNote: normalizeText(source.progressNote),
      previousSnapshot,
      newTitle: nextTitle,
      reason: normalizeText(source.reason),
    };

    const nextArrangement: ArrangementItem = {
      ...arrangement,
      title: nextTitle,
      ...updatedTimeFields,
      location: nextLocation,
      items: nextItems,
      sourceMessageIds: uniqueTextValues([
        ...arrangement.sourceMessageIds,
        ...normalizedSourceMessageIds,
      ]),
      mergedSourceIds: uniqueTextValues([
        ...arrangement.mergedSourceIds,
        ...normalizedSourceMessageIds,
      ]),
      sourceContext: arrangement.sourceContext
        ? {
            ...arrangement.sourceContext,
            messageContent: appendSourceText(
              arrangement.sourceContext.messageContent,
              source.sourceText
            ),
            confidence: Math.max(
              arrangement.sourceContext.confidence ?? 0,
              source.confidence
            ),
          }
        : arrangement.sourceContext,
      relatedContexts: nextRelatedContexts,
      progressNotes: nextProgressNotes,
      mergeHistory: [...arrangement.mergeHistory, historyItem],
      updatedAt: timestamp,
    };

    updatedArrangement = nextArrangement;
    return nextArrangement;
  });

  if (!updatedArrangement) return null;
  persistArrangements(updatedArrangements);
  return updatedArrangement;
}

export function undoLastArrangementMerge(arrangementId: string): ArrangementItem | null {
  const arrangements = getInitialArrangements();
  let updatedArrangement: ArrangementItem | null = null;

  const updatedArrangements = arrangements.map((arrangement) => {
    if (arrangement.id !== arrangementId || arrangement.mergeHistory.length === 0) {
      return arrangement;
    }

    const previousMergeHistory = arrangement.mergeHistory.slice(0, -1);
    const snapshot = arrangement.mergeHistory.at(-1)?.previousSnapshot;
    if (!snapshot) return arrangement;

    const nextArrangement: ArrangementItem = {
      ...arrangement,
      title: snapshot.title,
      note: snapshot.note,
      timeType: snapshot.timeType,
      startTime: snapshot.startTime,
      endTime: snapshot.endTime,
      dueTime: snapshot.dueTime,
      fuzzyTimeLabel: snapshot.fuzzyTimeLabel,
      location: snapshot.location,
      items: snapshot.items,
      sourceMessageIds: snapshot.sourceMessageIds,
      mergedSourceIds: snapshot.mergedSourceIds,
      relatedContexts: snapshot.relatedContexts,
      progressNotes: snapshot.progressNotes,
      mergeHistory: previousMergeHistory,
      updatedAt: Date.now(),
    };

    updatedArrangement = nextArrangement;
    return nextArrangement;
  });

  if (!updatedArrangement) return null;
  persistArrangements(updatedArrangements);
  return updatedArrangement;
}

export function removeArrangementRelatedContext(
  arrangementId: string,
  contextId: string,
  reason = "移除相关上下文"
): ArrangementItem | null {
  const arrangements = getInitialArrangements();
  let updatedArrangement: ArrangementItem | null = null;

  const updatedArrangements = arrangements.map((arrangement) => {
    if (arrangement.id !== arrangementId) return arrangement;

    const context = arrangement.relatedContexts.find((item) => item.id === contextId);
    if (!context) return arrangement;

    const timestamp = Date.now();
    const previousSnapshot = createMergeSnapshot(arrangement);
    const nextSourceMessageIds = arrangement.sourceMessageIds.filter(
      (messageId) => messageId !== context.messageId
    );
    const nextMergedSourceIds = arrangement.mergedSourceIds.filter(
      (messageId) => messageId !== context.messageId
    );
    const nextProgressNotes = arrangement.progressNotes.filter(
      (note) => !note.sourceMessageIds.includes(context.messageId)
    );
    const historyItem: ArrangementMergeHistoryItem = {
      id: `arrangement-merge-${timestamp}`,
      mergeType: "remove_context",
      mergedAt: timestamp,
      confidence: 1,
      sourceMessageIds: [context.messageId],
      addedItems: [],
      progressNote: context.role === "progress" ? context.content : "",
      previousSnapshot,
      newTitle: arrangement.title,
      reason: normalizeText(reason),
    };

    const nextArrangement: ArrangementItem = {
      ...arrangement,
      sourceMessageIds: nextSourceMessageIds,
      mergedSourceIds: nextMergedSourceIds,
      relatedContexts: arrangement.relatedContexts.filter((item) => item.id !== contextId),
      progressNotes: nextProgressNotes,
      mergeHistory: [...arrangement.mergeHistory, historyItem],
      updatedAt: timestamp,
    };

    updatedArrangement = nextArrangement;
    return nextArrangement;
  });

  if (!updatedArrangement) return null;
  persistArrangements(updatedArrangements);
  return updatedArrangement;
}

export function markArrangementContextNotSame(
  arrangementId: string,
  contextId: string
): ArrangementItem | null {
  return removeArrangementRelatedContext(arrangementId, contextId, "不是同一件事");
}

function buildArrangementTimeFields(draft: ArrangementDraft): Pick<
  ArrangementItem,
  "timeType" | "startTime" | "endTime" | "dueTime" | "fuzzyTimeLabel"
> {
  if (draft.timeType === "fuzzy") {
    return {
      timeType: "fuzzy",
      startTime: null,
      endTime: null,
      dueTime: null,
      fuzzyTimeLabel: normalizeText(draft.fuzzyTimeLabel) || "近期",
    };
  }

  if (draft.timeType === "date") {
    const startTime = parseDateInput(draft.dateValue, "start");
    const endTime = parseDateInput(draft.dateValue, "end");

    if (startTime !== null && endTime !== null) {
      return {
        timeType: "date",
        startTime,
        endTime,
        dueTime: null,
        fuzzyTimeLabel: "",
      };
    }
  }

  if (draft.timeType === "datetime") {
    const startTime = parseDateTimeInput(draft.dateTimeValue);

    if (startTime !== null) {
      return {
        timeType: "datetime",
        startTime,
        endTime: null,
        dueTime: null,
        fuzzyTimeLabel: "",
      };
    }
  }

  if (draft.timeType === "due") {
    const dueTime = parseDateTimeInput(draft.dueValue);

    if (dueTime !== null) {
      return {
        timeType: "due",
        startTime: null,
        endTime: null,
        dueTime,
        fuzzyTimeLabel: "",
      };
    }
  }

  return {
    timeType: "none",
    startTime: null,
    endTime: null,
    dueTime: null,
    fuzzyTimeLabel: "",
  };
}

function buildArrangementTimeFieldsFromAI(result: ArrangementCandidateResult): Pick<
  ArrangementItem,
  "timeType" | "startTime" | "endTime" | "dueTime" | "fuzzyTimeLabel"
> {
  const arrangement = result.arrangement;

  if (arrangement.timeType === "fuzzy") {
    return {
      timeType: "fuzzy",
      startTime: null,
      endTime: null,
      dueTime: null,
      fuzzyTimeLabel: normalizeText(arrangement.fuzzyTimeLabel) || "近期",
    };
  }

  if (arrangement.timeType === "date") {
    const startTime = parseAITime(arrangement.startTime);
    if (startTime !== null) {
      return {
        timeType: "date",
        startTime,
        endTime: parseAITime(arrangement.endTime) ?? startTime + 24 * 60 * 60 * 1000 - 1,
        dueTime: null,
        fuzzyTimeLabel: "",
      };
    }
  }

  if (arrangement.timeType === "datetime") {
    const startTime = parseAITime(arrangement.startTime);
    if (startTime !== null) {
      return {
        timeType: "datetime",
        startTime,
        endTime: null,
        dueTime: null,
        fuzzyTimeLabel: "",
      };
    }
  }

  if (arrangement.timeType === "range") {
    const startTime = parseAITime(arrangement.startTime);
    const endTime = parseAITime(arrangement.endTime);
    if (startTime !== null) {
      return {
        timeType: "range",
        startTime,
        endTime,
        dueTime: null,
        fuzzyTimeLabel: "",
      };
    }
  }

  if (arrangement.timeType === "due") {
    const dueTime = parseAITime(arrangement.dueTime);
    if (dueTime !== null) {
      return {
        timeType: "due",
        startTime: null,
        endTime: null,
        dueTime,
        fuzzyTimeLabel: "",
      };
    }
  }

  return {
    timeType: "none",
    startTime: null,
    endTime: null,
    dueTime: null,
    fuzzyTimeLabel: "",
  };
}

function buildArrangementReminderFromAI(
  result: ArrangementCandidateResult,
  timeFields: Pick<
    ArrangementItem,
    "timeType" | "startTime" | "endTime" | "dueTime" | "fuzzyTimeLabel"
  >
): ArrangementReminder {
  const plannedTime = getReminderBaseTime(timeFields);
  if (result.arrangement.type !== "reminder" || plannedTime === null) {
    return createEmptyReminder("ai");
  }

  return {
    enabled: true,
    remindAt: plannedTime,
    offsetMinutes: 0,
    repeatRule: null,
    createdFrom: "ai",
  };
}

function buildArrangementReminder(
  draft: ArrangementDraft,
  timeFields: Pick<
    ArrangementItem,
    "timeType" | "startTime" | "endTime" | "dueTime" | "fuzzyTimeLabel"
  >
): ArrangementReminder {
  const plannedTime = getReminderBaseTime(timeFields);
  const offsetMinutes = Number.isFinite(draft.reminderOffsetMinutes)
    ? Math.max(0, draft.reminderOffsetMinutes)
    : 0;

  if (!draft.reminderEnabled || plannedTime === null) {
    return createEmptyReminder();
  }

  return {
    enabled: true,
    remindAt: plannedTime - offsetMinutes * 60 * 1000,
    offsetMinutes,
    repeatRule: null,
    createdFrom: "manual",
  };
}

function getReminderBaseTime(
  timeFields: Pick<
    ArrangementItem,
    "timeType" | "startTime" | "endTime" | "dueTime" | "fuzzyTimeLabel"
  >
) {
  if (timeFields.timeType === "due") return timeFields.dueTime;
  if (timeFields.timeType === "date") return timeFields.startTime;
  if (timeFields.timeType === "datetime") return timeFields.startTime;
  if (timeFields.timeType === "range") return timeFields.startTime;
  return null;
}

function buildInitialRelatedContexts(
  source: ArrangementAICreateSource,
  timestamp: number
): ArrangementRelatedContext[] {
  const contexts: ArrangementRelatedContext[] = [];

  if (source.requestMessageId && source.requestMessageContent) {
    contexts.push({
      id: `context-${source.requestMessageId}`,
      messageId: source.requestMessageId,
      role: "request",
      content: source.requestMessageContent,
      createdAt: null,
      addedAt: timestamp,
    });
  }

  if (source.commitmentMessageId && source.commitmentMessageContent) {
    contexts.push({
      id: `context-${source.commitmentMessageId}`,
      messageId: source.commitmentMessageId,
      role: "commitment",
      content: source.commitmentMessageContent,
      createdAt: null,
      addedAt: timestamp,
    });
  }

  return contexts;
}

function createMergeSnapshot(arrangement: ArrangementItem): ArrangementMergeSnapshot {
  return {
    title: arrangement.title,
    note: arrangement.note,
    timeType: arrangement.timeType,
    startTime: arrangement.startTime,
    endTime: arrangement.endTime,
    dueTime: arrangement.dueTime,
    fuzzyTimeLabel: arrangement.fuzzyTimeLabel,
    location: arrangement.location,
    items: [...arrangement.items],
    sourceMessageIds: [...arrangement.sourceMessageIds],
    mergedSourceIds: [...arrangement.mergedSourceIds],
    relatedContexts: arrangement.relatedContexts.map((context) => ({ ...context })),
    progressNotes: arrangement.progressNotes.map((note) => ({ ...note })),
  };
}

function mergeRelatedContexts(
  existingContexts: ArrangementRelatedContext[],
  sourceMessages: ArrangementAIMergeSourceMessage[],
  timestamp: number
) {
  const existingMessageIds = new Set(
    existingContexts.map((context) => context.messageId)
  );
  const nextContexts = [...existingContexts];

  sourceMessages.forEach((message) => {
    if (!message.id || existingMessageIds.has(message.id)) return;
    existingMessageIds.add(message.id);
    nextContexts.push({
      id: `context-${message.id}`,
      messageId: message.id,
      role: message.role === "request" ? "request" : message.role,
      ...(normalizeText(message.senderName)
        ? { senderName: normalizeText(message.senderName) }
        : {}),
      content: message.content,
      createdAt: normalizeTimestamp(message.createdAt),
      addedAt: timestamp,
    });
  });

  return nextContexts;
}

function mergeProgressNotes(
  existingNotes: ArrangementProgressNote[],
  note: {
    content: string;
    sourceMessageIds: string[];
    confidence: number;
    reason: string;
  },
  timestamp: number
) {
  const content = normalizeText(note.content);
  if (!content) return existingNotes;

  const sourceMessageIds = uniqueTextValues(note.sourceMessageIds);
  const alreadyExists = existingNotes.some(
    (existingNote) =>
      existingNote.content === content ||
      sourceMessageIds.some((messageId) =>
        existingNote.sourceMessageIds.includes(messageId)
      )
  );
  if (alreadyExists) return existingNotes;

  return [
    ...existingNotes,
    {
      id: `progress-note-${timestamp}`,
      content,
      sourceMessageIds,
      createdAt: timestamp,
      confidence: Math.min(Math.max(note.confidence, 0), 1),
      reason: normalizeText(note.reason),
    },
  ];
}

function buildTimeFieldsFromMerge(
  updatedFields: Record<string, unknown>,
  arrangement: ArrangementItem
): Pick<
  ArrangementItem,
  "timeType" | "startTime" | "endTime" | "dueTime" | "fuzzyTimeLabel"
> {
  const timeType = normalizeTimeType(updatedFields.timeType);
  if (timeType === "fuzzy") {
    return {
      timeType,
      startTime: null,
      endTime: null,
      dueTime: null,
      fuzzyTimeLabel:
        normalizeText(updatedFields.fuzzyTimeLabel) || arrangement.fuzzyTimeLabel,
    };
  }

  if (timeType === "date" || timeType === "datetime" || timeType === "range") {
    const startTime = parseAITime(normalizeText(updatedFields.startTime));
    if (startTime !== null) {
      return {
        timeType,
        startTime,
        endTime:
          timeType === "range"
            ? parseAITime(normalizeText(updatedFields.endTime))
            : timeType === "date"
              ? startTime + 24 * 60 * 60 * 1000 - 1
              : null,
        dueTime: null,
        fuzzyTimeLabel: "",
      };
    }
  }

  if (timeType === "due") {
    const dueTime = parseAITime(normalizeText(updatedFields.dueTime));
    if (dueTime !== null) {
      return {
        timeType,
        startTime: null,
        endTime: null,
        dueTime,
        fuzzyTimeLabel: "",
      };
    }
  }

  return {
    timeType: arrangement.timeType,
    startTime: arrangement.startTime,
    endTime: arrangement.endTime,
    dueTime: arrangement.dueTime,
    fuzzyTimeLabel: arrangement.fuzzyTimeLabel,
  };
}

function buildTitleWithAddedItems(title: string, addedItems: string[]) {
  const normalizedItems = uniqueTextValues(addedItems);
  if (normalizedItems.length === 0) return title;
  const missingItems = normalizedItems.filter((item) => !title.includes(item));
  if (missingItems.length === 0) return title;
  return `${title}、${missingItems.join("、")}`;
}

function appendSourceText(currentText: string, nextText: string) {
  const normalizedCurrentText = normalizeText(currentText);
  const normalizedNextText = normalizeText(nextText);
  if (!normalizedNextText || normalizedCurrentText.includes(normalizedNextText)) {
    return normalizedCurrentText;
  }
  return normalizedCurrentText
    ? `${normalizedCurrentText}\n${normalizedNextText}`
    : normalizedNextText;
}

function createEmptyReminder(createdFrom: ArrangementReminder["createdFrom"] = "manual"): ArrangementReminder {
  return {
    enabled: false,
    remindAt: null,
    offsetMinutes: null,
    repeatRule: null,
    createdFrom,
  };
}

function parseDateInput(value: string, edge: "start" | "end") {
  const match = normalizeText(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date =
    edge === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  const timestamp = date.getTime();

  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseDateTimeInput(value: string) {
  const timestamp = new Date(normalizeText(value)).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseAITime(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function uniqueTextValues(values: string[]) {
  return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
}

function normalizeAISourceScene(value: ArrangementAIScene | undefined) {
  if (value === "private_chat" || value === "group_chat" || value === "self_chat") {
    return value;
  }

  return "self_chat";
}

function getDefaultAISourceLabel(scene: ArrangementSourceContext["sourceType"]) {
  if (scene === "private_chat") return "私聊消息";
  if (scene === "group_chat") return "群聊消息";
  if (scene === "self_chat") return "发给自己的消息";
  return "手动创建";
}

function updateArrangementAIFeedback(
  arrangementId: string,
  feedbackStatus: ArrangementAIFeedback["status"],
  nextStatus: ArrangementStatus
) {
  const arrangements = getInitialArrangements();
  let updatedArrangement: ArrangementItem | null = null;

  const updatedArrangements = arrangements.map((arrangement) => {
    if (arrangement.id !== arrangementId) return arrangement;

    const timestamp = Date.now();
    const nextArrangement: ArrangementItem = {
      ...arrangement,
      status: nextStatus,
      aiFeedback: {
        status: feedbackStatus,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    };

    updatedArrangement = nextArrangement;
    return nextArrangement;
  });

  if (!updatedArrangement) return null;
  persistArrangements(updatedArrangements);
  return updatedArrangement;
}

export function hasArrangementForSourceMessage(sourceMessageId: string) {
  const normalizedSourceMessageId = normalizeText(sourceMessageId);
  if (!normalizedSourceMessageId) return false;

  return getInitialArrangements().some(
    (arrangement) =>
      arrangement.sourceMessageIds.includes(normalizedSourceMessageId) ||
      arrangement.mergedSourceIds.includes(normalizedSourceMessageId) ||
      arrangement.relatedContexts.some(
        (context) => context.messageId === normalizedSourceMessageId
      ) ||
      arrangement.progressNotes.some((note) =>
        note.sourceMessageIds.includes(normalizedSourceMessageId)
      )
  );
}

export function notifyArrangementChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(arrangementsStorageEvent));
}
