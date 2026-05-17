import {
  emptyArrangementCandidate,
} from "@/services/arrangementAIPrompt";
import type {
  PrivateChatCommitmentInput,
  PrivateChatCommitmentResult,
} from "@/types/arrangementAI";
import type { DeepSeekMessage } from "@/types/ai";

export const privateChatCommitmentJSONExample: PrivateChatCommitmentResult = {
  hasArrangement: true,
  isRelatedToCurrentUser: true,
  hasUserCommitted: true,
  shouldCreate: true,
  confidence: 0.86,
  arrangement: {
    ...emptyArrangementCandidate,
    title: "明天到公司帮张三带早餐",
    summary: "当前用户答应明天到公司时帮张三带早餐。",
    type: "commitment",
    status: "pending",
    timeType: "fuzzy",
    fuzzyTimeLabel: "明天到公司时",
    location: "公司",
    executor: "current_user",
    beneficiary: "other_user",
    relatedPeople: ["张三"],
    items: ["早餐"],
    sourceType: "private_chat",
    sourceMessageIds: ["request-message-id", "commitment-message-id"],
  },
  needsUserConfirmation: false,
  reason: "对方提出请求后，当前用户明确答应，且事项与当前用户后续行动有关。",
  risks: [],
};

export function buildPrivateChatCommitmentPrompt(input: PrivateChatCommitmentInput): {
  messages: DeepSeekMessage[];
  jsonExample: PrivateChatCommitmentResult;
} {
  return {
    jsonExample: privateChatCommitmentJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是私聊承诺识别器，不是聊天助手。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字，不输出寒暄。",
          "你的任务是从私聊上下文中识别「对方请求 - 当前用户承诺」结构，并判断是否应该为当前用户创建安排。",
          "「安排」不是普通任务，而是未来可能需要用户关注、执行、赴约、履行、跟进、被提醒或由 AI 协助完成的事项。",
          "必须同时满足：事项与当前用户有关、当前用户是执行人、当前用户已经明确答应或承诺，才可以 shouldCreate=true。",
          "如果对方只是提出请求但当前用户没有答应，hasUserCommitted=false，shouldCreate=false。",
          "如果当前用户拒绝、推脱、说不行、没有空，hasUserCommitted=false，shouldCreate=false。",
          "如果是对方自己要做的事，不要创建成当前用户安排。",
          "不要把玩笑、寒暄、情绪表达、语气词、无意义符号误判为安排。",
          "不要过度创建安排。低置信度或语义不完整时 needsUserConfirmation=true，shouldCreate=false。",
          "字段必须完整。未知字段使用 null、空字符串或空数组，不要省略字段。",
          "所有能解析为绝对时间的时间都输出 ISO 字符串；只有模糊时间时使用 fuzzyTimeLabel。",
          "sourceMessageIds 必须只包含输入消息里的 id，优先包含对方请求消息和当前用户答应消息。",
          "executor 用 current_user 或 other_user 表示，beneficiary 用 current_user 或 other_user 表示；无法判断时用空字符串。",
          "不要编造未出现的信息。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请从以下私聊上下文中识别当前用户是否刚刚形成了承诺安排，只返回 json。",
          `输出 JSON 示例：${JSON.stringify(privateChatCommitmentJSONExample)}`,
          `当前时间：${input.now}`,
          `时区：${input.timezone || "Asia/Shanghai"}`,
          `当前用户：${input.currentUserName || input.currentUserId} (${input.currentUserId})`,
          `对方用户：${input.otherUserName || input.otherUserId} (${input.otherUserId})`,
          `最近私聊消息：${JSON.stringify(input.messages)}`,
          `已有未完成安排：${JSON.stringify(summarizeExistingArrangements(input))}`,
        ].join("\n"),
      },
    ],
  };
}

function summarizeExistingArrangements(input: PrivateChatCommitmentInput) {
  return (input.existingArrangements ?? [])
    .filter((arrangement) => arrangement.status === "pending")
    .slice(0, 20)
    .map((arrangement) => ({
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
