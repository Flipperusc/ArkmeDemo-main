import React from "react";
import Button from "@/components/ui/button";
import {
  getArrangementBackfillConversationOptions,
  runArrangementBackfill,
  type ArrangementBackfillConversationKind,
  type ArrangementBackfillConversationOption,
  type ArrangementBackfillResult,
  type ArrangementBackfillTimeRange,
} from "@/services/arrangementAIBackfillService";
import {
  clearAISettings,
  getAISettings,
  saveAISettings,
} from "@/services/aiSettings";
import { testDeepSeekConnection } from "@/services/deepseekClient";
import { cn } from "@/lib/utils";
import {
  defaultAISettings,
  type AIReasoningEffort,
  type AISettings,
  type AIThinkingMode,
} from "@/types/ai";

type AISettingsScreenProps = {
  onBack: () => void;
};

type SaveState = {
  type: "idle" | "success" | "error";
  message: string;
};

const thinkingOptions: Array<{ value: AIThinkingMode; label: string; desc: string }> = [
  { value: "disabled", label: "关闭", desc: "结构化识别默认使用，成本更可控。" },
  { value: "enabled", label: "开启", desc: "预留给复杂合并和跨上下文判断。" },
];

const reasoningEffortOptions: Array<{ value: AIReasoningEffort; label: string }> = [
  { value: "high", label: "high" },
  { value: "max", label: "max" },
];
const backfillTimeRangeOptions: Array<{
  value: ArrangementBackfillTimeRange;
  label: string;
}> = [
  { value: "all", label: "全部时间" },
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];
const backfillLimitOptions = [10, 30, 50, 100] as const;
const backfillConversationKindOptions: Array<{
  value: ArrangementBackfillConversationKind;
  label: string;
}> = [
  { value: "all", label: "全部类型" },
  { value: "self_chat", label: "发给自己" },
  { value: "private_chat", label: "私聊" },
  { value: "group_chat", label: "群聊" },
];

export default function AISettingsScreen({ onBack }: AISettingsScreenProps) {
  const [settings, setSettings] = React.useState<AISettings>(defaultAISettings);
  const [apiKey, setApiKey] = React.useState("");
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [saveState, setSaveState] = React.useState<SaveState>({
    type: "idle",
    message: "",
  });
  const [loading, setLoading] = React.useState(false);
  const [testing, setTesting] = React.useState(false);
  const [backfillTimeRange, setBackfillTimeRange] =
    React.useState<ArrangementBackfillTimeRange>("30d");
  const [backfillLimit, setBackfillLimit] = React.useState(30);
  const [backfillConversationKind, setBackfillConversationKind] =
    React.useState<ArrangementBackfillConversationKind>("all");
  const [backfillConversationId, setBackfillConversationId] = React.useState("all");
  const [conversationOptions, setConversationOptions] = React.useState<
    ArrangementBackfillConversationOption[]
  >([]);
  const [backfillRunning, setBackfillRunning] = React.useState(false);
  const [backfillResult, setBackfillResult] =
    React.useState<ArrangementBackfillResult | null>(null);

  React.useEffect(() => {
    let active = true;

    getAISettings().then((loadedSettings) => {
      if (!active) return;
      setSettings(loadedSettings);
    });

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    setConversationOptions(getArrangementBackfillConversationOptions());
  }, []);

  const filteredConversationOptions = React.useMemo(
    () =>
      conversationOptions.filter(
        (option) =>
          backfillConversationKind === "all" || option.kind === backfillConversationKind
      ),
    [backfillConversationKind, conversationOptions]
  );

  React.useEffect(() => {
    if (
      backfillConversationId !== "all" &&
      !filteredConversationOptions.some((option) => option.id === backfillConversationId)
    ) {
      setBackfillConversationId("all");
    }
  }, [backfillConversationId, filteredConversationOptions]);

  const updateSettings = <Key extends keyof AISettings>(
    key: Key,
    value: AISettings[Key]
  ) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaveState({ type: "idle", message: "" });
  };

  const handleSave = async () => {
    setLoading(true);
    const result = await saveAISettings({
      enableAI: settings.enableAI,
      baseUrl: settings.baseUrl,
      model: settings.model,
      thinkingMode: settings.thinkingMode,
      reasoningEffort: settings.reasoningEffort,
      maxTokens: settings.maxTokens,
      ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
    });
    setLoading(false);

    if (!result.ok) {
      setSaveState({ type: "error", message: result.error.message });
      return;
    }

    setSettings(result.data);
    setApiKey("");
    setSaveState({ type: "success", message: "已保存 AI 设置。" });
  };

  const handleClear = async () => {
    setLoading(true);
    const result = await clearAISettings();
    setLoading(false);
    setSettings(result.ok ? result.data : defaultAISettings);
    setApiKey("");
    setSaveState({ type: "success", message: "已清除 AI 设置。" });
  };

  const handleTest = async () => {
    setTesting(true);
    setSaveState({ type: "idle", message: "" });
    const result = await testDeepSeekConnection();
    setTesting(false);

    if (!result.ok) {
      setSaveState({ type: "error", message: result.error.message });
      return;
    }

    setSaveState({
      type: "success",
      message: `连接可用：${result.data.model}`,
    });
  };

  const handleBackfill = async () => {
    setBackfillRunning(true);
    setBackfillResult(null);
    const result = await runArrangementBackfill({
      timeRange: backfillTimeRange,
      recentLimit: backfillLimit,
      conversationKind: backfillConversationKind,
      conversationId: backfillConversationId,
    });
    setBackfillRunning(false);
    setBackfillResult(result);
    setConversationOptions(getArrangementBackfillConversationOptions());
  };

  const apiKeyHint = settings.hasApiKey
    ? `已保存密钥 ${settings.apiKeyPreview || "••••"}。留空保存会继续使用它。`
    : "未配置 DeepSeek API Key";

  return (
    <div className="relative flex h-full flex-col bg-bg">
      <AISettingsHeader title="AI 设置" onBack={onBack} />

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <section className="rounded-[18px] border border-[var(--record-card-border)] bg-surface px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-[17px] font-semibold leading-6 text-text">
                DeepSeek API
              </h2>
              <p className="mt-1 text-[13px] leading-5 text-text-tertiary">
                AI 识别可能消耗你自己的 DeepSeek token。开启后会在发给自己时尝试识别安排。
              </p>
            </div>
            <button
              type="button"
              className={cn(
                "relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                settings.enableAI ? "bg-primary" : "bg-fill-4"
              )}
              aria-label="启用 AI 识别"
              aria-pressed={settings.enableAI}
              onClick={() => updateSettings("enableAI", !settings.enableAI)}
            >
              <span
                className={cn(
                  "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                  settings.enableAI ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
          </div>
        </section>

        <section className="mt-3 rounded-[18px] border border-[var(--record-card-border)] bg-surface px-4 py-4">
          <AIFieldLabel label="API Key" hint={apiKeyHint} />
          <div className="mt-2 flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSaveState({ type: "idle", message: "" });
              }}
              placeholder="粘贴 DeepSeek API Key"
              autoComplete="off"
            />
            <button
              type="button"
              className="h-11 rounded-[14px] border border-[var(--record-card-border)] px-3 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-muted"
              onClick={() => setShowApiKey((value) => !value)}
            >
              {showApiKey ? "隐藏" : "显示"}
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            <AITextInput
              label="Base URL"
              value={settings.baseUrl}
              onChange={(value) => updateSettings("baseUrl", value)}
            />
            <AITextInput
              label="模型"
              value={settings.model}
              onChange={(value) => updateSettings("model", value)}
            />
            <AINumberInput
              label="maxTokens"
              value={settings.maxTokens}
              onChange={(value) => updateSettings("maxTokens", value)}
            />
          </div>
        </section>

        <section className="mt-3 rounded-[18px] border border-[var(--record-card-border)] bg-surface px-4 py-4">
          <AIFieldLabel
            label="Thinking"
            hint="安排抽取、分类和状态判断默认关闭 Thinking，以优先保证 JSON 稳定和成本可控。"
          />
          <div className="mt-3 grid gap-2">
            {thinkingOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "rounded-[14px] border px-3 py-3 text-left transition-colors",
                  settings.thinkingMode === option.value
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-[var(--record-card-border)] bg-surface text-text"
                )}
                onClick={() => updateSettings("thinkingMode", option.value)}
              >
                <span className="block text-[14px] font-semibold leading-5">
                  {option.label}
                </span>
                <span className="mt-1 block text-[12px] leading-5 text-text-tertiary">
                  {option.desc}
                </span>
              </button>
            ))}
          </div>

          {settings.thinkingMode === "enabled" && (
            <div className="mt-4">
              <AIFieldLabel label="reasoningEffort" />
              <div className="mt-2 grid grid-cols-2 gap-2">
                {reasoningEffortOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "rounded-[14px] px-3 py-2 text-[13px] font-medium transition-colors",
                      settings.reasoningEffort === option.value
                        ? "bg-primary text-on-primary"
                        : "bg-surface-muted text-text-muted"
                    )}
                    onClick={() => updateSettings("reasoningEffort", option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mt-3 rounded-[18px] border border-[var(--record-card-border)] bg-surface px-4 py-4">
          <AIFieldLabel
            label="历史内容重新识别"
            hint="开启 AI 后，可以自己选择一批之前没有识别过的内容重新检查。已创建或已处理过的消息会自动跳过。"
          />

          <div className="mt-3">
            <p className="text-[12px] font-medium leading-5 text-text-tertiary">按时间选择</p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {backfillTimeRangeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "rounded-full px-2 py-2 text-[12px] font-medium transition-colors",
                    backfillTimeRange === option.value
                      ? "bg-primary-soft text-primary"
                      : "bg-surface-muted text-text-muted"
                  )}
                  onClick={() => setBackfillTimeRange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[12px] font-medium leading-5 text-text-tertiary">
              按最近条数选择
            </p>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {backfillLimitOptions.map((limit) => (
                <button
                  key={limit}
                  type="button"
                  className={cn(
                    "rounded-full px-2 py-2 text-[12px] font-medium transition-colors",
                    backfillLimit === limit
                      ? "bg-primary-soft text-primary"
                      : "bg-surface-muted text-text-muted"
                  )}
                  onClick={() => setBackfillLimit(limit)}
                >
                  最近 {limit} 条
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 grid gap-3">
            <label className="block">
              <span className="text-[12px] font-medium leading-5 text-text-tertiary">
                按对话类型
              </span>
              <select
                className="mt-2 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[14px] leading-5 text-text outline-none focus:border-primary"
                value={backfillConversationKind}
                onChange={(event) => {
                  setBackfillConversationKind(
                    event.target.value as ArrangementBackfillConversationKind
                  );
                  setBackfillConversationId("all");
                }}
              >
                {backfillConversationKindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-[12px] font-medium leading-5 text-text-tertiary">
                按具体对话
              </span>
              <select
                className="mt-2 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[14px] leading-5 text-text outline-none focus:border-primary"
                value={backfillConversationId}
                onChange={(event) => setBackfillConversationId(event.target.value)}
              >
                <option value="all">全部对话</option>
                {filteredConversationOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}（{option.count} 条）
                  </option>
                ))}
              </select>
            </label>
          </div>

          {backfillResult && (
            <p
              className={cn(
                "mt-3 rounded-[14px] px-3.5 py-3 text-[13px] leading-5",
                backfillResult.disabled
                  ? "bg-surface-muted text-text-muted"
                  : "bg-primary-soft text-primary"
              )}
            >
              {backfillResult.message}
              {!backfillResult.disabled &&
                ` 失败 ${backfillResult.failed} 条，忽略 ${backfillResult.ignored} 条。`}
            </p>
          )}

          <Button
            type="button"
            className="mt-3 h-11 w-full rounded-[14px]"
            onClick={handleBackfill}
            loading={backfillRunning}
            disabled={loading || testing}
          >
            重新识别所选内容
          </Button>
        </section>

        {saveState.message && (
          <p
            className={cn(
              "mt-3 rounded-[14px] px-3.5 py-3 text-[13px] leading-5",
              saveState.type === "error"
                ? "bg-surface-muted text-text-muted"
                : "bg-primary-soft text-primary"
            )}
          >
            {saveState.message}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 pb-5">
          <Button
            type="button"
            variant="secondary"
            className="h-11 rounded-[14px]"
            onClick={handleTest}
            loading={testing}
          >
            测试连接
          </Button>
          <Button
            type="button"
            className="h-11 rounded-[14px]"
            onClick={handleSave}
            loading={loading}
          >
            保存配置
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="col-span-2 h-11 rounded-[14px] text-text-muted"
            onClick={handleClear}
            disabled={loading || testing}
          >
            清除配置
          </Button>
        </div>
      </div>
    </div>
  );
}

function AISettingsHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex h-14 shrink-0 items-center border-b border-border-light bg-bg px-2">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-full text-text-muted transition hover:bg-hover-overlay active:scale-[0.96]"
        onClick={onBack}
        aria-label="返回"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 className="ml-1 truncate text-[17px] font-semibold leading-5 text-text">
        {title}
      </h1>
    </header>
  );
}

function AIFieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium leading-5 text-text-muted">{label}</span>
      {hint && <span className="mt-1 block text-[12px] leading-5 text-text-tertiary">{hint}</span>}
    </label>
  );
}

function AITextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium leading-5 text-text-muted">{label}</span>
      <input
        className="mt-2 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function AINumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium leading-5 text-text-muted">{label}</span>
      <input
        className="mt-2 w-full rounded-[14px] border border-[var(--record-card-border)] bg-surface px-3.5 py-3 text-[15px] leading-6 text-text outline-none transition-colors placeholder:text-text-disabled focus:border-primary"
        type="number"
        min={256}
        max={8000}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
