import type {
  ArrangementAIAssistOutputType,
  ArrangementAIAssistSuggestedAction,
  ArrangementExecutionType,
  ArrangementItem,
  ArrangementStatus,
  ArrangementStatusChangeType,
} from "@/types/arrangement";

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

export type GroupChatRelationReason =
  | "mentioned"
  | "committed"
  | "assigned"
  | "confirmed"
  | "not_related";

export type GroupChatMemberSummary = {
  id: string;
  name: string;
  nicknames?: string[];
};

export type GroupChatMentionInfo = {
  messageId: string;
  mentionedCurrentUser: boolean;
  mentionedUserIds: string[];
  rawText: string;
};

export type GroupChatRelatedArrangementInput = {
  currentUserId: string;
  currentUserName?: string;
  currentUserAliases?: string[];
  groupId: string;
  groupName: string;
  messages: ArrangementAIMessage[];
  memberSummaries?: GroupChatMemberSummary[];
  mentions?: GroupChatMentionInfo[];
  existingArrangements?: ArrangementItem[];
  timezone?: string;
  now: string;
};

export type GroupChatRelatedArrangementResult = {
  hasArrangement: boolean;
  isRelatedToCurrentUser: boolean;
  relationReason: GroupChatRelationReason;
  hasUserCommitted: boolean;
  shouldCreate: boolean;
  confidence: number;
  arrangement: ArrangementCandidateEntity;
  needsUserConfirmation: boolean;
  reason: string;
  risks: string[];
};

export type PrivateChatSupplementMergeType =
  | "add_items"
  | "update_time"
  | "update_location"
  | "add_context"
  | "ignore";

export type PrivateChatSupplementMergeInput = {
  currentUserId: string;
  currentUserName?: string;
  otherUserId: string;
  otherUserName?: string;
  currentMessage: ArrangementAIMessage;
  messages: ArrangementAIMessage[];
  candidateArrangements: ArrangementItem[];
  timezone?: string;
  now: string;
};

export type PrivateChatSupplementMergeResult = {
  shouldMerge: boolean;
  confidence: number;
  targetArrangementId: string;
  mergeType: PrivateChatSupplementMergeType;
  addedItems: string[];
  updatedFields: Record<string, unknown>;
  newTitle: string;
  sourceMessageIds: string[];
  reason: string;
  needsUserConfirmation: boolean;
};

export type ArrangementSimilarityMergeAction =
  | "merge_duplicate"
  | "add_context"
  | "update_progress"
  | "update_time"
  | "ignore";

export type ArrangementSimilarityMergeInput = {
  currentUserId: string;
  currentUserName?: string;
  sourceType: ArrangementAIScene;
  sourceLabel: string;
  sourceMessageId: string;
  sourceText: string;
  sourceMessages: ArrangementAIMessage[];
  candidateResult?: ArrangementCandidateResult;
  candidateArrangements: ArrangementItem[];
  timezone?: string;
  now: string;
};

export type ArrangementSimilarityMergeResult = {
  shouldMerge: boolean;
  confidence: number;
  targetArrangementId: string;
  mergeAction: ArrangementSimilarityMergeAction;
  progressNote: string;
  updatedFields: Record<string, unknown>;
  sourceMessageIds: string[];
  reason: string;
  needsUserConfirmation: boolean;
};

export type ArrangementStatusChangeInput = {
  currentUserId: string;
  currentUserName?: string;
  sourceType: Extract<ArrangementAIScene, "self_chat" | "private_chat">;
  sourceLabel: string;
  sourceMessageId: string;
  sourceText: string;
  sourceMessages: ArrangementAIMessage[];
  candidateArrangements: ArrangementItem[];
  timezone?: string;
  now: string;
};

export type ArrangementStatusChangeResult = {
  hasStatusChange: boolean;
  relatedArrangementId: string;
  confidence: number;
  statusChangeType: ArrangementStatusChangeType;
  newStatus: ArrangementStatus;
  progressNote: string;
  newTime: string | null;
  sourceMessageIds: string[];
  needsUserConfirmation: boolean;
  reason: string;
};

export type ArrangementAIMergeCandidateResult =
  | PrivateChatSupplementMergeResult
  | ArrangementSimilarityMergeResult
  | ArrangementStatusChangeResult;

export type ArrangementAIAssistSuggestionInput = {
  currentUserId: string;
  currentUserName?: string;
  arrangement: ArrangementItem;
  timezone?: string;
  now: string;
};

export type ArrangementAIAssistSuggestionResult = {
  executionType: ArrangementExecutionType;
  confidence: number;
  suggestedActions: ArrangementAIAssistSuggestedAction[];
  reason: string;
  risks: string[];
};

export type ArrangementAIAssistGenerationInput = {
  currentUserId: string;
  currentUserName?: string;
  arrangement: ArrangementItem;
  action: ArrangementAIAssistSuggestedAction;
  timezone?: string;
  now: string;
};

export type ArrangementAIAssistGenerationResult = {
  title: string;
  content: string;
  outputType: ArrangementAIAssistOutputType;
  requiresUserConfirmation: boolean;
  safetyNote: string;
  reason: string;
  risks: string[];
};
