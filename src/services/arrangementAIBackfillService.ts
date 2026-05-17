import {
  getInitialTestGroups,
  getInitialTestIdentities,
  getInitialTestMessages,
  demoSenderIdentityId,
} from "@/data/testConversations";
import {
  hasProcessedArrangementAIMessage,
  recordArrangementAIFeedback,
  saveArrangementAICandidate,
  updateArrangementAICandidateStatus,
} from "@/data/arrangementAIRecords";
import {
  createArrangementFromAICandidate,
  hasArrangementForSourceMessage,
} from "@/data/arrangements";
import { getAISettings } from "@/services/aiSettings";
import { analyzeArrangementCandidate } from "@/services/arrangementAIService";
import type { AISettings } from "@/types/ai";
import type {
  ArrangementAIScene,
  ArrangementCandidateInput,
  ArrangementCandidateResult,
} from "@/types/arrangementAI";
import type { RecordItem } from "@/types/record";

const createdSelfRecordsStorageKey = "arkme-demo.selfRecords";

export type ArrangementBackfillTimeRange = "all" | "today" | "7d" | "30d";
export type ArrangementBackfillConversationKind =
  | "all"
  | "self_chat"
  | "private_chat"
  | "group_chat";

export type ArrangementBackfillScope = {
  timeRange: ArrangementBackfillTimeRange;
  recentLimit: number;
  conversationKind: ArrangementBackfillConversationKind;
  conversationId: string;
};

export type ArrangementBackfillConversationOption = {
  id: string;
  label: string;
  kind: ArrangementBackfillConversationKind;
  count: number;
};

export type ArrangementBackfillTarget = {
  id: string;
  scene: ArrangementAIScene;
  conversationId: string;
  conversationLabel: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: number;
};

export type ArrangementBackfillResult = {
  scanned: number;
  skipped: number;
  created: number;
  pending: number;
  ignored: number;
  failed: number;
  disabled: boolean;
  message: string;
};

type ArrangementBackfillRunOptions = {
  settings?: AISettings;
  analyze?: (
    input: ArrangementCandidateInput
  ) => Promise<{ ok: true; data: ArrangementCandidateResult } | { ok: false }>;
};

export function getArrangementBackfillConversationOptions() {
  const targets = collectAllBackfillTargets();
  const optionMap = new Map<string, ArrangementBackfillConversationOption>();

  for (const target of targets) {
    const existing = optionMap.get(target.conversationId);
    if (existing) {
      existing.count += 1;
      continue;
    }

    optionMap.set(target.conversationId, {
      id: target.conversationId,
      label: target.conversationLabel,
      kind: sceneToConversationKind(target.scene),
      count: 1,
    });
  }

  return Array.from(optionMap.values()).sort((a, b) => {
    if (a.kind === b.kind) return a.label.localeCompare(b.label);
    return getConversationKindOrder(a.kind) - getConversationKindOrder(b.kind);
  });
}

export function collectArrangementBackfillTargets(scope: ArrangementBackfillScope) {
  const cutoff = getTimeRangeCutoff(scope.timeRange);
  return collectAllBackfillTargets()
    .filter((target) => target.content.trim())
    .filter((target) => !cutoff || target.createdAt >= cutoff)
    .filter((target) => {
      if (scope.conversationKind === "all") return true;
      return sceneToConversationKind(target.scene) === scope.conversationKind;
    })
    .filter((target) => {
      if (scope.conversationId === "all") return true;
      return target.conversationId === scope.conversationId;
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, Math.max(1, scope.recentLimit));
}

export async function runArrangementBackfill(
  scope: ArrangementBackfillScope,
  options: ArrangementBackfillRunOptions = {}
): Promise<ArrangementBackfillResult> {
  const settings = options.settings ?? (await getAISettings());
  if (!settings.enableAI || !settings.hasApiKey) {
    return {
      scanned: 0,
      skipped: 0,
      created: 0,
      pending: 0,
      ignored: 0,
      failed: 0,
      disabled: true,
      message: "开启 AI 并保存 API Key 后，可以重新识别历史内容。",
    };
  }

  const targets = collectArrangementBackfillTargets(scope);
  const result: ArrangementBackfillResult = {
    scanned: 0,
    skipped: 0,
    created: 0,
    pending: 0,
    ignored: 0,
    failed: 0,
    disabled: false,
    message: "",
  };
  const analyze = options.analyze ?? analyzeArrangementCandidate;

  for (const target of targets) {
    if (
      hasArrangementForSourceMessage(target.id) ||
      hasProcessedArrangementAIMessage(target.id, target.scene)
    ) {
      result.skipped += 1;
      continue;
    }

    result.scanned += 1;

    try {
      const analyzed = await analyze({
        scene: target.scene,
        currentUserId: "self",
        messages: [
          {
            id: target.id,
            senderId: target.senderId,
            senderName: target.senderName,
            content: target.content,
            createdAt: new Date(target.createdAt).toISOString(),
          },
        ],
        timezone: getRuntimeTimezone(),
        now: new Date().toISOString(),
      });

      if (!analyzed.ok) {
        result.failed += 1;
        continue;
      }

      const candidateResult = analyzed.data;
      if (!candidateResult.hasArrangement || candidateResult.confidence < 0.5) {
        saveArrangementAICandidate({
          scene: target.scene,
          sourceMessageId: target.id,
          sourceText: target.content,
          detectedAt: Date.now(),
          confidence: candidateResult.confidence,
          result: candidateResult,
          status: "ignored",
        });
        result.ignored += 1;
        continue;
      }

      const candidate = saveArrangementAICandidate({
        scene: target.scene,
        sourceMessageId: target.id,
        sourceText: target.content,
        detectedAt: Date.now(),
        confidence: candidateResult.confidence,
        result: candidateResult,
        status: "pending",
      });

      if (candidateResult.confidence >= 0.8) {
        const arrangement = createArrangementFromAICandidate(candidateResult, {
          scene: target.scene,
          sourceLabel: target.conversationLabel,
          sourceMessageId: target.id,
          sourceText: target.content,
          detectedAt: candidate.detectedAt,
          confidence: candidateResult.confidence,
          candidateId: candidate.id,
          feedbackStatus: "auto_created",
        });

        if (arrangement) {
          updateArrangementAICandidateStatus(candidate.id, "auto_created", arrangement.id);
          recordArrangementAIFeedback({
            action: "auto_created",
            scene: target.scene,
            sourceMessageId: target.id,
            sourceText: target.content,
            candidateId: candidate.id,
            arrangementId: arrangement.id,
          });
          result.created += 1;
          continue;
        }
      }

      result.pending += 1;
    } catch {
      result.failed += 1;
    }
  }

  result.message = `已检查 ${result.scanned} 条，新增 ${result.created} 条安排，${result.pending} 条待确认，跳过 ${result.skipped} 条。`;
  return result;
}

function collectAllBackfillTargets(): ArrangementBackfillTarget[] {
  return [...collectSelfChatTargets(), ...collectTestConversationTargets()];
}

function collectSelfChatTargets(): ArrangementBackfillTarget[] {
  return readSelfRecords().map((record) => ({
    id: record.uid,
    scene: "self_chat",
    conversationId: "self_chat",
    conversationLabel: "发给自己的消息",
    senderId: "self",
    senderName: "我",
    content: record.text_content,
    createdAt: record.send_at,
  }));
}

function collectTestConversationTargets(): ArrangementBackfillTarget[] {
  const identities = getInitialTestIdentities();
  const groups = getInitialTestGroups();

  return getInitialTestMessages().map((message) => {
    const identity = identities.find((item) => item.id === message.identityId);
    const group = groups.find((item) => item.id === message.conversationId);
    const isGroup = message.conversationType === "group";
    const conversationLabel = isGroup
      ? `群聊：${group?.name ?? "未命名群聊"}`
      : `私聊：${identity?.name ?? "未命名联系人"}`;

    return {
      id: message.id,
      scene: isGroup ? "group_chat" : "private_chat",
      conversationId: message.conversationId,
      conversationLabel,
      senderId: message.identityId,
      senderName:
        message.identityId === demoSenderIdentityId ? "我" : identity?.name ?? "对方",
      content: message.text,
      createdAt: message.sentAt,
    };
  });
}

function readSelfRecords(): RecordItem[] {
  if (typeof window === "undefined") return [];

  try {
    const value = window.localStorage.getItem(createdSelfRecordsStorageKey);
    const parsedValue = value ? JSON.parse(value) : null;
    if (!Array.isArray(parsedValue)) return [];

    return parsedValue
      .map((record) => {
        if (!record || typeof record !== "object") return null;
        const item = record as Partial<RecordItem>;
        const uid = normalizeText(item.uid);
        const textContent = normalizeText(item.text_content);
        const sentAt = normalizeTimestamp(item.send_at);
        if (!uid || !textContent || sentAt === null) return null;
        return {
          uid,
          text_content: textContent,
          send_at: sentAt,
          create_at: normalizeTimestamp(item.create_at) ?? sentAt,
          update_at: normalizeTimestamp(item.update_at) ?? sentAt,
        };
      })
      .filter((record): record is RecordItem => Boolean(record));
  } catch {
    return [];
  }
}

function sceneToConversationKind(scene: ArrangementAIScene): ArrangementBackfillConversationKind {
  if (scene === "private_chat") return "private_chat";
  if (scene === "group_chat") return "group_chat";
  if (scene === "self_chat") return "self_chat";
  return "all";
}

function getConversationKindOrder(kind: ArrangementBackfillConversationKind) {
  if (kind === "self_chat") return 0;
  if (kind === "private_chat") return 1;
  if (kind === "group_chat") return 2;
  return 3;
}

function getTimeRangeCutoff(timeRange: ArrangementBackfillTimeRange) {
  const now = Date.now();
  if (timeRange === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.getTime();
  }
  if (timeRange === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (timeRange === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  return null;
}

function getRuntimeTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  } catch {
    return "Asia/Shanghai";
  }
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTimestamp(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
