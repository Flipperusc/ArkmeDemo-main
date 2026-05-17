export type ArrangementStatus = "pending" | "completed" | "later" | "ignored";

export type ArrangementTimeType =
  | "none"
  | "fuzzy"
  | "date"
  | "datetime"
  | "range"
  | "due";

export type ArrangementSourceType =
  | "manual"
  | "self"
  | "self_chat"
  | "private_chat"
  | "group_chat"
  | "ai_detected";

export type ArrangementRelatedPerson = {
  id: string;
  name: string;
  role?: "owner" | "participant" | "mentioned";
  avatarLabel?: string;
};

export type ArrangementReminder = {
  enabled: boolean;
  remindAt: number | null;
  offsetMinutes: number | null;
  repeatRule: string | null;
  createdFrom: "manual" | "time" | "ai";
};

export type ArrangementSourceContext = {
  sourceType: "self_chat" | "manual" | "private_chat" | "group_chat";
  sourceLabel: string;
  messageId: string;
  messageContent: string;
  requestMessageId?: string;
  requestMessageContent?: string;
  commitmentMessageId?: string;
  commitmentMessageContent?: string;
  executor?: string;
  beneficiary?: string;
  detectedAt: number | null;
  confidence: number | null;
  candidateId?: string;
};

export type ArrangementRelatedContextRole =
  | "request"
  | "commitment"
  | "supplement";

export type ArrangementRelatedContext = {
  id: string;
  messageId: string;
  role: ArrangementRelatedContextRole;
  senderName?: string;
  content: string;
  createdAt: number | null;
  addedAt: number;
};

export type ArrangementMergeType =
  | "add_items"
  | "update_time"
  | "update_location"
  | "add_context"
  | "ignore";

export type ArrangementMergeSnapshot = Pick<
  ArrangementItem,
  | "title"
  | "note"
  | "timeType"
  | "startTime"
  | "endTime"
  | "dueTime"
  | "fuzzyTimeLabel"
  | "location"
  | "items"
  | "sourceMessageIds"
  | "relatedContexts"
>;

export type ArrangementMergeHistoryItem = {
  id: string;
  mergeType: ArrangementMergeType;
  mergedAt: number;
  confidence: number;
  sourceMessageIds: string[];
  addedItems: string[];
  previousSnapshot: ArrangementMergeSnapshot;
  newTitle: string;
  reason: string;
};

export type ArrangementAIFeedback = {
  status: "auto_created" | "confirmed" | "edited" | "ignored" | "wrong";
  updatedAt: number;
  note?: string;
};

export type ArrangementItem = {
  id: string;
  title: string;
  note: string;
  status: ArrangementStatus;
  timeType: ArrangementTimeType;
  startTime: number | null;
  endTime: number | null;
  dueTime: number | null;
  fuzzyTimeLabel: string;
  location: string;
  items: string[];
  sourceType: ArrangementSourceType;
  sourceMessageIds: string[];
  sourceContext?: ArrangementSourceContext;
  relatedContexts: ArrangementRelatedContext[];
  mergeHistory: ArrangementMergeHistoryItem[];
  relatedPeople: ArrangementRelatedPerson[];
  reminder: ArrangementReminder;
  aiFeedback?: ArrangementAIFeedback;
  createdAt: number;
  updatedAt: number;
};
