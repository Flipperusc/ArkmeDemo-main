import type {
  ArrangementAIMergeSourceMessage,
} from "@/data/arrangements";
import type {
  ArrangementAIMergeCandidateResult,
} from "@/types/arrangementAI";

export const arrangementAIMergeCandidatesStorageKey =
  "arkme-demo.arrangementAIMergeCandidates";
export const arrangementAIMergeRecordsStorageEvent =
  "arkme-demo:arrangement-ai-merge-records-updated";

export type ArrangementAIMergeCandidateStatus =
  | "pending"
  | "auto_merged"
  | "confirmed"
  | "ignored"
  | "wrong";

export type ArrangementAIMergeCandidateRecord = {
  id: string;
  sourceMessageId: string;
  sourceMessageIds: string[];
  sourceText: string;
  sourceLabel: string;
  sourceMessages: ArrangementAIMergeSourceMessage[];
  targetArrangementId: string;
  detectedAt: number;
  confidence: number;
  result: ArrangementAIMergeCandidateResult;
  status: ArrangementAIMergeCandidateStatus;
  updatedAt: number;
};

export function getArrangementAIMergeCandidates() {
  const parsedValue = readJsonValue(arrangementAIMergeCandidatesStorageKey);
  if (!Array.isArray(parsedValue)) return [];

  return parsedValue
    .map(normalizeMergeCandidate)
    .filter((candidate): candidate is ArrangementAIMergeCandidateRecord =>
      Boolean(candidate)
    );
}

export function getPendingArrangementAIMergeCandidates() {
  return getArrangementAIMergeCandidates()
    .filter((candidate) => candidate.status === "pending")
    .sort((a, b) => b.detectedAt - a.detectedAt);
}

export function hasProcessedArrangementMergeMessage(sourceMessageId: string) {
  const normalizedMessageId = normalizeText(sourceMessageId);
  if (!normalizedMessageId) return true;

  return getArrangementAIMergeCandidates().some(
    (candidate) =>
      candidate.sourceMessageId === normalizedMessageId ||
      candidate.sourceMessageIds.includes(normalizedMessageId)
  );
}

export function saveArrangementAIMergeCandidate(
  candidate: Omit<ArrangementAIMergeCandidateRecord, "id" | "updatedAt">
) {
  const timestamp = Date.now();
  const nextCandidate: ArrangementAIMergeCandidateRecord = {
    ...candidate,
    id: buildMergeCandidateId(candidate.sourceMessageId),
    updatedAt: timestamp,
  };
  const candidates = getArrangementAIMergeCandidates();
  const nextCandidates = [
    nextCandidate,
    ...candidates.filter((item) => item.id !== nextCandidate.id),
  ];

  writeJsonValue(arrangementAIMergeCandidatesStorageKey, nextCandidates);
  notifyArrangementAIMergeRecordsChange();
  return nextCandidate;
}

export function updateArrangementAIMergeCandidateStatus(
  candidateId: string,
  status: ArrangementAIMergeCandidateStatus
) {
  let updatedCandidate: ArrangementAIMergeCandidateRecord | null = null;
  const nextCandidates = getArrangementAIMergeCandidates().map((candidate) => {
    if (candidate.id !== candidateId) return candidate;

    updatedCandidate = {
      ...candidate,
      status,
      updatedAt: Date.now(),
    };
    return updatedCandidate;
  });

  if (!updatedCandidate) return null;

  writeJsonValue(arrangementAIMergeCandidatesStorageKey, nextCandidates);
  notifyArrangementAIMergeRecordsChange();
  return updatedCandidate;
}

function normalizeMergeCandidate(value: unknown): ArrangementAIMergeCandidateRecord | null {
  if (!isPlainObject(value)) return null;

  const sourceMessageId = normalizeText(value.sourceMessageId);
  const sourceText = normalizeText(value.sourceText);
  const targetArrangementId = normalizeText(value.targetArrangementId);
  const detectedAt = normalizeTimestamp(value.detectedAt);
  const result = isPlainObject(value.result)
    ? (value.result as ArrangementAIMergeCandidateResult)
    : null;
  if (!sourceMessageId || !sourceText || !targetArrangementId || !detectedAt || !result) {
    return null;
  }

  return {
    id: normalizeText(value.id) || buildMergeCandidateId(sourceMessageId),
    sourceMessageId,
    sourceMessageIds: normalizeStringList(value.sourceMessageIds),
    sourceText,
    sourceLabel: normalizeText(value.sourceLabel),
    sourceMessages: normalizeSourceMessages(value.sourceMessages),
    targetArrangementId,
    detectedAt,
    confidence: normalizeConfidence(value.confidence),
    result,
    status: normalizeStatus(value.status),
    updatedAt: normalizeTimestamp(value.updatedAt) ?? detectedAt,
  };
}

function normalizeSourceMessages(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item): ArrangementAIMergeSourceMessage | null => {
      if (!isPlainObject(item)) return null;
      const id = normalizeText(item.id);
      const content = normalizeText(item.content);
      if (!id || !content) return null;

      const role =
        item.role === "request" || item.role === "commitment"
          ? item.role
          : "supplement";
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
    .filter((item): item is ArrangementAIMergeSourceMessage => Boolean(item));
}

function normalizeStatus(value: unknown): ArrangementAIMergeCandidateStatus {
  if (
    value === "pending" ||
    value === "auto_merged" ||
    value === "confirmed" ||
    value === "ignored" ||
    value === "wrong"
  ) {
    return value;
  }

  return "pending";
}

function buildMergeCandidateId(sourceMessageId: string) {
  return `arrangement-ai-merge-${sourceMessageId}`;
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
    // Merge records are best-effort; chat sending must remain unaffected.
  }
}

function notifyArrangementAIMergeRecordsChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(arrangementAIMergeRecordsStorageEvent));
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
