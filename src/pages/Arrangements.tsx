import React from "react";
import Button from "@/components/ui/button";
import {
  arrangementsStorageEvent,
  arrangementsStorageKey,
  continueArrangement,
  createArrangement,
  getInitialArrangements,
  ignoreArrangement,
  markArrangementAIWrong,
  updateArrangement,
  updateArrangementStatus,
  type ArrangementDraft,
  type ArrangementDraftTimeType,
} from "@/data/arrangements";
import {
  recordArrangementAIFeedback,
  updateArrangementAICandidateStatus,
} from "@/data/arrangementAIRecords";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/settings/preferences";
import type { ArrangementItem, ArrangementStatus } from "@/types/arrangement";

type ArrangementViewMode = "list" | "create" | "detail" | "edit";
type ArrangementListScope = "pending" | "later" | "completed";
type ArrangementFormTimeType = ArrangementDraftTimeType;
type ArrangementDisplayMode = "list" | "calendar";
type CalendarDayGroup = {
  dayKey: string;
  dayLabel: string;
  arrangements: ArrangementItem[];
};

const arrangementListScopes: ArrangementListScope[] = ["pending", "later", "completed"];
const arrangementDisplayModes: ArrangementDisplayMode[] = ["list", "calendar"];
const arrangementFormTimeTypes: ArrangementFormTimeType[] = [
  "none",
  "fuzzy",
  "date",
  "datetime",
  "due",
];
const fuzzyTimeKeys = [
  "today",
  "tomorrow",
  "thisWeek",
  "weekend",
  "near",
  "later",
  "free",
  "someday",
] as const;
const reminderOffsetOptions = [0, 10, 30, 60, 60 * 24] as const;

const arrangementStatusOrder: Record<ArrangementStatus, number> = {
  pending: 0,
  later: 1,
  completed: 2,
  ignored: 3,
};

export default function Arrangements() {
  const { resolvedLocale, t } = usePreferences();
  const [arrangements, setArrangements] = React.useState(getInitialArrangements);
  const [viewMode, setViewMode] = React.useState<ArrangementViewMode>("list");
  const [listScope, setListScope] = React.useState<ArrangementListScope>("pending");
  const [displayMode, setDisplayMode] = React.useState<ArrangementDisplayMode>("list");
  const [selectedArrangementId, setSelectedArrangementId] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshArrangements = () => setArrangements(getInitialArrangements());
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== arrangementsStorageKey) return;
      refreshArrangements();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(arrangementsStorageEvent, refreshArrangements);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(arrangementsStorageEvent, refreshArrangements);
    };
  }, []);

  const selectedArrangement = React.useMemo(
    () =>
      selectedArrangementId
        ? arrangements.find((arrangement) => arrangement.id === selectedArrangementId) ??
          null
        : null,
    [arrangements, selectedArrangementId]
  );

  React.useEffect(() => {
    if ((viewMode === "detail" || viewMode === "edit") && !selectedArrangement) {
      setViewMode("list");
      setSelectedArrangementId(null);
    }
  }, [selectedArrangement, viewMode]);

  const arrangementCounts = React.useMemo(
    () => ({
      pending: arrangements.filter((arrangement) => arrangement.status === "pending").length,
      later: arrangements.filter((arrangement) => arrangement.status === "later").length,
      completed: arrangements.filter((arrangement) => arrangement.status === "completed")
        .length,
    }),
    [arrangements]
  );

  const visibleArrangements = React.useMemo(
    () =>
      arrangements
        .filter((arrangement) => arrangement.status === listScope)
        .sort((a, b) => sortArrangementsByScope(a, b, listScope)),
    [arrangements, listScope]
  );

  const refreshArrangements = () => setArrangements(getInitialArrangements());

  const handleCreate = (draft: ArrangementDraft) => {
    const arrangement = createArrangement(draft);
    if (!arrangement) return;

    if (arrangement.sourceContext && arrangement.sourceContext.sourceType !== "manual") {
      recordArrangementFeedback(arrangement, "edited");
    }

    refreshArrangements();
    setSelectedArrangementId(arrangement.id);
    setViewMode("detail");
  };

  const handleUpdate = (draft: ArrangementDraft) => {
    if (!selectedArrangement) return;

    const arrangement = updateArrangement(selectedArrangement.id, draft);
    if (!arrangement) return;

    refreshArrangements();
    setSelectedArrangementId(arrangement.id);
    setViewMode("detail");
  };

  const handleComplete = (arrangementId: string) => {
    updateArrangementStatus(arrangementId, "completed");
    refreshArrangements();
  };

  const handleUndoComplete = (arrangementId: string) => {
    updateArrangementStatus(arrangementId, "pending");
    refreshArrangements();
    setListScope("pending");
  };

  const handleMoveLater = (arrangementId: string) => {
    updateArrangementStatus(arrangementId, "later");
    refreshArrangements();
  };

  const handleRestorePending = (arrangementId: string) => {
    updateArrangementStatus(arrangementId, "pending");
    refreshArrangements();
    setListScope("pending");
  };

  const handleContinueFocus = (arrangementId: string) => {
    continueArrangement(arrangementId, t("arrangements.fuzzy.near"));
    refreshArrangements();
    setListScope("pending");
  };

  const handleIgnore = (arrangementId: string) => {
    const arrangement = arrangements.find((item) => item.id === arrangementId);
    ignoreArrangement(arrangementId);
    if (arrangement?.sourceContext && arrangement.sourceContext.sourceType !== "manual") {
      recordArrangementFeedback(arrangement, "ignored");
    }
    refreshArrangements();
    setSelectedArrangementId(null);
    setViewMode("list");
  };

  const handleMarkAIWrong = (arrangementId: string) => {
    const arrangement = arrangements.find((item) => item.id === arrangementId);
    markArrangementAIWrong(arrangementId);
    if (arrangement?.sourceContext && arrangement.sourceContext.sourceType !== "manual") {
      recordArrangementFeedback(arrangement, "wrong");
    }
    refreshArrangements();
    setSelectedArrangementId(null);
    setViewMode("list");
  };

  if (viewMode === "create") {
    return (
      <ArrangementFormScreen
        mode="create"
        locale={resolvedLocale}
        onCancel={() => setViewMode("list")}
        onSubmit={handleCreate}
      />
    );
  }

  if (viewMode === "edit" && selectedArrangement) {
    return (
      <ArrangementFormScreen
        mode="edit"
        arrangement={selectedArrangement}
        locale={resolvedLocale}
        onCancel={() => setViewMode("detail")}
        onSubmit={handleUpdate}
      />
    );
  }

  if (viewMode === "detail" && selectedArrangement) {
    return (
      <ArrangementDetailScreen
        arrangement={selectedArrangement}
        locale={resolvedLocale}
        onBack={() => setViewMode("list")}
        onEdit={() => setViewMode("edit")}
        onComplete={() => handleComplete(selectedArrangement.id)}
        onUndoComplete={() => handleUndoComplete(selectedArrangement.id)}
        onMoveLater={() => handleMoveLater(selectedArrangement.id)}
        onRestore={() => handleRestorePending(selectedArrangement.id)}
        onContinueFocus={() => handleContinueFocus(selectedArrangement.id)}
        onIgnore={() => handleIgnore(selectedArrangement.id)}
        onMarkAIWrong={() => handleMarkAIWrong(selectedArrangement.id)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="shrink-0 bg-bg px-4 pb-2 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold leading-7 text-text">
              {t("arrangements.title")}
            </h1>
            <p className="mt-1 text-[13px] leading-5 text-text-tertiary">
              {t("arrangements.subtitle")}
            </p>
          </div>
          <Button
            className="h-9 shrink-0 rounded-full px-3 text-[13px]"
            onClick={() => setViewMode("create")}
          >
            {t("arrangements.new")}
          </Button>
        </div>
        <span className="mt-3 inline-flex rounded-full bg-primary-soft px-3 py-1 text-[12px] leading-5 text-primary">
          {formatArrangementCount(visibleArrangements.length, t("arrangements.count"))}
        </span>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-surface-muted p-1">
          {arrangementDisplayModes.map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                "rounded-full px-2 py-1.5 text-[12px] font-medium leading-4 transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                displayMode === mode
                  ? "bg-surface text-text shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                  : "text-text-tertiary hover:text-text-muted"
              )}
              onClick={() => setDisplayMode(mode)}
            >
              {t(`arrangements.view.${mode}`)}
            </button>
          ))}
        </div>
        {displayMode === "list" && (
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-full bg-surface-muted p-1">
            {arrangementListScopes.map((scope) => (
              <button
                key={scope}
                type="button"
                className={cn(
                  "rounded-full px-2 py-1.5 text-[12px] font-medium leading-4 transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                  listScope === scope
                    ? "bg-surface text-text shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                    : "text-text-tertiary hover:text-text-muted"
                )}
                onClick={() => setListScope(scope)}
              >
                {t(`arrangements.scope.${scope}`)}
                <span className="ml-1 text-text-disabled">{arrangementCounts[scope]}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      {displayMode === "calendar" ? (
        <ArrangementCalendarView
          arrangements={arrangements}
          locale={resolvedLocale}
          onOpen={(arrangementId) => {
            setSelectedArrangementId(arrangementId);
            setViewMode("detail");
          }}
        />
      ) : visibleArrangements.length > 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-2">
          <div className="space-y-2.5">
            {visibleArrangements.map((arrangement) => (
              <ArrangementCard
                key={arrangement.id}
                arrangement={arrangement}
                locale={resolvedLocale}
                onOpen={() => {
                  setSelectedArrangementId(arrangement.id);
                  setViewMode("detail");
                }}
                onComplete={() => handleComplete(arrangement.id)}
                onUndoComplete={() => handleUndoComplete(arrangement.id)}
                onMoveLater={() => handleMoveLater(arrangement.id)}
                onRestore={() => handleRestorePending(arrangement.id)}
                onContinueFocus={() => handleContinueFocus(arrangement.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <ArrangementEmptyState
          scope={listScope}
          onCreate={() => setViewMode("create")}
          onBackToPending={() => setListScope("pending")}
        />
      )}
    </div>
  );
}

function ArrangementCard({
  arrangement,
  locale,
  onOpen,
  onComplete,
  onUndoComplete,
  onMoveLater,
  onRestore,
  onContinueFocus,
}: {
  arrangement: ArrangementItem;
  locale: string;
  onOpen: () => void;
  onComplete: () => void;
  onUndoComplete: () => void;
  onMoveLater: () => void;
  onRestore: () => void;
  onContinueFocus: () => void;
}) {
  const { t } = usePreferences();
  const statusMeta = getStatusMeta(arrangement.status, t);
  const timeLabel = formatArrangementTime(arrangement, locale, t);
  const overdueLabel = getGentleOverdueLabel(arrangement, locale, t);

  return (
    <article className="rounded-[16px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <button
        type="button"
        className="w-full text-left focus-visible:shadow-focus focus-visible:outline-none"
        onClick={onOpen}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[16px] font-semibold leading-6 text-text">
              {arrangement.title}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[12px] leading-5 text-text-muted">
                {timeLabel}
              </span>
              {arrangement.relatedPeople.length > 0 && (
                <span className="rounded-full bg-[var(--overview-entry-tag-bg)] px-2 py-0.5 text-[12px] leading-5 text-text-tertiary">
                  {arrangement.relatedPeople.map((person) => person.name).join("、")}
                </span>
              )}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[12px] leading-4",
              statusMeta.className
            )}
          >
            {statusMeta.label}
          </span>
        </div>

        {arrangement.note && (
          <p className="mt-2.5 break-words text-[13px] leading-5 text-text-muted">
            {arrangement.note}
          </p>
        )}
        {arrangement.reminder.enabled && arrangement.reminder.remindAt && (
          <p className="mt-2 text-[12px] leading-5 text-text-tertiary">
            {formatReminderLabel(arrangement.reminder.remindAt, locale, t)}
          </p>
        )}
      </button>
      {overdueLabel && (
        <div className="mt-3 rounded-[14px] bg-surface-muted px-3 py-2">
          <p className="text-[12px] font-medium leading-5 text-text-muted">
            {overdueLabel}
          </p>
          <p className="text-[12px] leading-5 text-text-tertiary">
            {t("arrangements.overdueQuestion")}
          </p>
        </div>
      )}
      <ArrangementCardActions
        status={arrangement.status}
        isOverdue={Boolean(overdueLabel)}
        onComplete={onComplete}
        onUndoComplete={onUndoComplete}
        onMoveLater={onMoveLater}
        onRestore={onRestore}
        onContinueFocus={onContinueFocus}
      />
    </article>
  );
}

function ArrangementCardActions({
  status,
  isOverdue,
  onComplete,
  onUndoComplete,
  onMoveLater,
  onRestore,
  onContinueFocus,
}: {
  status: ArrangementStatus;
  isOverdue: boolean;
  onComplete: () => void;
  onUndoComplete: () => void;
  onMoveLater: () => void;
  onRestore: () => void;
  onContinueFocus: () => void;
}) {
  const { t } = usePreferences();

  if (status === "completed") {
    return (
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="rounded-full bg-surface-muted px-3 py-1.5 text-[12px] font-medium leading-4 text-text-muted transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
          onClick={onUndoComplete}
        >
          {t("arrangements.undoComplete")}
        </button>
      </div>
    );
  }

  if (status === "later") {
    return (
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="rounded-full bg-primary-soft px-3 py-1.5 text-[12px] font-medium leading-4 text-primary transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
          onClick={onRestore}
        >
          {t("arrangements.restore")}
        </button>
      </div>
    );
  }

  if (status === "ignored") return null;

  if (isOverdue) {
    return (
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          className="rounded-full bg-primary-soft px-2 py-1.5 text-[12px] font-medium leading-4 text-primary transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
          onClick={onComplete}
        >
          {t("arrangements.completeShort")}
        </button>
        <button
          type="button"
          className="rounded-full bg-surface-muted px-2 py-1.5 text-[12px] font-medium leading-4 text-text-muted transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
          onClick={onContinueFocus}
        >
          {t("arrangements.continueFocus")}
        </button>
        <button
          type="button"
          className="rounded-full bg-surface-muted px-2 py-1.5 text-[12px] font-medium leading-4 text-text-muted transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
          onClick={onMoveLater}
        >
          {t("arrangements.status.later")}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap justify-end gap-2">
      <button
        type="button"
        className="rounded-full bg-surface-muted px-3 py-1.5 text-[12px] font-medium leading-4 text-text-muted transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
        onClick={onMoveLater}
      >
        {t("arrangements.moveLater")}
      </button>
      <button
        type="button"
        className="rounded-full bg-primary-soft px-3 py-1.5 text-[12px] font-medium leading-4 text-primary transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
        onClick={onComplete}
      >
        {t("arrangements.completeShort")}
      </button>
    </div>
  );
}

function ArrangementEmptyState({
  scope,
  onCreate,
  onBackToPending,
}: {
  scope: ArrangementListScope;
  onCreate: () => void;
  onBackToPending: () => void;
}) {
  const { t } = usePreferences();
  const isPending = scope === "pending";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-9 text-center">
      <div>
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <svg
            className="h-7 w-7"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 2v3" />
            <path d="M16 2v3" />
            <path d="M4 9h16" />
            <path d="M5 5h14a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1Z" />
            <path d="m9 15 2 2 4-4" />
          </svg>
        </div>
        <p className="mt-4 text-[15px] font-semibold leading-6 text-text">
          {t("arrangements.emptyTitle")}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-text-muted">
          {isPending
            ? t("arrangements.emptyDesc")
            : t(`arrangements.empty.${scope}`)}
        </p>
        {isPending ? (
          <Button className="mt-5 rounded-full px-4" onClick={onCreate}>
            {t("arrangements.new")}
          </Button>
        ) : (
          <Button className="mt-5 rounded-full px-4" variant="secondary" onClick={onBackToPending}>
            {t("arrangements.backToPending")}
          </Button>
        )}
      </div>
    </div>
  );
}

function ArrangementCalendarView({
  arrangements,
  locale,
  onOpen,
}: {
  arrangements: ArrangementItem[];
  locale: string;
  onOpen: (arrangementId: string) => void;
}) {
  const { t } = usePreferences();
  const explicitGroups = React.useMemo(
    () => buildCalendarDayGroups(arrangements, locale),
    [arrangements, locale]
  );
  const fuzzyArrangements = React.useMemo(
    () =>
      arrangements
        .filter(
          (arrangement) =>
            arrangement.status !== "ignored" &&
            arrangement.status !== "completed" &&
            !isCalendarExplicitArrangement(arrangement)
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [arrangements]
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5 pt-2">
      <section className="rounded-[18px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3">
        <div>
          <h2 className="text-[15px] font-semibold leading-6 text-text">
            {t("arrangements.calendarTitle")}
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-text-tertiary">
            {t("arrangements.calendarDesc")}
          </p>
        </div>

        {explicitGroups.length > 0 ? (
          <div className="mt-3 space-y-3">
            {explicitGroups.map((group) => (
              <div key={group.dayKey}>
                <p className="mb-1.5 text-[12px] font-medium leading-5 text-text-tertiary">
                  {group.dayLabel}
                </p>
                <div className="space-y-1.5">
                  {group.arrangements.map((arrangement) => (
                    <CalendarArrangementRow
                      key={arrangement.id}
                      arrangement={arrangement}
                      locale={locale}
                      onOpen={() => onOpen(arrangement.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-[14px] bg-surface-muted px-3 py-3 text-[13px] leading-5 text-text-tertiary">
            {t("arrangements.calendarEmpty")}
          </p>
        )}
      </section>

      <section className="mt-3 rounded-[18px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3">
        <h2 className="text-[15px] font-semibold leading-6 text-text">
          {t("arrangements.calendarFuzzyTitle")}
        </h2>
        <p className="mt-1 text-[12px] leading-5 text-text-tertiary">
          {t("arrangements.calendarFuzzyDesc")}
        </p>
        {fuzzyArrangements.length > 0 ? (
          <div className="mt-3 space-y-1.5">
            {fuzzyArrangements.map((arrangement) => (
              <button
                key={arrangement.id}
                type="button"
                className="w-full rounded-[14px] bg-surface-muted px-3 py-2 text-left transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
                onClick={() => onOpen(arrangement.id)}
              >
                <p className="break-words text-[13px] font-medium leading-5 text-text">
                  {arrangement.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-5 text-text-tertiary">
                  {formatArrangementTime(arrangement, locale, t)}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-[14px] bg-surface-muted px-3 py-3 text-[13px] leading-5 text-text-tertiary">
            {t("arrangements.calendarFuzzyEmpty")}
          </p>
        )}
      </section>
    </div>
  );
}

function CalendarArrangementRow({
  arrangement,
  locale,
  onOpen,
}: {
  arrangement: ArrangementItem;
  locale: string;
  onOpen: () => void;
}) {
  const { t } = usePreferences();
  const statusMeta = getStatusMeta(arrangement.status, t);

  return (
    <button
      type="button"
      className="w-full rounded-[14px] bg-surface-muted px-3 py-2 text-left transition-colors hover:bg-fill-4 focus-visible:shadow-focus focus-visible:outline-none"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-[13px] font-medium leading-5 text-text">
            {arrangement.title}
          </p>
          <p className="mt-0.5 text-[12px] leading-5 text-text-tertiary">
            {formatArrangementTime(arrangement, locale, t)}
          </p>
          {arrangement.reminder.enabled && arrangement.reminder.remindAt && (
            <p className="mt-0.5 text-[12px] leading-5 text-text-tertiary">
              {formatReminderLabel(arrangement.reminder.remindAt, locale, t)}
            </p>
          )}
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", statusMeta.className)}>
          {statusMeta.label}
        </span>
      </div>
    </button>
  );
}

function ArrangementFormScreen({
  mode,
  arrangement,
  locale,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "edit";
  arrangement?: ArrangementItem;
  locale: string;
  onCancel: () => void;
  onSubmit: (draft: ArrangementDraft) => void;
}) {
  const { t } = usePreferences();
  const initialTimeDraft = React.useMemo(
    () => getTimeDraftFromArrangement(arrangement, locale, t),
    [arrangement, locale, t]
  );
  const [title, setTitle] = React.useState(arrangement?.title ?? "");
  const [timeType, setTimeType] = React.useState<ArrangementFormTimeType>(
    initialTimeDraft.timeType
  );
  const [fuzzyTimeLabel, setFuzzyTimeLabel] = React.useState(
    initialTimeDraft.fuzzyTimeLabel
  );
  const [dateValue, setDateValue] = React.useState(initialTimeDraft.dateValue);
  const [dateTimeValue, setDateTimeValue] = React.useState(
    initialTimeDraft.dateTimeValue
  );
  const [dueValue, setDueValue] = React.useState(initialTimeDraft.dueValue);
  const [reminderEnabled, setReminderEnabled] = React.useState(
    initialTimeDraft.reminderEnabled
  );
  const [reminderOffsetMinutes, setReminderOffsetMinutes] = React.useState(
    initialTimeDraft.reminderOffsetMinutes
  );
  const [note, setNote] = React.useState(arrangement?.note ?? "");
  const [showTitleHint, setShowTitleHint] = React.useState(false);
  const isTitleReady = title.trim().length > 0;
  const canSetReminder = isExplicitReminderTimeType(timeType);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isTitleReady) {
      setShowTitleHint(true);
      return;
    }

    onSubmit({
      title,
      note,
      timeType,
      fuzzyTimeLabel,
      dateValue,
      dateTimeValue,
      dueValue,
      reminderEnabled: canSetReminder && reminderEnabled,
      reminderOffsetMinutes,
    });
  };

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="shrink-0 border-b border-[var(--record-card-border)] bg-bg px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="rounded-full px-2 py-1 text-[13px] leading-5 text-text-muted transition-colors hover:bg-surface-muted focus-visible:shadow-focus focus-visible:outline-none"
            onClick={onCancel}
          >
            {t("arrangements.back")}
          </button>
          <h1 className="text-[16px] font-semibold leading-6 text-text">
            {mode === "create"
              ? t("arrangements.createTitle")
              : t("arrangements.editTitle")}
          </h1>
          <span className="w-[44px]" aria-hidden="true" />
        </div>
      </header>

      <form className="min-h-0 flex-1 overflow-y-auto px-4 py-5" onSubmit={handleSubmit}>
        <div className="space-y-4">
          <label className="block">
            <span className="text-[13px] font-medium leading-5 text-text-muted">
              {t("arrangements.formTitle")}
            </span>
            <input
              className="mt-2 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (showTitleHint) setShowTitleHint(false);
              }}
              placeholder={t("arrangements.formTitlePlaceholder")}
              autoFocus
            />
            {showTitleHint && (
              <span className="mt-1.5 block text-[12px] leading-5 text-text-tertiary">
                {t("arrangements.formTitleRequired")}
              </span>
            )}
          </label>

          <fieldset className="block">
            <legend className="text-[13px] font-medium leading-5 text-text-muted">
              {t("arrangements.formTime")}
            </legend>
            <div className="mt-2 grid grid-cols-3 gap-1 rounded-[16px] bg-surface-muted p-1">
              {arrangementFormTimeTypes.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "rounded-[12px] px-2 py-2 text-[12px] font-medium leading-4 transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                    timeType === item
                      ? "bg-surface text-text shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
                      : "text-text-tertiary hover:text-text-muted"
                  )}
                  onClick={() => setTimeType(item)}
                >
                  {t(`arrangements.timeType.${item}`)}
                </button>
              ))}
            </div>

            {timeType === "fuzzy" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {fuzzyTimeKeys.map((key) => {
                  const label = t(`arrangements.fuzzy.${key}`);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[12px] font-medium leading-4 transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                        fuzzyTimeLabel === label
                          ? "bg-primary-soft text-primary"
                          : "bg-surface text-text-muted"
                      )}
                      onClick={() => setFuzzyTimeLabel(label)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {timeType === "date" && (
              <input
                className="mt-3 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
              />
            )}

            {timeType === "datetime" && (
              <input
                className="mt-3 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
                type="datetime-local"
                value={dateTimeValue}
                onChange={(event) => setDateTimeValue(event.target.value)}
              />
            )}

            {timeType === "due" && (
              <input
                className="mt-3 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
                type="datetime-local"
                value={dueValue}
                onChange={(event) => setDueValue(event.target.value)}
              />
            )}

            <p className="mt-2 text-[12px] leading-5 text-text-tertiary">
              {t("arrangements.formTimeHelp")}
            </p>
          </fieldset>

          <section className="rounded-[16px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium leading-5 text-text-muted">
                  {t("arrangements.reminderTitle")}
                </p>
                <p className="mt-1 text-[12px] leading-5 text-text-tertiary">
                  {canSetReminder
                    ? t("arrangements.reminderDesc")
                    : t("arrangements.reminderNeedsTime")}
                </p>
              </div>
              <button
                type="button"
                className={cn(
                  "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                  reminderEnabled && canSetReminder ? "bg-primary" : "bg-fill-4",
                  !canSetReminder && "opacity-60"
                )}
                disabled={!canSetReminder}
                aria-pressed={reminderEnabled && canSetReminder}
                onClick={() => setReminderEnabled((enabled) => !enabled)}
              >
                <span
                  className={cn(
                    "absolute top-1 h-5 w-5 rounded-full bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.2)] transition-transform",
                    reminderEnabled && canSetReminder
                      ? "translate-x-[22px]"
                      : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {canSetReminder && reminderEnabled && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {reminderOffsetOptions.map((offset) => (
                  <button
                    key={offset}
                    type="button"
                    className={cn(
                      "rounded-full px-3 py-2 text-[12px] font-medium leading-4 transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                      reminderOffsetMinutes === offset
                        ? "bg-primary-soft text-primary"
                        : "bg-surface-muted text-text-muted"
                    )}
                    onClick={() => setReminderOffsetMinutes(offset)}
                  >
                    {formatReminderOffsetLabel(offset, t)}
                  </button>
                ))}
              </div>
            )}
          </section>

          <label className="block">
            <span className="text-[13px] font-medium leading-5 text-text-muted">
              {t("arrangements.formNote")}
            </span>
            <textarea
              className="mt-2 min-h-[112px] w-full resize-none rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("arrangements.formNotePlaceholder")}
            />
          </label>
        </div>

        <div className="mt-6 flex gap-2.5">
          <Button type="submit" className="h-11 flex-1 rounded-full">
            {mode === "create"
              ? t("arrangements.createSubmit")
              : t("arrangements.editSubmit")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-full px-4"
            onClick={onCancel}
          >
            {t("arrangements.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ArrangementDetailScreen({
  arrangement,
  locale,
  onBack,
  onEdit,
  onComplete,
  onUndoComplete,
  onMoveLater,
  onRestore,
  onContinueFocus,
  onIgnore,
  onMarkAIWrong,
}: {
  arrangement: ArrangementItem;
  locale: string;
  onBack: () => void;
  onEdit: () => void;
  onComplete: () => void;
  onUndoComplete: () => void;
  onMoveLater: () => void;
  onRestore: () => void;
  onContinueFocus: () => void;
  onIgnore: () => void;
  onMarkAIWrong: () => void;
}) {
  const { t } = usePreferences();
  const statusMeta = getStatusMeta(arrangement.status, t);
  const overdueLabel = getGentleOverdueLabel(arrangement, locale, t);

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="shrink-0 border-b border-[var(--record-card-border)] bg-bg px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="rounded-full px-2 py-1 text-[13px] leading-5 text-text-muted transition-colors hover:bg-surface-muted focus-visible:shadow-focus focus-visible:outline-none"
            onClick={onBack}
          >
            {t("arrangements.back")}
          </button>
          <h1 className="text-[16px] font-semibold leading-6 text-text">
            {t("arrangements.detailTitle")}
          </h1>
          <button
            type="button"
            className="rounded-full px-2 py-1 text-[13px] leading-5 text-primary transition-colors hover:bg-primary-soft focus-visible:shadow-focus focus-visible:outline-none"
            onClick={onEdit}
          >
            {t("arrangements.edit")}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <section className="rounded-[18px] border border-[var(--record-card-border)] bg-surface px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <h2 className="min-w-0 flex-1 break-words text-[20px] font-semibold leading-7 text-text">
              {arrangement.title}
            </h2>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[12px] leading-4",
                statusMeta.className
              )}
            >
              {statusMeta.label}
            </span>
          </div>
          <div className="mt-3 inline-flex rounded-full bg-surface-muted px-2.5 py-1 text-[12px] leading-5 text-text-muted">
            {formatArrangementTime(arrangement, locale, t)}
          </div>
          {arrangement.note ? (
            <p className="mt-4 whitespace-pre-wrap break-words text-[14px] leading-6 text-text-muted">
              {arrangement.note}
            </p>
          ) : (
            <p className="mt-4 text-[14px] leading-6 text-text-tertiary">
              {t("arrangements.noNote")}
            </p>
          )}
        </section>

        <section className="mt-3 rounded-[18px] border border-[var(--record-card-border)] bg-surface px-4 py-3">
          <DetailRow
            label={t("arrangements.detailStatus")}
            value={statusMeta.label}
          />
          <DetailRow
            label={t("arrangements.detailTime")}
            value={formatArrangementTime(arrangement, locale, t)}
          />
          <DetailRow
            label={t("arrangements.detailReminder")}
            value={formatArrangementReminder(arrangement, locale, t)}
          />
          <DetailRow
            label={t("arrangements.detailCreatedAt")}
            value={formatFullDateTime(arrangement.createdAt, locale)}
          />
          <DetailRow
            label={t("arrangements.detailUpdatedAt")}
            value={formatFullDateTime(arrangement.updatedAt, locale)}
            last
          />
        </section>

        <section className="mt-3 rounded-[18px] border border-[var(--record-card-border)] bg-surface px-4 py-3">
          <p className="text-[13px] font-medium leading-5 text-text-muted">
            {t("arrangements.sourceContext")}
          </p>
          {arrangement.sourceContext && arrangement.sourceContext.sourceType !== "manual" ? (
            <div className="mt-2 space-y-2">
              <p className="rounded-[14px] bg-surface-muted px-3 py-2 text-[14px] leading-6 text-text-muted">
                {arrangement.sourceContext.sourceLabel || t("arrangements.sourceSelfChat")}
              </p>
              <div className="rounded-[14px] bg-surface-muted px-3 py-2">
                <p className="text-[12px] font-medium leading-5 text-text-tertiary">
                  {t("arrangements.sourceOriginal")}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-text-muted">
                  {arrangement.sourceContext.messageContent}
                </p>
              </div>
              {arrangement.sourceContext.requestMessageContent && (
                <div className="rounded-[14px] bg-surface-muted px-3 py-2">
                  <p className="text-[12px] font-medium leading-5 text-text-tertiary">
                    {t("arrangements.sourceRequest")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-text-muted">
                    {arrangement.sourceContext.requestMessageContent}
                  </p>
                </div>
              )}
              {arrangement.sourceContext.commitmentMessageContent && (
                <div className="rounded-[14px] bg-surface-muted px-3 py-2">
                  <p className="text-[12px] font-medium leading-5 text-text-tertiary">
                    {t("arrangements.sourceCommitment")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-6 text-text-muted">
                    {arrangement.sourceContext.commitmentMessageContent}
                  </p>
                </div>
              )}
              {arrangement.sourceContext.executor && (
                <DetailRow
                  label={t("arrangements.sourceExecutor")}
                  value={arrangement.sourceContext.executor}
                />
              )}
              {arrangement.sourceContext.beneficiary && (
                <DetailRow
                  label={t("arrangements.sourceBeneficiary")}
                  value={arrangement.sourceContext.beneficiary}
                />
              )}
              <DetailRow
                label={t("arrangements.sourceDetectedAt")}
                value={
                  arrangement.sourceContext.detectedAt
                    ? formatFullDateTime(arrangement.sourceContext.detectedAt, locale)
                    : t("arrangements.timeUnset")
                }
              />
              <DetailRow
                label={t("arrangements.sourceConfidence")}
                value={
                  arrangement.sourceContext.confidence !== null
                    ? `${Math.round(arrangement.sourceContext.confidence * 100)}%`
                    : "-"
                }
                last
              />
            </div>
          ) : (
            <p className="mt-2 rounded-[14px] bg-surface-muted px-3 py-2 text-[14px] leading-6 text-text-muted">
              {t("arrangements.sourceManual")}
            </p>
          )}
        </section>

        {arrangement.status === "later" && (
          <p className="mt-3 rounded-[18px] bg-primary-soft px-4 py-3 text-[13px] leading-5 text-primary">
            {t("arrangements.laterHint")}
          </p>
        )}
        {overdueLabel && (
          <section className="mt-3 rounded-[18px] bg-surface-muted px-4 py-3">
            <p className="text-[13px] font-medium leading-5 text-text-muted">
              {overdueLabel}
            </p>
            <p className="mt-1 text-[13px] leading-5 text-text-tertiary">
              {t("arrangements.overdueQuestion")}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Button className="h-10 rounded-full px-2 text-[12px]" onClick={onComplete}>
                {t("arrangements.completeShort")}
              </Button>
              <Button
                className="h-10 rounded-full px-2 text-[12px]"
                variant="secondary"
                onClick={onContinueFocus}
              >
                {t("arrangements.continueFocus")}
              </Button>
              <Button
                className="h-10 rounded-full px-2 text-[12px]"
                variant="secondary"
                onClick={onMoveLater}
              >
                {t("arrangements.status.later")}
              </Button>
            </div>
          </section>
        )}

        <div className="mt-4 flex flex-col gap-2.5 pb-4">
          {arrangement.status === "completed" ? (
            <Button className="h-11 rounded-full" onClick={onUndoComplete}>
              {t("arrangements.undoComplete")}
            </Button>
          ) : arrangement.status === "later" ? (
            <Button className="h-11 rounded-full" onClick={onRestore}>
              {t("arrangements.restore")}
            </Button>
          ) : overdueLabel ? null : (
            <>
              <Button className="h-11 rounded-full" onClick={onComplete}>
                {t("arrangements.complete")}
              </Button>
              <Button className="h-11 rounded-full" variant="secondary" onClick={onMoveLater}>
                {t("arrangements.moveLater")}
              </Button>
            </>
          )}
          <Button className="h-11 rounded-full" variant="secondary" onClick={onEdit}>
            {t("arrangements.edit")}
          </Button>
          <Button className="h-11 rounded-full" variant="ghost" onClick={onIgnore}>
            {t("arrangements.ignore")}
          </Button>
          {arrangement.sourceContext && arrangement.sourceContext.sourceType !== "manual" && (
            <Button className="h-11 rounded-full" variant="ghost" onClick={onMarkAIWrong}>
              {t("arrangements.markAIWrong")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 py-2.5",
        !last && "border-b border-[var(--record-card-border)]"
      )}
    >
      <span className="shrink-0 text-[13px] leading-5 text-text-tertiary">{label}</span>
      <span className="min-w-0 break-words text-right text-[13px] leading-5 text-text-muted">
        {value}
      </span>
    </div>
  );
}

function getStatusMeta(
  status: ArrangementStatus,
  t: ReturnType<typeof usePreferences>["t"]
) {
  if (status === "completed") {
    return {
      label: t("arrangements.status.completed"),
      className: "bg-fill-4 text-text-tertiary",
    };
  }

  if (status === "later") {
    return {
      label: t("arrangements.status.later"),
      className: "bg-surface-muted text-text-muted",
    };
  }

  if (status === "ignored") {
    return {
      label: t("arrangements.status.ignored"),
      className: "bg-fill-4 text-text-disabled",
    };
  }

  return {
    label: t("arrangements.status.pending"),
    className: "bg-primary-soft text-primary",
  };
}

function recordArrangementFeedback(
  arrangement: ArrangementItem,
  action: "edited" | "ignored" | "wrong"
) {
  const sourceContext = arrangement.sourceContext;
  if (!sourceContext || sourceContext.sourceType === "manual") return;

  if (sourceContext.candidateId) {
    updateArrangementAICandidateStatus(sourceContext.candidateId, action, arrangement.id);
  }

  recordArrangementAIFeedback({
    action,
    scene: sourceContext.sourceType,
    sourceMessageId: sourceContext.messageId,
    sourceText: sourceContext.messageContent,
    arrangementId: arrangement.id,
    ...(sourceContext.candidateId ? { candidateId: sourceContext.candidateId } : {}),
  });
}

function formatArrangementTime(
  arrangement: ArrangementItem,
  locale: string,
  t: ReturnType<typeof usePreferences>["t"]
) {
  if (arrangement.timeType === "fuzzy") {
    return arrangement.fuzzyTimeLabel || t("arrangements.fuzzy.near");
  }

  if (arrangement.timeType === "date" && arrangement.startTime) {
    return formatDateOnly(arrangement.startTime, locale);
  }

  if (arrangement.timeType === "datetime" && arrangement.startTime) {
    return formatShortDateTime(arrangement.startTime, locale);
  }

  if (arrangement.timeType === "range" && arrangement.startTime && arrangement.endTime) {
    return `${formatShortDateTime(arrangement.startTime, locale)} - ${formatShortDateTime(
      arrangement.endTime,
      locale
    )}`;
  }

  if (arrangement.timeType === "due" && arrangement.dueTime) {
    return `${t("arrangements.timeDuePrefix")}${formatShortDateTime(
      arrangement.dueTime,
      locale
    )}`;
  }

  if (arrangement.startTime) return formatShortDateTime(arrangement.startTime, locale);

  return t("arrangements.timeUnset");
}

function formatArrangementReminder(
  arrangement: ArrangementItem,
  locale: string,
  t: ReturnType<typeof usePreferences>["t"]
) {
  if (!arrangement.reminder.enabled || !arrangement.reminder.remindAt) {
    return t("arrangements.reminderNone");
  }

  return formatReminderLabel(arrangement.reminder.remindAt, locale, t);
}

function formatReminderLabel(
  remindAt: number,
  locale: string,
  t: ReturnType<typeof usePreferences>["t"]
) {
  return `${t("arrangements.reminderPrefix")}${formatShortDateTime(remindAt, locale)}`;
}

function formatReminderOffsetLabel(
  offsetMinutes: number,
  t: ReturnType<typeof usePreferences>["t"]
) {
  if (offsetMinutes === 0) return t("arrangements.reminderAtTime");
  if (offsetMinutes < 60) {
    return t("arrangements.reminderBeforeMinutes").replace(
      "{minutes}",
      String(offsetMinutes)
    );
  }
  if (offsetMinutes === 60) return t("arrangements.reminderBeforeOneHour");
  if (offsetMinutes === 60 * 24) return t("arrangements.reminderBeforeOneDay");

  return t("arrangements.reminderBeforeMinutes").replace(
    "{minutes}",
    String(offsetMinutes)
  );
}

function isExplicitReminderTimeType(timeType: ArrangementFormTimeType) {
  return timeType === "date" || timeType === "datetime" || timeType === "due";
}

function getTimeDraftFromArrangement(
  arrangement: ArrangementItem | undefined,
  _locale: string,
  t: ReturnType<typeof usePreferences>["t"]
): Pick<
  ArrangementDraft,
  | "timeType"
  | "fuzzyTimeLabel"
  | "dateValue"
  | "dateTimeValue"
  | "dueValue"
  | "reminderEnabled"
  | "reminderOffsetMinutes"
> {
  const fallback = {
    timeType: "none" as ArrangementDraftTimeType,
    fuzzyTimeLabel: t("arrangements.fuzzy.near"),
    dateValue: "",
    dateTimeValue: "",
    dueValue: "",
    reminderEnabled: false,
    reminderOffsetMinutes: 30,
  };

  if (!arrangement) return fallback;

  const reminderFields = {
    reminderEnabled: arrangement.reminder.enabled,
    reminderOffsetMinutes: arrangement.reminder.offsetMinutes ?? 30,
  };

  if (arrangement.timeType === "fuzzy") {
    return {
      ...fallback,
      ...reminderFields,
      timeType: "fuzzy",
      fuzzyTimeLabel: arrangement.fuzzyTimeLabel || t("arrangements.fuzzy.near"),
    };
  }

  if (arrangement.timeType === "date" && arrangement.startTime) {
    return {
      ...fallback,
      ...reminderFields,
      timeType: "date",
      dateValue: formatDateInputValue(arrangement.startTime),
    };
  }

  if (arrangement.timeType === "datetime" && arrangement.startTime) {
    return {
      ...fallback,
      ...reminderFields,
      timeType: "datetime",
      dateTimeValue: formatDateTimeInputValue(arrangement.startTime),
    };
  }

  if (arrangement.timeType === "due" && arrangement.dueTime) {
    return {
      ...fallback,
      ...reminderFields,
      timeType: "due",
      dueValue: formatDateTimeInputValue(arrangement.dueTime),
    };
  }

  if (arrangement.timeType === "range" && arrangement.startTime) {
    return {
      ...fallback,
      ...reminderFields,
      timeType: "datetime",
      dateTimeValue: formatDateTimeInputValue(arrangement.startTime),
    };
  }

  return {
    ...fallback,
    ...reminderFields,
  };
}

function formatShortDateTime(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatDateOnly(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
  }).format(new Date(timestamp));
}

function formatFullDateTime(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatArrangementCount(count: number, label: string) {
  return `${count}${label}`;
}

function getGentleOverdueLabel(
  arrangement: ArrangementItem,
  locale: string,
  t: ReturnType<typeof usePreferences>["t"]
) {
  if (arrangement.status !== "pending") return null;

  const plannedTime = getArrangementPlannedTime(arrangement);
  if (plannedTime === null || plannedTime >= Date.now()) return null;

  if (isSameLocalDay(plannedTime, addDays(startOfToday(), -1))) {
    return t("arrangements.overdueYesterday");
  }

  if (isSameLocalDay(plannedTime, startOfToday())) {
    return t("arrangements.overdueToday");
  }

  if (isInPreviousLocalWeek(plannedTime)) {
    return t("arrangements.overdueLastWeek");
  }

  return `${t("arrangements.overduePrefix")}${formatShortDateTime(plannedTime, locale)}`;
}

function getArrangementPlannedTime(arrangement: ArrangementItem) {
  if (arrangement.timeType === "due") return arrangement.dueTime;
  if (arrangement.timeType === "date") return arrangement.endTime ?? arrangement.startTime;
  if (arrangement.timeType === "datetime") return arrangement.startTime;
  if (arrangement.timeType === "range") return arrangement.endTime ?? arrangement.startTime;
  return null;
}

function getArrangementCalendarTime(arrangement: ArrangementItem) {
  if (arrangement.timeType === "due") return arrangement.dueTime;
  if (arrangement.timeType === "date") return arrangement.startTime;
  if (arrangement.timeType === "datetime") return arrangement.startTime;
  if (arrangement.timeType === "range") return arrangement.startTime;
  return null;
}

function isCalendarExplicitArrangement(arrangement: ArrangementItem) {
  return getArrangementCalendarTime(arrangement) !== null;
}

function buildCalendarDayGroups(arrangements: ArrangementItem[], locale: string) {
  const groups = new Map<string, CalendarDayGroup>();

  arrangements
    .filter(
      (arrangement) =>
        arrangement.status !== "ignored" && isCalendarExplicitArrangement(arrangement)
    )
    .sort((a, b) => {
      const aTime = getArrangementCalendarTime(a) ?? 0;
      const bTime = getArrangementCalendarTime(b) ?? 0;
      return aTime - bTime;
    })
    .forEach((arrangement) => {
      const calendarTime = getArrangementCalendarTime(arrangement);
      if (calendarTime === null) return;

      const dayKey = formatDateInputValue(calendarTime);
      const existingGroup = groups.get(dayKey);
      if (existingGroup) {
        existingGroup.arrangements.push(arrangement);
        return;
      }

      groups.set(dayKey, {
        dayKey,
        dayLabel: formatCalendarDayLabel(calendarTime, locale),
        arrangements: [arrangement],
      });
    });

  return Array.from(groups.values());
}

function formatCalendarDayLabel(timestamp: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(timestamp));
}

function isSameLocalDay(timestamp: number, date: Date) {
  const value = new Date(timestamp);
  return (
    value.getFullYear() === date.getFullYear() &&
    value.getMonth() === date.getMonth() &&
    value.getDate() === date.getDate()
  );
}

function isInPreviousLocalWeek(timestamp: number) {
  const startOfWeek = startOfCurrentWeek();
  const startOfPreviousWeek = addDays(startOfWeek, -7);
  return timestamp >= startOfPreviousWeek.getTime() && timestamp < startOfWeek.getTime();
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfCurrentWeek() {
  const date = startOfToday();
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatDateInputValue(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(
    date.getDate()
  )}`;
}

function formatDateTimeInputValue(timestamp: number) {
  const date = new Date(timestamp);
  return `${formatDateInputValue(timestamp)}T${padDatePart(
    date.getHours()
  )}:${padDatePart(date.getMinutes())}`;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function sortArrangementsByScope(
  a: ArrangementItem,
  b: ArrangementItem,
  scope: ArrangementListScope
) {
  if (scope === "pending") {
    const statusDiff =
      arrangementStatusOrder[a.status] - arrangementStatusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    const aTime = a.dueTime ?? a.startTime ?? a.updatedAt;
    const bTime = b.dueTime ?? b.startTime ?? b.updatedAt;
    return aTime - bTime;
  }

  return b.updatedAt - a.updatedAt;
}
