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
  sourceType: ArrangementSourceType;
  sourceMessageIds: string[];
  sourceContext?: ArrangementSourceContext;
  relatedPeople: ArrangementRelatedPerson[];
  reminder: ArrangementReminder;
  aiFeedback?: ArrangementAIFeedback;
  createdAt: number;
  updatedAt: number;
};
