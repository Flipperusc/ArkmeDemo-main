import type {
  ArrangementStatusChangeInput,
  ArrangementStatusChangeResult,
} from "@/types/arrangementAI";
import type { DeepSeekMessage } from "@/types/ai";

export const arrangementStatusChangeJSONExample: ArrangementStatusChangeResult = {
  hasStatusChange: true,
  relatedArrangementId: "arrangement-hospital-1",
  confidence: 0.87,
  statusChangeType: "completed",
  newStatus: "completed",
  progressNote: "今天上午已去医院体检，结果没问题",
  newTime: null,
  sourceMessageIds: ["message-hospital-done"],
  needsUserConfirmation: false,
  reason: "新消息明确说明用户已经完成了去医院体检这件安排。",
};

export function buildArrangementStatusChangePrompt(
  input: ArrangementStatusChangeInput
): {
  messages: DeepSeekMessage[];
  jsonExample: ArrangementStatusChangeResult;
} {
  return {
    jsonExample: arrangementStatusChangeJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是安排状态变化判断器，不是聊天助手。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字，不输出寒暄。",
          "你的任务是判断新消息是否说明某条候选已有安排发生状态变化。",
          "可以选择的 statusChangeType 只有：completed、in_progress、canceled、rescheduled、progress_update、ignore。",
          "completed 表示已有安排已经完成，例如“我今天上午去医院体检了”“我已经发给他了”。",
          "in_progress 表示已有安排已经开始推进但还未完成，例如“已经挂号了”“已经预约了”。",
          "progress_update 表示只记录进展，不改变为完成，例如“已经联系对方了”。",
          "rescheduled 表示明确改期，例如“改到下周了”。",
          "canceled 表示安排取消或不需要做了，例如“不用了，医生说没事”。",
          "ignore 表示不是状态变化、不确定、寒暄、玩笑、不同事项、或与当前用户无关。",
          "不要把不同主题、不同对象、不同地点的事项强行关联。",
          "不要把“已挂号”“已预约”直接判为 completed，优先判为 in_progress 或 progress_update。",
          "rescheduled 和 canceled 默认需要用户确认；重要或不确定变化也需要用户确认。",
          "relatedArrangementId 必须来自候选已有安排 id。",
          "sourceMessageIds 必须只包含输入消息 id。",
          "newTime 如果能解析为明确时间，输出 ISO 8601 字符串；如果只有“下周”等模糊时间，输出原始模糊表达；没有改期时输出 null。",
          "不要输出或保存推理过程，只保留最终 JSON 字段。",
          "字段必须完整。未知字段使用空字符串、空数组或 null，不要省略字段。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请判断新消息是否对应候选已有安排的状态变化，只返回 json。",
          `输出 JSON 示例：${JSON.stringify(arrangementStatusChangeJSONExample)}`,
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
          `候选已有安排：${JSON.stringify(summarizeCandidateArrangements(input))}`,
        ].join("\n"),
      },
    ],
  };
}

function summarizeCandidateArrangements(input: ArrangementStatusChangeInput) {
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
    recentStatusHistory: arrangement.statusHistory.slice(-5),
  }));
}
