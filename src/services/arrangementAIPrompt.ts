import type {
  ArrangementCandidateEntity,
  ArrangementCandidateInput,
  ArrangementCandidateResult,
} from "@/types/arrangementAI";
import type { DeepSeekMessage } from "@/types/ai";

export const emptyArrangementCandidate: ArrangementCandidateEntity = {
  title: "",
  summary: "",
  type: "unknown",
  status: "pending",
  timeType: "none",
  fuzzyTimeLabel: "",
  startTime: null,
  endTime: null,
  dueTime: null,
  location: "",
  relatedPeople: [],
  executor: "",
  beneficiary: "",
  items: [],
  sourceType: "",
  sourceMessageIds: [],
};

export const arrangementCandidateJSONExample: ArrangementCandidateResult = {
  hasArrangement: true,
  action: "create",
  confidence: 0.86,
  arrangement: {
    title: "明天上午 10 点开会",
    summary: "用户需要在明天上午参加会议。",
    type: "schedule",
    status: "pending",
    timeType: "datetime",
    fuzzyTimeLabel: "",
    startTime: "2026-05-18T10:00:00+08:00",
    endTime: null,
    dueTime: null,
    location: "",
    relatedPeople: [],
    executor: "",
    beneficiary: "",
    items: ["开会"],
    sourceType: "manual_text",
    sourceMessageIds: ["message-1"],
  },
  needsUserConfirmation: false,
  reason: "文本中有明确的未来事项和时间。",
  risks: [],
};

export function buildArrangementCandidatePrompt(input: ArrangementCandidateInput): {
  messages: DeepSeekMessage[];
  jsonExample: ArrangementCandidateResult;
} {
  return {
    jsonExample: arrangementCandidateJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是安排识别器，不是聊天助手。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字，不输出寒暄。",
          "「安排」不是普通任务，而是未来可能需要用户关注、执行、赴约、履行、跟进、被提醒或由 AI 协助完成的事项。",
          "不要过度创建安排。低置信度、语义不完整或需要用户确认时，action 使用 needs_confirmation，needsUserConfirmation 使用 true。",
          "不要把玩笑、寒暄、情绪表达、语气词、无意义符号误判为安排。",
          "字段必须完整。未知字段使用 null、空字符串或空数组，不要省略字段。",
          "所有能解析为绝对时间的时间都输出 ISO 字符串；只有模糊时间时使用 fuzzyTimeLabel。",
          "不要编造未出现的信息。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请从以下输入中识别是否存在安排，只返回 json。",
          `输出 JSON 示例：${JSON.stringify(arrangementCandidateJSONExample)}`,
          `当前时间：${input.now}`,
          `时区：${input.timezone || "Asia/Shanghai"}`,
          `场景：${input.scene}`,
          `当前用户：${input.currentUserName || input.currentUserId}`,
          `消息：${JSON.stringify(input.messages)}`,
          `已有安排：${JSON.stringify(summarizeExistingArrangements(input))}`,
        ].join("\n"),
      },
    ],
  };
}

function summarizeExistingArrangements(input: ArrangementCandidateInput) {
  return (input.existingArrangements ?? []).slice(0, 20).map((arrangement) => ({
    id: arrangement.id,
    title: arrangement.title,
    status: arrangement.status,
    timeType: arrangement.timeType,
    fuzzyTimeLabel: arrangement.fuzzyTimeLabel,
    startTime: arrangement.startTime,
    endTime: arrangement.endTime,
    dueTime: arrangement.dueTime,
    sourceMessageIds: arrangement.sourceMessageIds,
  }));
}
