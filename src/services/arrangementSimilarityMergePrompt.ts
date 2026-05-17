import type {
  ArrangementSimilarityMergeInput,
  ArrangementSimilarityMergeResult,
} from "@/types/arrangementAI";
import type { DeepSeekMessage } from "@/types/ai";

export const arrangementSimilarityMergeJSONExample: ArrangementSimilarityMergeResult = {
  shouldMerge: true,
  confidence: 0.88,
  targetArrangementId: "arrangement-hospital-1",
  mergeAction: "update_progress",
  progressNote: "已到医院挂号",
  updatedFields: {},
  sourceMessageIds: ["message-hospital-progress"],
  reason: "新消息是在说明已有去医院安排的进展，不应创建重复安排。",
  needsUserConfirmation: false,
};

export function buildArrangementSimilarityMergePrompt(
  input: ArrangementSimilarityMergeInput
): {
  messages: DeepSeekMessage[];
  jsonExample: ArrangementSimilarityMergeResult;
} {
  return {
    jsonExample: arrangementSimilarityMergeJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是安排相似合并与上下文归集判断器，不是聊天助手。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字，不输出寒暄。",
          "你的任务是判断新消息或新识别安排，是否属于某条候选已有安排。",
          "可以选择的 mergeAction 只有：merge_duplicate、add_context、update_progress、update_time、ignore。",
          "merge_duplicate 表示新内容是在重复表达同一件安排，例如已经有“后天去医院”，新消息又提醒“记得去医院”。",
          "add_context 表示新内容与已有安排相关，但不是重复安排，也不是进展，例如家人询问身体情况。",
          "update_progress 表示新内容描述已有安排的进展，例如“已经挂号了”“已经买好了”。",
          "update_time 表示新内容明确更新已有安排的时间。",
          "ignore 表示不同事项、不确定、寒暄、玩笑、拒绝或与当前用户无关。",
          "不要把不同地点、不同主题、不同对象的事项强行合并，例如“去医院”和“去超市”不是同一件事。",
          "低置信度必须 shouldMerge=false。中等置信度可 shouldMerge=true 且 needsUserConfirmation=true。",
          "targetArrangementId 必须来自候选已有安排 id。",
          "sourceMessageIds 必须只包含输入消息 id。",
          "不要输出或保存推理过程，只保留最终 JSON 字段。",
          "字段必须完整。未知字段使用空字符串、空数组或空对象，不要省略字段。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请判断新内容是否应该归集到候选已有安排，只返回 json。",
          `输出 JSON 示例：${JSON.stringify(arrangementSimilarityMergeJSONExample)}`,
          `当前时间：${input.now}`,
          `时区：${input.timezone || "Asia/Shanghai"}`,
          `当前用户：${input.currentUserName || input.currentUserId} (${input.currentUserId})`,
          `来源类型：${input.sourceType}`,
          `来源标签：${input.sourceLabel}`,
          `新消息：${JSON.stringify({
            id: input.sourceMessageId,
            content: input.sourceText,
          })}`,
          `来源上下文：${JSON.stringify(input.sourceMessages)}`,
          `新识别安排：${JSON.stringify(summarizeCandidateResult(input))}`,
          `候选已有安排：${JSON.stringify(summarizeCandidateArrangements(input))}`,
        ].join("\n"),
      },
    ],
  };
}

function summarizeCandidateResult(input: ArrangementSimilarityMergeInput) {
  const result = input.candidateResult;
  if (!result?.hasArrangement) return null;

  return {
    action: result.action,
    confidence: result.confidence,
    title: result.arrangement.title,
    summary: result.arrangement.summary,
    type: result.arrangement.type,
    timeType: result.arrangement.timeType,
    fuzzyTimeLabel: result.arrangement.fuzzyTimeLabel,
    startTime: result.arrangement.startTime,
    endTime: result.arrangement.endTime,
    dueTime: result.arrangement.dueTime,
    location: result.arrangement.location,
    relatedPeople: result.arrangement.relatedPeople,
    items: result.arrangement.items,
    reason: result.reason,
  };
}

function summarizeCandidateArrangements(input: ArrangementSimilarityMergeInput) {
  return input.candidateArrangements.slice(0, 5).map((arrangement) => ({
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
    sourceType: arrangement.sourceType,
    sourceLabel: arrangement.sourceContext?.sourceLabel ?? "",
    relatedPeople: arrangement.relatedPeople.map((person) => person.name),
    sourceMessageIds: arrangement.sourceMessageIds,
    mergedSourceIds: arrangement.mergedSourceIds,
    recentContexts: arrangement.relatedContexts.slice(-5),
    progressNotes: arrangement.progressNotes.slice(-5),
  }));
}
