import type { ArrangementItem } from "@/types/arrangement";

export type ArrangementAIScene =
  | "self_chat"
  | "private_chat"
  | "group_chat"
  | "manual_text";

export type ArrangementAIAction =
  | "create"
  | "update"
  | "merge"
  | "ignore"
  | "needs_confirmation";

export type ArrangementAIType =
  | "todo"
  | "schedule"
  | "reminder"
  | "commitment"
  | "follow_up"
  | "unknown";

export type ArrangementAITimeType =
  | "none"
  | "fuzzy"
  | "date"
  | "datetime"
  | "range"
  | "due";

export type ArrangementAIMessage = {
  id: string;
  senderId: string;
  senderName?: string;
  content: string;
  createdAt: string;
};

export type ArrangementCandidateInput = {
  scene: ArrangementAIScene;
  currentUserId: string;
  currentUserName?: string;
  messages: ArrangementAIMessage[];
  existingArrangements?: ArrangementItem[];
  timezone?: string;
  now: string;
};

export type ArrangementCandidateEntity = {
  title: string;
  summary: string;
  type: ArrangementAIType;
  status: "pending";
  timeType: ArrangementAITimeType;
  fuzzyTimeLabel: string;
  startTime: string | null;
  endTime: string | null;
  dueTime: string | null;
  location: string;
  relatedPeople: string[];
  executor: string;
  beneficiary: string;
  items: string[];
  sourceType: string;
  sourceMessageIds: string[];
};

export type ArrangementCandidateResult = {
  hasArrangement: boolean;
  action: ArrangementAIAction;
  confidence: number;
  arrangement: ArrangementCandidateEntity;
  needsUserConfirmation: boolean;
  reason: string;
  risks: string[];
};

export type ArrangementCandidateAnalyzeOptions = {
  callJSON?: <T>(request: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    jsonExample: unknown;
    maxTokens?: number;
    thinkingMode?: "disabled" | "enabled";
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
};

export type PrivateChatCommitmentInput = {
  currentUserId: string;
  currentUserName?: string;
  otherUserId: string;
  otherUserName?: string;
  messages: ArrangementAIMessage[];
  existingArrangements?: ArrangementItem[];
  timezone?: string;
  now: string;
};

export type PrivateChatCommitmentResult = {
  hasArrangement: boolean;
  isRelatedToCurrentUser: boolean;
  hasUserCommitted: boolean;
  shouldCreate: boolean;
  confidence: number;
  arrangement: ArrangementCandidateEntity;
  needsUserConfirmation: boolean;
  reason: string;
  risks: string[];
};
