import { emptyArrangementCandidate } from "@/services/arrangementAIPrompt";
import type {
  GroupChatRelatedArrangementInput,
  GroupChatRelatedArrangementResult,
} from "@/types/arrangementAI";
import type { DeepSeekMessage } from "@/types/ai";

export const groupChatRelatedArrangementJSONExample: GroupChatRelatedArrangementResult = {
  hasArrangement: true,
  isRelatedToCurrentUser: true,
  relationReason: "mentioned",
  hasUserCommitted: false,
  shouldCreate: true,
  confidence: 0.82,
  arrangement: {
    ...emptyArrangementCandidate,
    title: "明天带资料到评审会",
    summary: "群聊中当前用户被点名，需要明天带资料到评审会。",
    type: "commitment",
    status: "pending",
    timeType: "fuzzy",
    fuzzyTimeLabel: "明天",
    executor: "current_user",
    beneficiary: "",
    relatedPeople: ["庄骏", "项目群"],
    items: ["资料"],
    sourceType: "group_chat",
    sourceMessageIds: ["group-message-id"],
  },
  needsUserConfirmation: false,
  reason: "群聊消息明确点名当前用户，并分配了需要当前用户执行的事项。",
  risks: [],
};

export function buildGroupChatRelatedArrangementPrompt(
  input: GroupChatRelatedArrangementInput
): {
  messages: DeepSeekMessage[];
  jsonExample: GroupChatRelatedArrangementResult;
} {
  return {
    jsonExample: groupChatRelatedArrangementJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是群聊中与当前用户相关的安排识别器，不是聊天助手。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字，不输出寒暄。",
          "你的任务不是提取整个群的所有安排，而是只判断群聊上下文里是否出现了与当前用户明确相关的安排。",
          "只处理四类相关关系：1 当前用户被明确点名或 @；2 当前用户主动承诺或说自己来做；3 当前用户被明确分配任务；4 当前用户对和自己有关的任务明确回复确认。",
          "不处理群里别人之间的安排，不处理没有明确执行人的讨论，不处理当前用户没有承诺的请求，不处理全群泛泛提醒。",
          "如果只是「大家记得早点来」「有人来处理吗」「谁方便看一下」且当前用户没有被点名、没有承诺、没有确认，必须 isRelatedToCurrentUser=false，relationReason=not_related，shouldCreate=false。",
          "如果别人互相安排，例如 A 让 B 明天提交材料，即使是明确安排，也不能为当前用户创建。",
          "如果当前用户只是收到一个请求但没有答应、确认或被明确分配，shouldCreate=false。",
          "relationReason 必须是 mentioned、committed、assigned、confirmed、not_related 之一。",
          "hasUserCommitted 只在当前用户自己主动承诺或确认时为 true；被点名或被分配但还没回复时可以为 false。",
          "shouldCreate=true 必须同时满足 hasArrangement=true、isRelatedToCurrentUser=true、事项清楚且 confidence>=0.8。",
          "中等置信度用 needsUserConfirmation=true 且 shouldCreate=false。",
          "不要把玩笑、寒暄、模糊讨论、情绪表达、语气词、无意义符号误判为安排。",
          "字段必须完整。未知字段使用 null、空字符串或空数组，不要省略字段。",
          "所有能解析为绝对时间的时间都输出 ISO 字符串；只有模糊时间时使用 fuzzyTimeLabel。",
          "sourceMessageIds 必须只包含输入消息里的 id，优先包含点名/分配/请求消息和当前用户承诺/确认消息。",
          "executor 用 current_user 表示当前用户；不要为其他群成员创建安排。beneficiary 无法判断时用空字符串。",
          "不要编造未出现的信息。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请从以下群聊上下文中识别是否有与当前用户明确相关的安排，只返回 json。",
          `输出 JSON 示例：${JSON.stringify(groupChatRelatedArrangementJSONExample)}`,
          `当前时间：${input.now}`,
          `时区：${input.timezone || "Asia/Shanghai"}`,
          `当前用户：${input.currentUserName || input.currentUserId} (${input.currentUserId})`,
          `当前用户可能昵称：${JSON.stringify(input.currentUserAliases ?? [])}`,
          `群聊：${input.groupName} (${input.groupId})`,
          `群成员简表：${JSON.stringify(input.memberSummaries ?? [])}`,
          `被 @ / 点名信息：${JSON.stringify(input.mentions ?? [])}`,
          `最近群聊消息：${JSON.stringify(input.messages)}`,
          `现有候选安排：${JSON.stringify(summarizeExistingArrangements(input))}`,
        ].join("\n"),
      },
    ],
  };
}

function summarizeExistingArrangements(input: GroupChatRelatedArrangementInput) {
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
      sourceType: arrangement.sourceType,
      sourceMessageIds: arrangement.sourceMessageIds,
      sourceLabel: arrangement.sourceContext?.sourceLabel,
    }));
}
