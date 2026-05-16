import type {
  ArrangementItem,
  ArrangementReminder,
  ArrangementRelatedPerson,
  ArrangementSourceType,
  ArrangementStatus,
  ArrangementTimeType,
} from "@/types/arrangement";

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
    sourceType: "manual",
    sourceMessageIds: [],
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
    sourceType: "manual",
    sourceMessageIds: [],
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
    sourceType: "manual",
    sourceMessageIds: [],
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
    value === "private_chat" ||
    value === "group_chat" ||
    value === "ai_detected"
  ) {
    return value;
  }

  return "manual";
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

function normalizeArrangement(value: unknown, index: number): ArrangementItem | null {
  if (!value || typeof value !== "object") return null;

  const arrangement = value as Partial<ArrangementItem>;
  const title = normalizeText(arrangement.title);
  if (!title) return null;

  const timestamp = Date.now() + index;
  const sourceMessageIds = Array.isArray(arrangement.sourceMessageIds)
    ? arrangement.sourceMessageIds.map(normalizeText).filter(Boolean)
    : [];
  const relatedPeople = Array.isArray(arrangement.relatedPeople)
    ? arrangement.relatedPeople
        .map(normalizeRelatedPerson)
        .filter((person): person is ArrangementRelatedPerson => Boolean(person))
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
    sourceType: normalizeSourceType(arrangement.sourceType),
    sourceMessageIds,
    relatedPeople,
    reminder: normalizeReminder(arrangement.reminder),
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
    sourceType: "manual",
    sourceMessageIds: [],
    relatedPeople: [],
    reminder,
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
  return updateArrangementStatus(arrangementId, "ignored");
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

function createEmptyReminder(): ArrangementReminder {
  return {
    enabled: false,
    remindAt: null,
    offsetMinutes: null,
    repeatRule: null,
    createdFrom: "manual",
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

export function notifyArrangementChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(arrangementsStorageEvent));
}
