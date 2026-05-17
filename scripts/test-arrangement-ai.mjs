import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const nativeRequire = createRequire(import.meta.url);
const rootDir = fileURLToPath(new URL("../", import.meta.url));
const moduleCache = new Map();

const { analyzeArrangementCandidate } = loadTsModule(
  path.join(rootDir, "src/services/arrangementAIService.ts")
);
const {
  analyzePrivateChatCommitment,
  convertPrivateCommitmentToArrangementCandidate,
} = loadTsModule(path.join(rootDir, "src/services/privateChatCommitmentAIService.ts"));
const {
  analyzePrivateChatSupplementMerge,
} = loadTsModule(path.join(rootDir, "src/services/privateChatSupplementMergeAIService.ts"));
const {
  analyzeArrangementSimilarityMerge,
  selectSimilarArrangementMergeCandidates,
} = loadTsModule(path.join(rootDir, "src/services/arrangementSimilarityMergeService.ts"));
const { callDeepSeekJSON } = loadTsModule(
  path.join(rootDir, "src/services/deepseekClient.ts")
);

const baseInput = {
  scene: "manual_text",
  currentUserId: "user-1",
  currentUserName: "庄骏",
  timezone: "Asia/Shanghai",
  now: "2026-05-17T01:18:42+08:00",
};

await runCase(
  "后天去一趟医院",
  arrangementRaw({
    title: "后天去一趟医院",
    summary: "用户后天需要去医院。",
    type: "schedule",
    timeType: "date",
    startTime: "2026-05-19T00:00:00+08:00",
    items: ["去医院"],
  }),
  (result) => {
    assert.equal(result.hasArrangement, true);
    assert.equal(result.action, "create");
  }
);

await runCase(
  "哈哈哈哈",
  noArrangementRaw("只是情绪表达或玩笑，不应创建安排。"),
  (result) => {
    assert.equal(result.hasArrangement, false);
    assert.equal(result.action, "ignore");
  }
);

await runCase(
  "周末找时间整理房间",
  arrangementRaw({
    title: "周末整理房间",
    summary: "用户周末想整理房间。",
    type: "todo",
    timeType: "fuzzy",
    fuzzyTimeLabel: "周末",
    items: ["整理房间"],
  }),
  (result) => {
    assert.equal(result.hasArrangement, true);
    assert.equal(result.arrangement.timeType, "fuzzy");
    assert.equal(result.arrangement.fuzzyTimeLabel, "周末");
  }
);

await runCase(
  "明天上午 10 点开会",
  arrangementRaw({
    title: "明天上午 10 点开会",
    summary: "用户明天上午 10 点需要开会。",
    type: "schedule",
    timeType: "datetime",
    startTime: "2026-05-18T10:00:00+08:00",
    items: ["开会"],
  }),
  (result) => {
    assert.equal(result.hasArrangement, true);
    assert.equal(result.arrangement.timeType, "datetime");
    assert.equal(result.arrangement.startTime, "2026-05-18T02:00:00.000Z");
  }
);

await runCase(
  "有空再说吧",
  noArrangementRaw("表达意愿较弱且没有明确事项，暂不创建安排。", 0.24),
  (result) => {
    assert.equal(result.hasArrangement, false);
    assert.ok(result.confidence <= 0.3);
  }
);

await runCase(
  "～～",
  {
    ...noArrangementRaw("无意义符号，不能识别为安排。", 0.1),
    action: "needs_confirmation",
    needsUserConfirmation: true,
  },
  (result) => {
    assert.equal(result.hasArrangement, false);
    assert.equal(result.needsUserConfirmation, true);
  }
);

await runFallbackCase("empty_content");
await runFallbackCase("json_parse_error");
await runDeepSeekClientGuardCase();
await runSimilarArrangementMergeCase();
await runSmartCompletionGuardCase();
runSelfChatArrangementCreationCase();
await runPrivateChatCommitmentCase();
await runPrivateChatSupplementMergeCase();
await runSimilarArrangementContextMergeCase();
await runArrangementBackfillCase();

console.log("arrangement ai tests passed");

async function runCase(text, rawResponse, verify) {
  const input = createInput(text);
  const result = await analyzeArrangementCandidate(input, {
    callJSON: async () => ({ ok: true, data: rawResponse }),
  });

  assert.equal(result.ok, true);
  assertCompleteShape(result.data);
  verify(result.data);
}

async function runFallbackCase(code) {
  const result = await analyzeArrangementCandidate(createInput("明天上午 10 点开会"), {
    callJSON: async () => ({
      ok: false,
      error: {
        code,
        message: "这次没有成功识别，可以稍后重试或手动创建",
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.hasArrangement, false);
  assert.equal(result.data.action, "ignore");
  assert.ok(result.data.risks.includes(code));
  assertCompleteShape(result.data);
}

async function runDeepSeekClientGuardCase() {
  const originalFetch = globalThis.fetch;

  try {
    installWindowStorageStub();
    writeCachedAISettings({
      enableAI: false,
      hasApiKey: true,
      apiKeyPreview: "sk••••test",
    });
    const disabledFetchCalls = [];
    globalThis.fetch = async (url) => {
      disabledFetchCalls.push(String(url));
      throw new Error("settings fetch unavailable in unit test");
    };
    const disabledResult = await callDeepSeekJSON({
      messages: [{ role: "user", content: "请用 json 返回 {}" }],
      jsonExample: {},
    });
    assert.equal(disabledResult.ok, false);
    assert.equal(disabledResult.error.code, "ai_disabled");
    assert.equal(
      disabledFetchCalls.some((url) => url.includes("/api/ai/deepseek/json")),
      false
    );

    installWindowStorageStub();
    writeCachedAISettings({
      enableAI: true,
      hasApiKey: false,
      apiKeyPreview: "",
    });
    const missingKeyFetchCalls = [];
    globalThis.fetch = async (url) => {
      missingKeyFetchCalls.push(String(url));
      throw new Error("settings fetch unavailable in unit test");
    };
    const missingKeyResult = await callDeepSeekJSON({
      messages: [{ role: "user", content: "请用 json 返回 {}" }],
      jsonExample: {},
    });
    assert.equal(missingKeyResult.ok, false);
    assert.equal(missingKeyResult.error.code, "missing_api_key");
    assert.equal(
      missingKeyFetchCalls.some((url) => url.includes("/api/ai/deepseek/json")),
      false
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function runSimilarArrangementMergeCase() {
  const input = {
    ...createInput("后天去医院复查，还是上次那件事"),
    existingArrangements: [
      {
        id: "arrangement-hospital-1",
        title: "后天去一趟医院",
        status: "pending",
        timeType: "date",
        fuzzyTimeLabel: "",
        startTime: "2026-05-19T00:00:00+08:00",
        endTime: null,
        dueTime: null,
        sourceMessageIds: ["old-message-1"],
      },
    ],
  };
  const result = await analyzeArrangementCandidate(input, {
    callJSON: async () => ({
      ok: true,
      data: {
        ...arrangementRaw({
          title: "后天去医院复查",
          summary: "这与已有去医院安排相似，倾向合并。",
          type: "schedule",
          timeType: "date",
          startTime: "2026-05-19T00:00:00+08:00",
          items: ["医院复查"],
        }),
        action: "merge",
        confidence: 0.72,
        reason: "与已有医院安排时间和主题接近。",
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.hasArrangement, true);
  assert.equal(result.data.action, "merge");
  assertCompleteShape(result.data);
}

async function runSmartCompletionGuardCase() {
  const result = await analyzeArrangementCandidate(createInput("这个我刚刚已经处理好了"), {
    callJSON: async () => ({
      ok: true,
      data: noArrangementRaw(
        "这像是完成状态反馈，不应由通用抽取器创建新的安排。",
        0.18
      ),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.hasArrangement, false);
  assert.equal(result.data.action, "ignore");
  assertCompleteShape(result.data);
}

function createInput(text) {
  return {
    ...baseInput,
    messages: [
      {
        id: "message-1",
        senderId: "user-1",
        senderName: "庄骏",
        content: text,
        createdAt: "2026-05-17T01:18:42+08:00",
      },
    ],
  };
}

function arrangementRaw(overrides) {
  return {
    hasArrangement: true,
    action: "create",
    confidence: 0.86,
    arrangement: {
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
      sourceType: "manual_text",
      sourceMessageIds: ["message-1"],
      ...overrides,
    },
    needsUserConfirmation: false,
    reason: "文本中存在未来事项。",
    risks: [],
  };
}

function noArrangementRaw(reason, confidence = 0.12) {
  return {
    hasArrangement: false,
    action: "ignore",
    confidence,
    arrangement: {
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
      sourceType: "manual_text",
      sourceMessageIds: [],
    },
    needsUserConfirmation: false,
    reason,
    risks: [],
  };
}

function assertCompleteShape(result) {
  for (const key of [
    "hasArrangement",
    "action",
    "confidence",
    "arrangement",
    "needsUserConfirmation",
    "reason",
    "risks",
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(result, key), `missing ${key}`);
  }

  for (const key of [
    "title",
    "summary",
    "type",
    "status",
    "timeType",
    "fuzzyTimeLabel",
    "startTime",
    "endTime",
    "dueTime",
    "location",
    "relatedPeople",
    "executor",
    "beneficiary",
    "items",
    "sourceType",
    "sourceMessageIds",
  ]) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(result.arrangement, key),
      `missing arrangement.${key}`
    );
  }
}

function runSelfChatArrangementCreationCase() {
  installWindowStorageStub();
  const {
    createArrangementFromAICandidate,
    hasArrangementForSourceMessage,
  } = loadTsModule(path.join(rootDir, "src/data/arrangements.ts"));
  const rawResult = arrangementRaw({
    title: "后天去一趟医院",
    summary: "用户后天需要去医院。",
    type: "schedule",
    timeType: "date",
    startTime: "2026-05-19T00:00:00+08:00",
    items: ["去医院"],
  });
  const arrangement = createArrangementFromAICandidate(rawResult, {
    sourceMessageId: "self-message-1",
    sourceText: "后天去一趟医院",
    detectedAt: 1778950000000,
    confidence: 0.92,
    candidateId: "candidate-1",
    feedbackStatus: "auto_created",
  });

  assert.ok(arrangement);
  assert.equal(arrangement.sourceType, "self_chat");
  assert.deepEqual(arrangement.sourceMessageIds, ["self-message-1"]);
  assert.equal(arrangement.sourceContext.messageContent, "后天去一趟医院");
  assert.equal(arrangement.sourceContext.confidence, 0.92);
  assert.equal(arrangement.aiFeedback.status, "auto_created");
  assert.equal(hasArrangementForSourceMessage("self-message-1"), true);
}

async function runPrivateChatCommitmentCase() {
  const input = createPrivateCommitmentInput([
    {
      id: "request-1",
      senderId: "other-user",
      senderName: "张三",
      content: "明天来公司帮我带个早餐",
      createdAt: "2026-05-17T09:00:00+08:00",
    },
    {
      id: "reply-1",
      senderId: "demo",
      senderName: "庄骏",
      content: "好的",
      createdAt: "2026-05-17T09:01:00+08:00",
    },
  ]);
  const result = await analyzePrivateChatCommitment(input, {
    callJSON: async () => ({
      ok: true,
      data: privateCommitmentRaw({
        title: "明天到公司帮张三带早餐",
        summary: "当前用户答应明天到公司时帮张三带早餐。",
        timeType: "fuzzy",
        fuzzyTimeLabel: "明天到公司时",
        location: "公司",
        executor: "current_user",
        beneficiary: "other_user",
        relatedPeople: ["张三"],
        items: ["早餐"],
        sourceMessageIds: ["request-1", "reply-1"],
      }),
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.hasArrangement, true);
  assert.equal(result.data.isRelatedToCurrentUser, true);
  assert.equal(result.data.hasUserCommitted, true);
  assert.equal(result.data.shouldCreate, true);

  const candidateResult = convertPrivateCommitmentToArrangementCandidate(result.data);
  assert.equal(candidateResult.action, "create");
  assert.deepEqual(candidateResult.arrangement.sourceMessageIds, ["request-1", "reply-1"]);

  installWindowStorageStub();
  const { createArrangementFromAICandidate } = loadTsModule(
    path.join(rootDir, "src/data/arrangements.ts")
  );
  const arrangement = createArrangementFromAICandidate(candidateResult, {
    scene: "private_chat",
    sourceMessageId: "reply-1",
    sourceMessageIds: ["request-1", "reply-1"],
    sourceText: "张三：明天来公司帮我带个早餐\n庄骏：好的",
    sourceLabel: "和 张三 的私聊",
    requestMessageId: "request-1",
    requestMessageContent: "张三：明天来公司帮我带个早餐",
    commitmentMessageId: "reply-1",
    commitmentMessageContent: "庄骏：好的",
    executor: "庄骏",
    beneficiary: "张三",
    detectedAt: 1778950000000,
    confidence: 0.9,
    candidateId: "private-candidate-1",
    feedbackStatus: "auto_created",
  });

  assert.ok(arrangement);
  assert.equal(arrangement.sourceType, "private_chat");
  assert.deepEqual(arrangement.sourceMessageIds, ["reply-1", "request-1"]);
  assert.equal(arrangement.sourceContext.sourceLabel, "和 张三 的私聊");
  assert.equal(
    arrangement.sourceContext.requestMessageContent,
    "张三：明天来公司帮我带个早餐"
  );
  assert.equal(arrangement.sourceContext.commitmentMessageContent, "庄骏：好的");
  assert.equal(arrangement.sourceContext.executor, "庄骏");
  assert.equal(arrangement.sourceContext.beneficiary, "张三");

  await runPrivateCommitmentNegativeCase(
    "request_without_reply",
    createPrivateCommitmentInput([
      {
        id: "request-only-1",
        senderId: "other-user",
        senderName: "张三",
        content: "你能不能帮我看方案",
        createdAt: "2026-05-17T09:00:00+08:00",
      },
    ]),
    {
      hasArrangement: true,
      isRelatedToCurrentUser: true,
      hasUserCommitted: false,
      shouldCreate: false,
      confidence: 0.42,
      arrangement: {
        ...privateCommitmentRaw({}).arrangement,
        title: "帮张三看方案",
        sourceMessageIds: ["request-only-1"],
      },
      needsUserConfirmation: false,
      reason: "对方提出请求，但当前用户还没有答应。",
      risks: [],
    }
  );

  await runPrivateCommitmentNegativeCase(
    "rejection",
    createPrivateCommitmentInput([
      {
        id: "request-2",
        senderId: "other-user",
        senderName: "张三",
        content: "你能不能帮我看方案",
        createdAt: "2026-05-17T09:00:00+08:00",
      },
      {
        id: "reply-2",
        senderId: "demo",
        senderName: "庄骏",
        content: "不行",
        createdAt: "2026-05-17T09:01:00+08:00",
      },
    ]),
    {
      hasArrangement: true,
      isRelatedToCurrentUser: true,
      hasUserCommitted: false,
      shouldCreate: false,
      confidence: 0.2,
      arrangement: {
        ...privateCommitmentRaw({}).arrangement,
        title: "帮张三看方案",
        sourceMessageIds: ["request-2", "reply-2"],
      },
      needsUserConfirmation: false,
      reason: "当前用户明确拒绝。",
      risks: [],
    }
  );

  await runPrivateCommitmentNegativeCase(
    "other_user_task",
    createPrivateCommitmentInput([
      {
        id: "other-task-1",
        senderId: "other-user",
        senderName: "张三",
        content: "我明天给你带早餐",
        createdAt: "2026-05-17T09:00:00+08:00",
      },
    ]),
    {
      hasArrangement: true,
      isRelatedToCurrentUser: true,
      hasUserCommitted: false,
      shouldCreate: false,
      confidence: 0.3,
      arrangement: {
        ...privateCommitmentRaw({}).arrangement,
        title: "张三明天带早餐",
        executor: "other_user",
        beneficiary: "current_user",
        sourceMessageIds: ["other-task-1"],
      },
      needsUserConfirmation: false,
      reason: "这是对方自己的承诺，不应创建为当前用户安排。",
      risks: [],
    }
  );

  const medium = await analyzePrivateChatCommitment(input, {
    callJSON: async () => ({
      ok: true,
      data: {
        ...privateCommitmentRaw({
          title: "明天到公司帮张三带早餐",
          sourceMessageIds: ["request-1", "reply-1"],
        }),
        confidence: 0.62,
        shouldCreate: false,
        needsUserConfirmation: true,
      },
    }),
  });
  assert.equal(medium.ok, true);
  assert.equal(convertPrivateCommitmentToArrangementCandidate(medium.data).action, "needs_confirmation");
}

async function runPrivateCommitmentNegativeCase(name, input, rawResponse) {
  const result = await analyzePrivateChatCommitment(input, {
    callJSON: async () => ({ ok: true, data: rawResponse }),
  });
  assert.equal(result.ok, true, name);
  assert.equal(result.data.shouldCreate, false, name);
  assert.equal(
    convertPrivateCommitmentToArrangementCandidate(result.data).action,
    "ignore",
    name
  );
}

async function runPrivateChatSupplementMergeCase() {
  installWindowStorageStub();
  const {
    createArrangementFromAICandidate,
    mergeArrangementSupplement,
    undoLastArrangementMerge,
    getInitialArrangements,
    hasArrangementForSourceMessage,
  } = loadTsModule(path.join(rootDir, "src/data/arrangements.ts"));

  const initialCandidate = convertPrivateCommitmentToArrangementCandidate(
    privateCommitmentRaw({
      title: "明天到公司帮张三带早餐",
      summary: "当前用户答应明天到公司时帮张三带早餐。",
      timeType: "fuzzy",
      fuzzyTimeLabel: "明天到公司时",
      location: "公司",
      executor: "current_user",
      beneficiary: "other_user",
      relatedPeople: ["张三"],
      items: ["早餐"],
      sourceMessageIds: ["request-1", "reply-1"],
    })
  );
  const initialArrangement = createArrangementFromAICandidate(initialCandidate, {
    scene: "private_chat",
    sourceMessageId: "reply-1",
    sourceMessageIds: ["request-1", "reply-1"],
    sourceText: "张三：明天来公司帮我带个早餐\n庄骏：好",
    sourceLabel: "和 张三 的私聊",
    requestMessageId: "request-1",
    requestMessageContent: "张三：明天来公司帮我带个早餐",
    commitmentMessageId: "reply-1",
    commitmentMessageContent: "庄骏：好",
    executor: "庄骏",
    beneficiary: "张三",
    detectedAt: 1778950000000,
    confidence: 0.91,
    candidateId: "private-candidate-merge-1",
    feedbackStatus: "auto_created",
  });

  assert.ok(initialArrangement);
  assert.deepEqual(initialArrangement.items, ["早餐"]);

  const mergeInput = createPrivateMergeInput(initialArrangement, [
    {
      id: "request-1",
      senderId: "other-user",
      senderName: "张三",
      content: "明天来公司帮我带个早餐",
      createdAt: "2026-05-17T09:00:00+08:00",
    },
    {
      id: "reply-1",
      senderId: "demo",
      senderName: "庄骏",
      content: "好",
      createdAt: "2026-05-17T09:01:00+08:00",
    },
    {
      id: "supplement-1",
      senderId: "other-user",
      senderName: "张三",
      content: "再带杯咖啡",
      createdAt: "2026-05-17T09:02:00+08:00",
    },
    {
      id: "supplement-2",
      senderId: "other-user",
      senderName: "张三",
      content: "还有那个文件",
      createdAt: "2026-05-17T09:03:00+08:00",
    },
    {
      id: "reply-2",
      senderId: "demo",
      senderName: "庄骏",
      content: "行",
      createdAt: "2026-05-17T09:04:00+08:00",
    },
  ]);
  const mergeResult = await analyzePrivateChatSupplementMerge(mergeInput, {
    callJSON: async () => ({
      ok: true,
      data: privateMergeRaw({
        targetArrangementId: initialArrangement.id,
        addedItems: ["咖啡", "文件"],
        newTitle: "明天到公司帮张三带早餐、咖啡和文件",
        sourceMessageIds: ["supplement-1", "supplement-2", "reply-2"],
      }),
    }),
  });

  assert.equal(mergeResult.ok, true);
  assert.equal(mergeResult.data.shouldMerge, true);
  assert.equal(mergeResult.data.mergeType, "add_items");

  const mergedArrangement = mergeArrangementSupplement({
    targetArrangementId: mergeResult.data.targetArrangementId,
    mergeType: mergeResult.data.mergeType,
    sourceMessageId: "reply-2",
    sourceMessageIds: mergeResult.data.sourceMessageIds,
    sourceText: "张三：再带杯咖啡\n张三：还有那个文件\n庄骏：行",
    sourceMessages: [
      {
        id: "supplement-1",
        role: "supplement",
        senderName: "张三",
        content: "再带杯咖啡",
        createdAt: 1778950920000,
      },
      {
        id: "supplement-2",
        role: "supplement",
        senderName: "张三",
        content: "还有那个文件",
        createdAt: 1778950980000,
      },
      {
        id: "reply-2",
        role: "commitment",
        senderName: "庄骏",
        content: "行",
        createdAt: 1778951040000,
      },
    ],
    addedItems: mergeResult.data.addedItems,
    updatedFields: mergeResult.data.updatedFields,
    newTitle: mergeResult.data.newTitle,
    detectedAt: 1778951040000,
    confidence: mergeResult.data.confidence,
    reason: mergeResult.data.reason,
  });

  assert.ok(mergedArrangement);
  assert.equal(mergedArrangement.title, "明天到公司帮张三带早餐、咖啡和文件");
  assert.deepEqual(mergedArrangement.items, ["早餐", "咖啡", "文件"]);
  assert.equal(mergedArrangement.relatedContexts.filter((item) => item.role === "supplement").length, 2);
  assert.equal(mergedArrangement.mergeHistory.length, 1);
  assert.equal(hasArrangementForSourceMessage("supplement-1"), true);

  const unrelated = await analyzePrivateChatSupplementMerge(
    createPrivateMergeInput(getInitialArrangements()[0], [
      {
        id: "game-1",
        senderId: "other-user",
        senderName: "张三",
        content: "晚上一起打游戏",
        createdAt: "2026-05-17T09:10:00+08:00",
      },
      {
        id: "game-reply-1",
        senderId: "demo",
        senderName: "庄骏",
        content: "行",
        createdAt: "2026-05-17T09:11:00+08:00",
      },
    ]),
    {
      callJSON: async () => ({
        ok: true,
        data: {
          ...privateMergeRaw({
            targetArrangementId: initialArrangement.id,
          }),
          shouldMerge: false,
          confidence: 0.18,
          mergeType: "ignore",
          addedItems: [],
          sourceMessageIds: [],
          reason: "这是不同主题，不应合并进早餐安排。",
        },
      }),
    }
  );
  assert.equal(unrelated.ok, true);
  assert.equal(unrelated.data.shouldMerge, false);

  const rejected = await analyzePrivateChatSupplementMerge(
    createPrivateMergeInput(getInitialArrangements()[0], [
      {
        id: "supplement-3",
        senderId: "other-user",
        senderName: "张三",
        content: "再带杯咖啡",
        createdAt: "2026-05-17T09:12:00+08:00",
      },
      {
        id: "reply-3",
        senderId: "demo",
        senderName: "庄骏",
        content: "不行",
        createdAt: "2026-05-17T09:13:00+08:00",
      },
    ]),
    {
      callJSON: async () => ({
        ok: true,
        data: {
          ...privateMergeRaw({
            targetArrangementId: initialArrangement.id,
          }),
          shouldMerge: false,
          confidence: 0.16,
          mergeType: "ignore",
          addedItems: [],
          sourceMessageIds: [],
          reason: "当前用户拒绝了补充内容。",
        },
      }),
    }
  );
  assert.equal(rejected.ok, true);
  assert.equal(rejected.data.shouldMerge, false);

  const restoredArrangement = undoLastArrangementMerge(mergedArrangement.id);
  assert.ok(restoredArrangement);
  assert.equal(restoredArrangement.title, "明天到公司帮张三带早餐");
  assert.deepEqual(restoredArrangement.items, ["早餐"]);
  assert.equal(restoredArrangement.mergeHistory.length, 0);
}

async function runSimilarArrangementContextMergeCase() {
  installWindowStorageStub();
  const {
    createArrangement,
    getInitialArrangements,
    mergeArrangementSupplement,
    undoLastArrangementMerge,
    removeArrangementRelatedContext,
    hasArrangementForSourceMessage,
  } = loadTsModule(path.join(rootDir, "src/data/arrangements.ts"));

  const hospitalArrangement = createArrangement({
    title: "后天去医院",
    note: "先挂号，带上身份证。",
    timeType: "fuzzy",
    fuzzyTimeLabel: "后天",
    dateValue: "",
    dateTimeValue: "",
    dueValue: "",
    reminderEnabled: false,
    reminderOffsetMinutes: 30,
  });
  assert.ok(hospitalArrangement);

  const fatherCandidateResult = arrangementRaw({
    title: "后天去医院",
    summary: "爸爸提醒用户记得去医院。",
    type: "schedule",
    timeType: "fuzzy",
    fuzzyTimeLabel: "后天",
    items: ["去医院"],
    sourceType: "private_chat",
    sourceMessageIds: ["father-remind-1"],
  });
  const fatherCandidates = selectSimilarArrangementMergeCandidates({
    arrangements: getInitialArrangements(),
    sourceType: "private_chat",
    sourceLabel: "和 爸爸 的私聊",
    sourceText: "一定记得去医院，知道吗？",
    candidateResult: fatherCandidateResult,
    now: 1778951000000,
  });
  assert.equal(fatherCandidates[0].id, hospitalArrangement.id);
  assert.ok(fatherCandidates.length <= 5);

  const fatherMerge = await analyzeArrangementSimilarityMerge(
    {
      currentUserId: "demo",
      currentUserName: "庄骏",
      sourceType: "private_chat",
      sourceLabel: "和 爸爸 的私聊",
      sourceMessageId: "father-remind-1",
      sourceText: "一定记得去医院，知道吗？",
      sourceMessages: [
        {
          id: "father-remind-1",
          senderId: "father",
          senderName: "爸爸",
          content: "一定记得去医院，知道吗？",
          createdAt: "2026-05-17T09:05:00+08:00",
        },
      ],
      candidateResult: fatherCandidateResult,
      candidateArrangements: fatherCandidates,
      timezone: "Asia/Shanghai",
      now: "2026-05-17T09:05:10+08:00",
    },
    {
      callJSON: async () => ({
        ok: true,
        data: similarMergeRaw({
          targetArrangementId: hospitalArrangement.id,
          mergeAction: "merge_duplicate",
          sourceMessageIds: ["father-remind-1"],
          reason: "与已有后天去医院安排主题和时间一致，是重复提醒。",
        }),
      }),
    }
  );
  assert.equal(fatherMerge.ok, true);
  assert.equal(fatherMerge.data.shouldMerge, true);
  assert.equal(fatherMerge.data.mergeAction, "merge_duplicate");

  const mergedReminder = mergeArrangementSupplement({
    targetArrangementId: fatherMerge.data.targetArrangementId,
    mergeType: fatherMerge.data.mergeAction,
    sourceMessageId: "father-remind-1",
    sourceMessageIds: fatherMerge.data.sourceMessageIds,
    sourceText: "爸爸：一定记得去医院，知道吗？",
    sourceMessages: [
      {
        id: "father-remind-1",
        role: "supplement",
        senderName: "爸爸",
        content: "一定记得去医院，知道吗？",
        createdAt: 1778951100000,
      },
    ],
    addedItems: [],
    progressNote: "",
    updatedFields: {},
    newTitle: "",
    detectedAt: 1778951100000,
    confidence: fatherMerge.data.confidence,
    reason: fatherMerge.data.reason,
  });
  assert.ok(mergedReminder);
  assert.equal(mergedReminder.title, "后天去医院");
  assert.equal(mergedReminder.relatedContexts.length, 1);
  assert.equal(hasArrangementForSourceMessage("father-remind-1"), true);

  const sisterMerge = await analyzeArrangementSimilarityMerge(
    {
      currentUserId: "demo",
      currentUserName: "庄骏",
      sourceType: "private_chat",
      sourceLabel: "和 姐姐 的私聊",
      sourceMessageId: "sister-context-1",
      sourceText: "你身体情况怎么办？",
      sourceMessages: [
        {
          id: "sister-context-1",
          senderId: "sister",
          senderName: "姐姐",
          content: "你身体情况怎么办？",
          createdAt: "2026-05-17T09:08:00+08:00",
        },
      ],
      candidateResult: undefined,
      candidateArrangements: [mergedReminder],
      timezone: "Asia/Shanghai",
      now: "2026-05-17T09:08:10+08:00",
    },
    {
      callJSON: async () => ({
        ok: true,
        data: similarMergeRaw({
          targetArrangementId: hospitalArrangement.id,
          mergeAction: "add_context",
          sourceMessageIds: ["sister-context-1"],
          reason: "姐姐询问身体情况，与去医院安排相关，但不是新安排。",
        }),
      }),
    }
  );
  assert.equal(sisterMerge.data.mergeAction, "add_context");

  const mergedContext = mergeArrangementSupplement({
    targetArrangementId: sisterMerge.data.targetArrangementId,
    mergeType: sisterMerge.data.mergeAction,
    sourceMessageId: "sister-context-1",
    sourceMessageIds: sisterMerge.data.sourceMessageIds,
    sourceText: "姐姐：你身体情况怎么办？",
    sourceMessages: [
      {
        id: "sister-context-1",
        role: "supplement",
        senderName: "姐姐",
        content: "你身体情况怎么办？",
        createdAt: 1778951280000,
      },
    ],
    addedItems: [],
    progressNote: "",
    updatedFields: {},
    newTitle: "",
    detectedAt: 1778951280000,
    confidence: sisterMerge.data.confidence,
    reason: sisterMerge.data.reason,
  });
  assert.ok(mergedContext);
  assert.equal(mergedContext.relatedContexts.length, 2);

  const progressMerge = await analyzeArrangementSimilarityMerge(
    {
      currentUserId: "demo",
      currentUserName: "庄骏",
      sourceType: "self_chat",
      sourceLabel: "发给自己的消息",
      sourceMessageId: "self-progress-1",
      sourceText: "我已经到医院挂号了",
      sourceMessages: [
        {
          id: "self-progress-1",
          senderId: "demo",
          senderName: "庄骏",
          content: "我已经到医院挂号了",
          createdAt: "2026-05-17T09:12:00+08:00",
        },
      ],
      candidateResult: undefined,
      candidateArrangements: [mergedContext],
      timezone: "Asia/Shanghai",
      now: "2026-05-17T09:12:10+08:00",
    },
    {
      callJSON: async () => ({
        ok: true,
        data: similarMergeRaw({
          targetArrangementId: hospitalArrangement.id,
          mergeAction: "update_progress",
          progressNote: "已到医院挂号",
          sourceMessageIds: ["self-progress-1"],
          reason: "这是去医院安排的进展反馈。",
        }),
      }),
    }
  );
  assert.equal(progressMerge.data.mergeAction, "update_progress");

  const mergedProgress = mergeArrangementSupplement({
    targetArrangementId: progressMerge.data.targetArrangementId,
    mergeType: progressMerge.data.mergeAction,
    sourceMessageId: "self-progress-1",
    sourceMessageIds: progressMerge.data.sourceMessageIds,
    sourceText: "我已经到医院挂号了",
    sourceMessages: [
      {
        id: "self-progress-1",
        role: "progress",
        senderName: "庄骏",
        content: "我已经到医院挂号了",
        createdAt: 1778951520000,
      },
    ],
    addedItems: [],
    progressNote: progressMerge.data.progressNote,
    updatedFields: {},
    newTitle: "",
    detectedAt: 1778951520000,
    confidence: progressMerge.data.confidence,
    reason: progressMerge.data.reason,
  });
  assert.ok(mergedProgress);
  assert.equal(mergedProgress.progressNotes.length, 1);
  assert.equal(mergedProgress.progressNotes[0].content, "已到医院挂号");

  const restoredAfterProgress = undoLastArrangementMerge(mergedProgress.id);
  assert.ok(restoredAfterProgress);
  assert.equal(restoredAfterProgress.progressNotes.length, 0);

  const supermarketCandidates = selectSimilarArrangementMergeCandidates({
    arrangements: getInitialArrangements(),
    sourceType: "self_chat",
    sourceLabel: "发给自己的消息",
    sourceText: "后天去超市",
    candidateResult: arrangementRaw({
      title: "后天去超市",
      summary: "用户后天去超市。",
      type: "schedule",
      timeType: "fuzzy",
      fuzzyTimeLabel: "后天",
      items: ["去超市"],
      sourceType: "self_chat",
      sourceMessageIds: ["self-supermarket-1"],
    }),
    now: 1778951600000,
  });
  assert.equal(
    supermarketCandidates.some((arrangement) => arrangement.id === hospitalArrangement.id),
    false
  );

  const removedContext = removeArrangementRelatedContext(
    restoredAfterProgress.id,
    "context-sister-context-1"
  );
  assert.ok(removedContext);
  assert.equal(
    removedContext.relatedContexts.some((context) => context.messageId === "sister-context-1"),
    false
  );
}

function createPrivateCommitmentInput(messages) {
  return {
    currentUserId: "demo",
    currentUserName: "庄骏",
    otherUserId: "other-user",
    otherUserName: "张三",
    timezone: "Asia/Shanghai",
    now: "2026-05-17T09:01:00+08:00",
    messages,
    existingArrangements: [],
  };
}

function createPrivateMergeInput(candidateArrangement, messages) {
  return {
    currentUserId: "demo",
    currentUserName: "庄骏",
    otherUserId: "other-user",
    otherUserName: "张三",
    currentMessage: messages.at(-1),
    messages,
    candidateArrangements: [candidateArrangement],
    timezone: "Asia/Shanghai",
    now: "2026-05-17T09:04:00+08:00",
  };
}

function privateCommitmentRaw(overrides) {
  return {
    hasArrangement: true,
    isRelatedToCurrentUser: true,
    hasUserCommitted: true,
    shouldCreate: true,
    confidence: 0.9,
    arrangement: {
      title: "",
      summary: "",
      type: "commitment",
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
      sourceType: "private_chat",
      sourceMessageIds: [],
      ...overrides,
    },
    needsUserConfirmation: false,
    reason: "私聊中形成了承诺。",
    risks: [],
  };
}

function privateMergeRaw(overrides) {
  return {
    shouldMerge: true,
    confidence: 0.88,
    targetArrangementId: "",
    mergeType: "add_items",
    addedItems: [],
    updatedFields: {},
    newTitle: "",
    sourceMessageIds: [],
    reason: "补充内容属于已有安排。",
    needsUserConfirmation: false,
    ...overrides,
  };
}

function similarMergeRaw(overrides) {
  return {
    shouldMerge: true,
    confidence: 0.88,
    targetArrangementId: "",
    mergeAction: "add_context",
    progressNote: "",
    updatedFields: {},
    sourceMessageIds: [],
    reason: "新内容属于已有安排的相关上下文。",
    needsUserConfirmation: false,
    ...overrides,
  };
}

async function runArrangementBackfillCase() {
  window.localStorage.setItem(
    "arkme-demo.selfRecords",
    JSON.stringify([
      {
        uid: "self-history-1",
        text_content: "周末找时间整理房间",
        send_at: Date.now() - 1000,
        create_at: Date.now() - 1000,
        update_at: Date.now() - 1000,
      },
    ])
  );
  window.localStorage.setItem(
    "arkme-demo.testIdentities",
    JSON.stringify([
      {
        id: "identity-xiaowang",
        name: "小王",
        note: "",
        avatarLabel: "王",
        color: "#09B83E",
        createdAt: Date.now() - 2000,
      },
    ])
  );
  window.localStorage.setItem(
    "arkme-demo.testGroups",
    JSON.stringify([
      {
        id: "group-work",
        name: "工作群",
        note: "",
        avatarLabel: "工",
        color: "#8363FF",
        memberIdentityIds: ["identity-xiaowang"],
        createdAt: Date.now() - 2000,
      },
    ])
  );
  window.localStorage.setItem(
    "arkme-demo.testMessages",
    JSON.stringify([
      {
        id: "private-history-1",
        conversationId: "private:identity-xiaowang",
        conversationType: "private",
        identityId: "identity-xiaowang",
        text: "下周约小王吃饭",
        sentAt: Date.now() - 800,
        sender: "demo",
      },
      {
        id: "group-history-1",
        conversationId: "group-work",
        conversationType: "group",
        identityId: "identity-xiaowang",
        text: "明天上午 10 点开会",
        sentAt: Date.now() - 600,
        sender: "identity",
      },
    ])
  );

  const {
    collectArrangementBackfillTargets,
    getArrangementBackfillConversationOptions,
    runArrangementBackfill,
  } = loadTsModule(path.join(rootDir, "src/services/arrangementAIBackfillService.ts"));
  const groupTargets = collectArrangementBackfillTargets({
    timeRange: "30d",
    recentLimit: 10,
    conversationKind: "group_chat",
    conversationId: "all",
  });
  assert.equal(groupTargets.length, 1);
  assert.equal(groupTargets[0].scene, "group_chat");

  const conversationOptions = getArrangementBackfillConversationOptions();
  assert.ok(conversationOptions.some((option) => option.kind === "self_chat"));
  assert.ok(conversationOptions.some((option) => option.kind === "private_chat"));
  assert.ok(conversationOptions.some((option) => option.kind === "group_chat"));

  const result = await runArrangementBackfill(
    {
      timeRange: "30d",
      recentLimit: 10,
      conversationKind: "all",
      conversationId: "all",
    },
    {
      settings: {
        enableAI: true,
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
        thinkingMode: "disabled",
        reasoningEffort: "high",
        maxTokens: 2000,
        hasApiKey: true,
        apiKeyPreview: "sk••••test",
      },
      analyze: async (input) => ({
        ok: true,
        data: arrangementRaw({
          title: input.messages[0].content,
          summary: input.messages[0].content,
          type: "todo",
          timeType: "fuzzy",
          fuzzyTimeLabel: "近期",
          items: [input.messages[0].content],
        }),
      }),
    }
  );

  assert.equal(result.disabled, false);
  assert.equal(result.created, 3);
  assert.equal(result.pending, 0);
}

function installWindowStorageStub() {
  const storage = new Map();
  globalThis.Event = class Event {
    constructor(type) {
      this.type = type;
    }
  };
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, String(value));
      },
      removeItem: (key) => {
        storage.delete(key);
      },
    },
    dispatchEvent: () => true,
  };
}

function writeCachedAISettings(overrides) {
  window.localStorage.setItem(
    "arkme-demo.aiSettings",
    JSON.stringify({
      enableAI: false,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-pro",
      thinkingMode: "disabled",
      reasoningEffort: "high",
      maxTokens: 2000,
      hasApiKey: false,
      apiKeyPreview: "",
      ...overrides,
    })
  );
}

function loadTsModule(filePath) {
  const normalizedPath = normalizePath(filePath);
  const cachedModule = moduleCache.get(normalizedPath);
  if (cachedModule) return cachedModule.exports;

  const source = fs.readFileSync(normalizedPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: normalizedPath,
  });
  const currentModule = {
    exports: {},
  };
  moduleCache.set(normalizedPath, currentModule);

  const localRequire = (specifier) => {
    if (specifier.startsWith("@/")) {
      return loadTsModule(resolveSourcePath(path.join(rootDir, "src", specifier.slice(2))));
    }

    if (specifier.startsWith(".")) {
      return loadTsModule(resolveSourcePath(path.resolve(path.dirname(normalizedPath), specifier)));
    }

    return nativeRequire(specifier);
  };

  const wrapper = vm.runInThisContext(
    `(function (exports, require, module, __filename, __dirname) {${output.outputText}\n})`,
    { filename: normalizedPath }
  );
  wrapper(
    currentModule.exports,
    localRequire,
    currentModule,
    normalizedPath,
    path.dirname(normalizedPath)
  );

  return currentModule.exports;
}

function resolveSourcePath(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.mjs`,
    path.join(basePath, "index.ts"),
  ];
  const match = candidates.find((candidate) => fs.existsSync(candidate));
  if (!match) {
    throw new Error(`Cannot resolve module ${basePath}`);
  }
  return match;
}

function normalizePath(filePath) {
  return path.normalize(filePath);
}
