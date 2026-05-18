import type { ArrangementCandidateResult } from "@/types/arrangementAI";
import type {
  ArrangementAIScene,
  GroupChatRelationReason,
} from "@/types/arrangementAI";

export const arrangementAICandidatesStorageKey = "arkme-demo.arrangementAICandidates";
export const arrangementAIFeedbackStorageKey = "arkme-demo.arrangementAIFeedback";
export const arrangementAIRecordsStorageEvent = "arkme-demo:arrangement-ai-records-updated";

export type ArrangementAICandidateStatus =
  | "pending"
  | "auto_created"
  | "confirmed"
  | "edited"
  | "ignored"
  | "wrong";

export type ArrangementAICandidateSourceMessage = {
  id: string;
  role: "request" | "commitment" | "context";
  senderName?: string;
  content: string;
  createdAt?: number;
};

export type ArrangementAICandidateRecord = {
  id: string;
  scene: ArrangementAIScene;
  sourceMessageId: string;
  sourceMessageIds?: string[];
  sourceText: string;
  sourceLabel?: string;
  sourceMessages?: ArrangementAICandidateSourceMessage[];
  executorLabel?: string;
  beneficiaryLabel?: string;
  relationReason?: GroupChatRelationReason;
  detectedAt: number;
  confidence: number;
  result: ArrangementCandidateResult;
  status: ArrangementAICandidateStatus;
  arrangementId?: string;
  updatedAt: number;
};

export type ArrangementAIFeedbackAction =
  | "auto_created"
  | "confirmed"
  | "edited"
  | "ignored"
  | "wrong";

export type ArrangementAIFeedbackRecord = {
  id: string;
  action: ArrangementAIFeedbackAction;
  scene: ArrangementAIScene;
  sourceMessageId: string;
  sourceText: string;
  arrangementId?: string;
  candidateId?: string;
  createdAt: number;
  note?: string;
};

export function getArrangementAICandidates() {
  const parsedValue = readJsonValue(arrangementAICandidatesStorageKey);
  if (!Array.isArray(parsedValue)) return [];

  return parsedValue
    .map(normalizeCandidate)
    .filter((candidate): candidate is ArrangementAICandidateRecord => Boolean(candidate));
}

export function getPendingSelfChatArrangementCandidates() {
  return getPendingArrangementAICandidates("self_chat");
}

export function getPendingArrangementAICandidates(scene?: ArrangementAIScene) {
  return getArrangementAICandidates()
    .filter(
      (candidate) =>
        candidate.status === "pending" && (!scene || candidate.scene === scene)
    )
    .sort((a, b) => b.detectedAt - a.detectedAt);
}

export function hasProcessedSelfChatArrangementMessage(sourceMessageId: string) {
  return hasProcessedArrangementAIMessage(sourceMessageId, "self_chat");
}

export function hasProcessedArrangementAIMessage(
  sourceMessageId: string,
  scene?: ArrangementAIScene
) {
  const normalizedMessageId = normalizeText(sourceMessageId);
  if (!normalizedMessageId) return true;

  return getArrangementAICandidates().some(
    (candidate) =>
      candidate.sourceMessageId === normalizedMessageId &&
      (!scene || candidate.scene === scene)
  );
}

export function saveArrangementAICandidate(
  candidate: Omit<ArrangementAICandidateRecord, "id" | "updatedAt">
) {
  const timestamp = Date.now();
  const nextCandidate: ArrangementAICandidateRecord = {
    ...candidate,
    id: buildCandidateId(candidate.sourceMessageId),
    updatedAt: timestamp,
  };
  const candidates = getArrangementAICandidates();
  const nextCandidates = [
    nextCandidate,
    ...candidates.filter((item) => item.id !== nextCandidate.id),
  ];

  writeJsonValue(arrangementAICandidatesStorageKey, nextCandidates);
  notifyArrangementAIRecordsChange();
  return nextCandidate;
}

export function updateArrangementAICandidateStatus(
  candidateId: string,
  status: ArrangementAICandidateStatus,
  arrangementId?: string
) {
  let updatedCandidate: ArrangementAICandidateRecord | null = null;
  const nextCandidates = getArrangementAICandidates().map((candidate) => {
    if (candidate.id !== candidateId) return candidate;

    updatedCandidate = {
      ...candidate,
      status,
      ...(arrangementId ? { arrangementId } : {}),
      updatedAt: Date.now(),
    };
    return updatedCandidate;
  });

  if (!updatedCandidate) return null;

  writeJsonValue(arrangementAICandidatesStorageKey, nextCandidates);
  notifyArrangementAIRecordsChange();
  return updatedCandidate;
}

export function recordArrangementAIFeedback(
  feedback: Omit<ArrangementAIFeedbackRecord, "id" | "createdAt">
) {
  const timestamp = Date.now();
  const record: ArrangementAIFeedbackRecord = {
    ...feedback,
    id: `arrangement-ai-feedback-${timestamp}`,
    createdAt: timestamp,
  };
  const feedbackRecords = getArrangementAIFeedbackRecords();

  writeJsonValue(arrangementAIFeedbackStorageKey, [record, ...feedbackRecords]);
  notifyArrangementAIRecordsChange();
  return record;
}

export function getArrangementAIFeedbackRecords() {
  const parsedValue = readJsonValue(arrangementAIFeedbackStorageKey);
  if (!Array.isArray(parsedValue)) return [];

  return parsedValue
    .map(normalizeFeedback)
    .filter((feedback): feedback is ArrangementAIFeedbackRecord => Boolean(feedback));
}

function normalizeCandidate(value: unknown): ArrangementAICandidateRecord | null {
  if (!isPlainObject(value)) return null;

  const sourceMessageId = normalizeText(value.sourceMessageId);
  const sourceText = normalizeText(value.sourceText);
  const detectedAt = normalizeTimestamp(value.detectedAt);
  const confidence = normalizeConfidence(value.confidence);
  const result = isPlainObject(value.result)
    ? (value.result as ArrangementCandidateResult)
    : null;
  const relationReason = normalizeRelationReason(value.relationReason);

  if (!sourceMessageId || !sourceText || !detectedAt || !result) return null;

  return {
    id: normalizeText(value.id) || buildCandidateId(sourceMessageId),
    scene: normalizeScene(value.scene),
    sourceMessageId,
    ...(normalizeStringList(value.sourceMessageIds).length > 0
      ? { sourceMessageIds: normalizeStringList(value.sourceMessageIds) }
      : {}),
    sourceText,
    ...(normalizeText(value.sourceLabel)
      ? { sourceLabel: normalizeText(value.sourceLabel) }
      : {}),
    ...(normalizeCandidateSourceMessages(value.sourceMessages).length > 0
      ? { sourceMessages: normalizeCandidateSourceMessages(value.sourceMessages) }
      : {}),
    ...(normalizeText(value.executorLabel)
      ? { executorLabel: normalizeText(value.executorLabel) }
      : {}),
    ...(normalizeText(value.beneficiaryLabel)
      ? { beneficiaryLabel: normalizeText(value.beneficiaryLabel) }
      : {}),
    ...(relationReason ? { relationReason } : {}),
    detectedAt,
    confidence,
    result,
    status: normalizeCandidateStatus(value.status),
    ...(normalizeText(value.arrangementId)
      ? { arrangementId: normalizeText(value.arrangementId) }
      : {}),
    updatedAt: normalizeTimestamp(value.updatedAt) ?? detectedAt,
  };
}

function normalizeFeedback(value: unknown): ArrangementAIFeedbackRecord | null {
  if (!isPlainObject(value)) return null;

  const sourceMessageId = normalizeText(value.sourceMessageId);
  const sourceText = normalizeText(value.sourceText);
  const createdAt = normalizeTimestamp(value.createdAt);
  if (!sourceMessageId || !sourceText || !createdAt) return null;

  return {
    id: normalizeText(value.id) || `arrangement-ai-feedback-${createdAt}`,
    action: normalizeFeedbackAction(value.action),
    scene: normalizeScene(value.scene),
    sourceMessageId,
    sourceText,
    ...(normalizeText(value.arrangementId)
      ? { arrangementId: normalizeText(value.arrangementId) }
      : {}),
    ...(normalizeText(value.candidateId)
      ? { candidateId: normalizeText(value.candidateId) }
      : {}),
    createdAt,
    ...(normalizeText(value.note) ? { note: normalizeText(value.note) } : {}),
  };
}

function normalizeCandidateStatus(value: unknown): ArrangementAICandidateStatus {
  if (
    value === "pending" ||
    value === "auto_created" ||
    value === "confirmed" ||
    value === "edited" ||
    value === "ignored" ||
    value === "wrong"
  ) {
    return value;
  }

  return "pending";
}

function normalizeScene(value: unknown): ArrangementAIScene {
  if (
    value === "self_chat" ||
    value === "private_chat" ||
    value === "group_chat" ||
    value === "manual_text"
  ) {
    return value;
  }

  return "self_chat";
}

function normalizeFeedbackAction(value: unknown): ArrangementAIFeedbackAction {
  if (
    value === "auto_created" ||
    value === "confirmed" ||
    value === "edited" ||
    value === "ignored" ||
    value === "wrong"
  ) {
    return value;
  }

  return "ignored";
}

function normalizeRelationReason(value: unknown): GroupChatRelationReason | "" {
  if (
    value === "mentioned" ||
    value === "committed" ||
    value === "assigned" ||
    value === "confirmed" ||
    value === "not_related"
  ) {
    return value;
  }

  return "";
}

function normalizeCandidateSourceMessages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ArrangementAICandidateSourceMessage | null => {
      if (!isPlainObject(item)) return null;
      const id = normalizeText(item.id);
      const content = normalizeText(item.content);
      if (!id || !content) return null;

      const role =
        item.role === "request" || item.role === "commitment" ? item.role : "context";
      const createdAt = normalizeTimestamp(item.createdAt);

      return {
        id,
        role,
        ...(normalizeText(item.senderName)
          ? { senderName: normalizeText(item.senderName) }
          : {}),
        content,
        ...(createdAt ? { createdAt } : {}),
      };
    })
    .filter((item): item is ArrangementAICandidateSourceMessage => Boolean(item));
}

function buildCandidateId(sourceMessageId: string) {
  return `arrangement-ai-candidate-${sourceMessageId}`;
}

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
    // Keep feedback best-effort; chat sending must remain unaffected.
  }
}

function notifyArrangementAIRecordsChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(arrangementAIRecordsStorageEvent));
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeConfidence(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.min(Math.max(numericValue, 0), 1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
