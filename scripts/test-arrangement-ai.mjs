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
runSelfChatArrangementCreationCase();
await runPrivateChatCommitmentCase();
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
