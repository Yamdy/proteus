# @proteus/sdk 模块分析

## 模块概述

`@proteus/sdk` 是 Proteus 框架的可嵌入语言 API 模块，提供高级别的门面（Facade）模式接口，将底层核心类封装为易于使用的 SDK。适用于将 Proteus 嵌入到其他应用程序中（例如另一个 AI Agent）。

## 架构设计

### 设计模式

1. **Facade 模式** - 封装底层核心类，提供统一接口
2. **Builder 模式** - 通过选项对象配置 SDK
3. **工厂模式** - 内部创建 AgentContext 等对象

### 依赖关系

```json
{
  "dependencies": {
    "@proteus/core": "workspace:*"
  }
}
```

## 核心特性

### 1. ProteusSDK 主类

**文件**: `sdk.ts`

ProteusSDK 是一个高级别的可嵌入 API，封装了 Harness、SessionManager、HandlerEngine、ToolRegistry 等底层核心类。

#### 构造函数

```typescript
interface SDKOptions {
  store?: CheckpointStore;  // 存储后端，默认内存存储
  llm?: LLMProvider;        // LLM 提供者，可选
}

class ProteusSDK {
  constructor(options?: SDKOptions);
}
```

#### 核心属性

```typescript
class ProteusSDK {
  readonly toolRegistry: ToolRegistry;      // 工具注册表
  readonly handlerEngine: HandlerEngine;    // 处理器引擎
  readonly harness: Harness;                // 执行编排器
  readonly sessionManager: SessionManager;  // 会话管理器
  readonly store: CheckpointStore;          // 存储后端
}
```

### 2. 注册功能

#### 注册工具

```typescript
registerTool(tool: Tool): void
```

- 注册一个工具到工具注册表
- 如果同名工具已存在则抛出异常

#### 注册处理器

```typescript
registerHandler(handler: HandlerDefinition): void
```

- 注册一个处理器定义到处理器引擎

### 3. 会话管理

#### 创建会话

```typescript
createSession(sessionId: string, config: SessionConfig): SessionContext
```

- 创建新会话
- 初始化 MessageStore 条目
- 如果会话 ID 已存在则抛出异常

#### 获取会话

```typescript
getSession(sessionId: string): SessionContext | undefined
```

- 获取现有会话，不存在则返回 undefined

#### 销毁会话

```typescript
destroySession(sessionId: string): void
```

- 销毁会话（不存在则为 no-op）
- 从挂起集合中移除

#### 列出会话

```typescript
listSessions(): string[]
```

- 列出所有会话 ID

### 4. 消息管理

#### 添加消息

```typescript
addMessage(sessionId: string, message: LLMMessage): void
```

- 添加单条消息到会话的工作内存
- 持久化到 MessageStore
- 如果会话不存在则抛出异常

#### 获取消息

```typescript
getMessages(sessionId: string): LLMMessage[]
```

- 获取会话的所有消息
- 返回消息列表的副本
- 如果会话不存在则抛出异常

#### 清空消息

```typescript
clearMessages(sessionId: string): void
```

- 清空会话的所有消息
- 如果会话不存在则抛出异常

### 5. 推理功能

#### 同步聊天

```typescript
async chat(sessionId: string, message: string): Promise<TurnResult>
```

- 运行同步聊天轮次
- 将消息作为用户提示推入工作内存
- 运行完整的 Harness 管道（上下文组装、LLM 推理、动作解析、工具执行、结果观察）
- 如果处理器返回 `{ suspend: true }`，自动追踪为挂起状态

#### 流式聊天

```typescript
async *chatStream(sessionId: string, message: string): AsyncIterable<LLMResponse>
```

- 运行流式聊天轮次
- 当前实现：内部运行 `chat()` 并产生最终 LLMResponse
- 未来版本将直接通过提供者的 `chatStream` 管道

### 6. 生命周期管理

#### 挂起会话

```typescript
suspend(sessionId: string): void
```

- 标记会话为挂起状态
- 转换 Harness 生命周期状态机（如果状态允许 "suspend" 事件）
- 用于外部管理生命周期的场景

#### 恢复会话

```typescript
async resume(sessionId: string, input?: unknown): Promise<TurnResult>
```

- 恢复先前挂起的会话
- 加载最新的挂起检查点
- 重新进入 Harness 管道
- 成功恢复后从挂起集合中移除

#### 检查挂起状态

```typescript
isSuspended(sessionId: string): boolean
```

- 检查会话是否当前处于挂起状态

### 7. 内部实现

#### 会话验证

```typescript
private requireSession(sessionId: string): SessionContext
```

- 验证会话存在，不存在则抛出异常

#### 构建 AgentContext

```typescript
private buildAgentContext(): AgentContext
```

- 从 ToolRegistry 构建工具 Map
- 创建 AgentContext 实例
- 如果未配置 LLM，使用存根 LLM

#### 存根 LLM

```typescript
function createStubLLM(): LLMProvider
```

- 创建空操作的 LLM 提供者
- 用于未配置 LLM 时的默认行为

## 类型定义

### SDKOptions

```typescript
interface SDKOptions {
  store?: CheckpointStore;
  llm?: LLMProvider;
}
```

### 从 @proteus/core 重新导出的类型

```typescript
export type {
  TurnContext,
  PromptFragment,
  Tool,
  ToolDefinition,
  ToolResult,
  Artifact,
  LLMProvider,
  LLMMessage,
  LLMResponse,
  ToolCall,
  PhaseName,
  HandlerDefinition,
  HandlerResult,
  HandlerFn,
  SessionConfig,
  WorkingMemory,
  HandlerEngine,
  LifecycleStateMachine,
  LifecycleState,
  LifecycleEvent,
  CheckpointStore,
  SessionStore,
  MessageStore,
  CheckpointLog,
  EventLog,
  ConfigStore,
  CostStore,
  SessionMeta,
  StoreEvent,
  ConfigSnapshot,
  CostRecord,
  Harness,
  TurnResult,
};
```

## 公共 API 导出

### 主要导出

- `ProteusSDK` - SDK 主类
- `SDKOptions` - SDK 选项接口

### 类型导出

- 所有从 `@proteus/core` 重新导出的类型

## 使用示例

### 基本使用

```typescript
import { ProteusSDK } from "@proteus/sdk";

// 创建 SDK 实例
const sdk = new ProteusSDK({
  llm: myLLMProvider,
});

// 注册工具
sdk.registerTool({
  definition: {
    name: "search",
    description: "Search the web",
    parameters: { /* JSON Schema */ },
  },
  execute: async (params, context) => {
    // 执行搜索
    return { output: "search results" };
  },
});

// 创建会话
sdk.createSession("session-1", {
  sessionId: "session-1",
  llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
  tools: {},
  logLevel: "info",
});

// 聊天
const result = await sdk.chat("session-1", "Hello, how are you?");
console.log(result);
```

### 流式聊天

```typescript
for await (const chunk of sdk.chatStream("session-1", "Tell me a story")) {
  process.stdout.write(chunk.content);
}
```

### 挂起/恢复

```typescript
// 挂起会话
sdk.suspend("session-1");

// 恢复会话
const result = await sdk.resume("session-1", "user input");
```

### 消息管理

```typescript
// 添加消息
sdk.addMessage("session-1", {
  role: "user",
  content: "Hello",
});

// 获取消息
const messages = sdk.getMessages("session-1");

// 清空消息
sdk.clearMessages("session-1");
```

## 设计决策

1. **Facade 模式** - 封装底层复杂性，提供简单接口
2. **内存存储默认** - 默认使用内存存储，适合嵌入场景
3. **存根 LLM** - 未配置 LLM 时提供空操作实现
4. **自动挂起追踪** - 内部维护挂起会话集合
5. **类型重新导出** - 方便消费者访问核心类型

## 与 Core 的关系

- SDK 依赖 Core，不包含独立实现
- 封装 Core 的底层类为高级别接口
- 重新导出 Core 的类型定义
- 适用于单进程嵌入场景（SDK 模式：每个进程一个会话）
