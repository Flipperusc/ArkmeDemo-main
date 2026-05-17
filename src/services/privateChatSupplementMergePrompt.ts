import type {
  PrivateChatSupplementMergeInput,
  PrivateChatSupplementMergeResult,
} from "@/types/arrangementAI";
import type { DeepSeekMessage } from "@/types/ai";

export const privateChatSupplementMergeJSONExample: PrivateChatSupplementMergeResult = {
  shouldMerge: true,
  confidence: 0.84,
  targetArrangementId: "arrangement-ai-1",
  mergeType: "add_items",
  addedItems: ["咖啡", "文件"],
  updatedFields: {},
  newTitle: "明天到公司帮张三带早餐、咖啡和文件",
  sourceMessageIds: ["supplement-message-1", "supplement-message-2", "commitment-message-2"],
  reason: "新消息是在同一私聊里对已有带早餐承诺继续补充物品，当前用户没有拒绝并再次答应。",
  needsUserConfirmation: false,
};

export function buildPrivateChatSupplementMergePrompt(
  input: PrivateChatSupplementMergeInput
): {
  messages: DeepSeekMessage[];
  jsonExample: PrivateChatSupplementMergeResult;
} {
  return {
    jsonExample: privateChatSupplementMergeJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是私聊安排补充合并识别器，不是聊天助手。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字，不输出寒暄。",
          "你的任务是判断当前私聊新消息和最近上下文，是否应该合并进某一条已有 private_chat commitment 安排。",
          "只能在同一私聊对象、同一承诺语境、短时间连续补充时合并。",
          "可合并的补充包括补充物品、补充地点、补充时间或补充要求。",
          "如果当前用户拒绝、推脱、说不行、没有空，shouldMerge=false，mergeType=ignore。",
          "如果新消息是完全不同主题，例如从带早餐变成晚上打游戏，shouldMerge=false，mergeType=ignore。",
          "如果无法确定目标安排，shouldMerge=false，mergeType=ignore。",
          "不要把多个不同安排强行合并。不要编造未出现的信息。",
          "targetArrangementId 必须来自候选已有安排 id。",
          "sourceMessageIds 必须只包含输入消息 id，优先包含补充消息和当前用户确认消息。",
          "字段必须完整。未知字段使用空字符串、空数组或空对象，不要省略字段。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请判断当前私聊新消息是否是已有安排的补充，只返回 json。",
          `输出 JSON 示例：${JSON.stringify(privateChatSupplementMergeJSONExample)}`,
          `当前时间：${input.now}`,
          `时区：${input.timezone || "Asia/Shanghai"}`,
          `当前用户：${input.currentUserName || input.currentUserId} (${input.currentUserId})`,
          `对方用户：${input.otherUserName || input.otherUserId} (${input.otherUserId})`,
          `当前新消息：${JSON.stringify(input.currentMessage)}`,
          `最近私聊上下文：${JSON.stringify(input.messages)}`,
          `候选已有安排：${JSON.stringify(summarizeCandidateArrangements(input))}`,
        ].join("\n"),
      },
    ],
  };
}

function summarizeCandidateArrangements(input: PrivateChatSupplementMergeInput) {
  return input.candidateArrangements.slice(0, 8).map((arrangement) => ({
    id: arrangement.id,
    title: arrangement.title,
    note: arrangement.note,
    status: arrangement.status,
    timeType: arrangement.timeType,
    fuzzyTimeLabel: arrangement.fuzzyTimeLabel,
    startTime: arrangement.startTime,
    endTime: arrangement.endTime,
    dueTime: arrangement.dueTime,
    location: arrangement.location,
    items: arrangement.items,
    sourceLabel: arrangement.sourceContext?.sourceLabel ?? "",
    sourceMessageIds: arrangement.sourceMessageIds,
    recentContexts: arrangement.relatedContexts.slice(-8),
  }));
}
