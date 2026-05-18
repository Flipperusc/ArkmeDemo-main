import type {
  ArrangementAIAssistGenerationInput,
  ArrangementAIAssistGenerationResult,
  ArrangementAIAssistSuggestionInput,
  ArrangementAIAssistSuggestionResult,
} from "@/types/arrangementAI";
import type { DeepSeekMessage } from "@/types/ai";

export const arrangementAIAssistSuggestionJSONExample: ArrangementAIAssistSuggestionResult =
  {
    executionType: "ai_assist",
    confidence: 0.86,
    suggestedActions: [
      {
        actionId: "prepare_questions",
        title: "整理要问医生的问题",
        description: "根据安排备注和上下文，生成一份就诊问题清单",
        riskLevel: "low",
        requiresUserConfirmation: true,
        outputType: "draft",
      },
    ],
    reason: "这条安排需要用户亲自完成，但 AI 可以提前整理材料和准备清单。",
    risks: [],
  };

export const arrangementAIAssistGenerationJSONExample: ArrangementAIAssistGenerationResult =
  {
    title: "就诊问题清单",
    content:
      "1. 最近症状从什么时候开始？\n2. 哪些情况会加重或缓解？\n3. 是否需要携带既往检查报告？",
    outputType: "draft",
    requiresUserConfirmation: true,
    safetyNote: "这只是就诊准备材料，不构成诊断或治疗建议。",
    reason: "用户点击了整理问题清单，适合生成可编辑草稿。",
    risks: ["medical_requires_confirmation"],
  };

export function buildArrangementAIAssistSuggestionPrompt(
  input: ArrangementAIAssistSuggestionInput
): {
  messages: DeepSeekMessage[];
  jsonExample: ArrangementAIAssistSuggestionResult;
} {
  return {
    jsonExample: arrangementAIAssistSuggestionJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是安排的 AI 协助能力分类器，不是自动执行代理。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字。",
          "必须判断这条安排是否适合 AI 协助，executionType 只能是 user_only、ai_assist、ai_executable。",
          "user_only 表示只能用户自己完成，或没有明确可生成的准备内容。",
          "ai_assist 表示 AI 可以生成草稿、清单、步骤、资料整理、提醒建议等辅助内容。",
          "ai_executable 表示 AI 可能能直接生成完成结果，但仍必须由用户确认后使用。",
          "suggestedActions 最多 5 个，actionId 使用稳定英文 snake_case。",
          "优先建议这些动作类型：生成准备清单、生成消息草稿、整理资料、拆解步骤、生成提醒建议。",
          "不要建议自动发消息、支付、预约、通知他人、删除安排、修改安排时间或执行外部动作。",
          "发送消息、修改安排时间、删除安排、通知他人、医疗、法律、财务相关内容都必须 requiresUserConfirmation=true。",
          "医疗类安排只能建议整理症状、问题清单、携带清单、提醒建议；不能诊断，不能替代医生建议。",
          "法律或财务类安排只能建议整理材料、列问题、生成待确认草稿；不能做决策或给结论性建议。",
          "如果只是“明天去公司”这类没有明显可协助内容的安排，executionType=user_only，suggestedActions=[]。",
          "字段必须完整，未知字段使用空字符串或空数组，不要省略字段。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请判断以下安排是否可以由 AI 协助，并只返回 json。",
          `输出 JSON 示例：${JSON.stringify(arrangementAIAssistSuggestionJSONExample)}`,
          `当前时间：${input.now}`,
          `时区：${input.timezone || "Asia/Shanghai"}`,
          `当前用户：${input.currentUserName || input.currentUserId} (${input.currentUserId})`,
          `安排摘要：${JSON.stringify(summarizeArrangement(input))}`,
        ].join("\n"),
      },
    ],
  };
}

export function buildArrangementAIAssistGenerationPrompt(
  input: ArrangementAIAssistGenerationInput
): {
  messages: DeepSeekMessage[];
  jsonExample: ArrangementAIAssistGenerationResult;
} {
  return {
    jsonExample: arrangementAIAssistGenerationJSONExample,
    messages: [
      {
        role: "system",
        content: [
          "你是安排详情页中的 AI 内容生成器，只为用户生成可编辑内容。",
          "你只输出 json 对象，不输出 markdown，不输出解释文字。",
          "只执行用户点击的这个 suggestedAction，不要扩展成其他外部动作。",
          "生成内容只能保存在安排详情中，不能自动发送消息，不能通知他人，不能修改安排，不能替用户承诺。",
          "医疗类内容只能整理症状、问题清单、携带清单和提醒建议，不能诊断，不能给治疗方案，不能替代医生建议。",
          "法律或财务类内容只能整理材料和生成待确认草稿，不能做法律或财务决策。",
          "如果动作涉及发送、通知、修改时间、删除、医疗、法律、财务，requiresUserConfirmation 必须为 true，并在 safetyNote 中说明。",
          "content 应该是用户可以直接查看和编辑的最终内容，不要包含推理过程。",
          "字段必须完整，未知字段使用空字符串或空数组，不要省略字段。",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "请根据安排和用户选择的动作生成结果，并只返回 json。",
          `输出 JSON 示例：${JSON.stringify(arrangementAIAssistGenerationJSONExample)}`,
          `当前时间：${input.now}`,
          `时区：${input.timezone || "Asia/Shanghai"}`,
          `当前用户：${input.currentUserName || input.currentUserId} (${input.currentUserId})`,
          `安排摘要：${JSON.stringify(summarizeArrangement(input))}`,
          `用户点击的动作：${JSON.stringify(input.action)}`,
        ].join("\n"),
      },
    ],
  };
}

function summarizeArrangement(
  input: ArrangementAIAssistSuggestionInput | ArrangementAIAssistGenerationInput
) {
  const arrangement = input.arrangement;
  return {
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
    items: arrangement.items.slice(0, 10),
    sourceType: arrangement.sourceType,
    sourceLabel: arrangement.sourceContext?.sourceLabel ?? "",
    sourceMessage: arrangement.sourceContext?.messageContent ?? "",
    relatedContexts: arrangement.relatedContexts.slice(-5).map((context) => ({
      role: context.role,
      senderName: context.senderName ?? "",
      content: context.content,
    })),
    progressNotes: arrangement.progressNotes.slice(-5).map((note) => note.content),
    relatedPeople: arrangement.relatedPeople.map((person) => person.name),
  };
}
