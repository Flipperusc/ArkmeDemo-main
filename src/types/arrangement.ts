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
  relatedPeople: ArrangementRelatedPerson[];
  reminder: ArrangementReminder;
  createdAt: number;
  updatedAt: number;
};
