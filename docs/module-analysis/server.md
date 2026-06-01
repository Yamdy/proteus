# @proteus/server 模块分析

## 模块概述

`@proteus/server` 是 Proteus 框架的 HTTP/WebSocket 服务模块，基于 Fastify v5 构建，提供会话管理、推理 API、实时事件推送、指标监控等功能。适用于服务多个并发客户端的场景。

## 架构设计

### 技术栈

- **Web 框架**: Fastify v5
- **WebSocket**: @fastify/websocket
- **CORS**: @fastify/cors
- **存储**: better-sqlite3（可选）
- **运行时**: Node.js >= 20

### 依赖关系

```json
{
  "dependencies": {
    "@fastify/cors": "^10.0.0",
    "@fastify/websocket": "^11.0.0",
    "@proteus/core": "workspace:*",
    "better-sqlite3": "^11.0.0",
    "fastify": "^5.2.0"
  }
}
```

### 架构模式

1. **路由模块化** - 按功能分离路由注册
2. **依赖注入** - 通过选项对象注入依赖
3. **事件驱动** - EventBus 实现发布/订阅模式
4. **中间件模式** - Fastify 插件系统

## 核心特性

### 1. ProteusServer 主类

**文件**: `server.ts`

ProteusServer 是 Fastify 服务器的封装，提供完整的 HTTP/WS 服务。

#### 构造函数选项

```typescript
interface ServerOptions {
  port?: number;                    // 服务端口，默认 3000
  host?: string;                    // 绑定地址，默认 "0.0.0.0"
  cors?: boolean;                   // 是否启用 CORS，默认 true
  store?: SessionStore;             // 会话存储
  sessionStore?: SessionStore;      // 会话存储（别名）
  metrics?: MetricsCollector;       // 指标收集器
  costStore?: CostStore;            // 成本存储
  eventLog?: EventLog;              // 事件日志
  handlerCount?: number;            // 处理器数量
  lifecycle?: LifecycleStateMachine; // 生命周期状态机
  configManager?: ConfigSnapshotManager; // 配置快照管理器
  sessionId?: string;               // 默认会话 ID
  checkpointLog?: CheckpointLog;    // 检查点日志
  llm?: LLMProvider;                // LLM 提供者
  tools?: Map<string, Tool>;        // 工具映射
  eventBus?: EventBus;              // 事件总线
}
```

#### 核心属性

```typescript
class ProteusServer {
  readonly sessionManager: SessionManager;
  readonly harness: Harness;
  readonly instance: FastifyInstance;
}
```

#### 主要方法

```typescript
class ProteusServer {
  constructor(options?: ServerOptions);
  async start(): Promise<void>;   // 启动服务器
  async stop(): Promise<void>;    // 停止服务器
}
```

#### 工厂函数

```typescript
function createServer(options?: ServerOptions): ProteusServer;
```

### 2. 路由模块

#### 2.1 会话路由（sessions.ts）

**前缀**: `/api/sessions`

##### 创建会话

```
POST /api/sessions
```

**请求体**:
```typescript
interface CreateSessionBody {
  name?: string;
  sessionId?: string;
  config?: SessionConfig;
}
```

**响应**: `201 Created`
```typescript
interface SessionView {
  id: string;
  name: string;
  createdAt: number;
}
```

##### 列出会话

```
GET /api/sessions
```

**响应**: `SessionView[]`

##### 获取会话

```
GET /api/sessions/:id
```

**响应**: `SessionView`

##### 删除会话

```
DELETE /api/sessions/:id
```

**响应**: `204 No Content`

##### 获取消息历史

```
GET /api/sessions/:id/messages
```

**响应**: `LLMMessage[]`

##### 流式聊天（SSE）

```
POST /api/sessions/:id/stream
```

**请求体**:
```typescript
{
  content?: string;
  message?: string;
}
```

**响应**: SSE 流
```
data: {"content": "token"}
data: [DONE]
```

#### 2.2 聊天路由（chat.ts）

**前缀**: `/api/chat`

##### 同步推理

```
POST /api/chat
```

**请求体**:
```typescript
interface ChatBody {
  sessionId: string;
  message: string;
}
```

**响应**:
```typescript
{
  turnId: string;
  status: "completed" | "aborted" | "suspended" | "errored";
  response: string;
}
```

#### 2.3 SSE 流式路由（sse.ts）

**前缀**: `/api/chat`

##### 流式推理

```
GET /api/chat/:sessionId/stream?message=...
```

**SSE 事件格式**:
```typescript
interface SseEvent {
  event: "chunk" | "done" | "error";
  content?: string;           // chunk 事件
  usage?: {                   // done 事件
    promptTokens: number;
    completionTokens: number;
  };
  finishReason?: string;      // done 事件
  message?: string;           // error 事件
}
```

#### 2.4 WebSocket 路由（ws.ts）

**路径**: `/ws`

##### EventBus 类

```typescript
class EventBus {
  constructor(eventLog?: EventLog);
  
  // 订阅特定会话事件
  subscribe(sessionId: string, fn: (event: StoreEvent) => void): () => void;
  
  // 订阅所有事件
  subscribeAll(fn: (event: StoreEvent) => void): () => void;
  
  // 发布事件
  publish(event: StoreEvent): void;
}
```

##### WebSocket 协议

**客户端消息**:
```typescript
interface ClientMessage {
  action?: "subscribe" | "unsubscribe";
  type?: "subscribe" | "unsubscribe";
  sessionId?: string;
  channels?: string[];
}
```

**服务端推送**:
```typescript
interface ServerPush {
  type: string;
  data?: unknown;
  timestamp: number;
}
```

#### 2.5 指标路由（metrics.ts）

##### 获取指标

```
GET /api/metrics
```

**响应**:
```typescript
{
  totalTraces: number;
  totalSpans: number;
  averageLatencyMs: number;
  errorRate: number;
  phaseBreakdown: {
    context_assembly: { count: number; avgDurationMs: number };
    llm_inference: { count: number; avgDurationMs: number };
    action_resolution: { count: number; avgDurationMs: number };
    tool_execution: { count: number; avgDurationMs: number };
    result_observation: { count: number; avgDurationMs: number };
  };
  toolCallStats: [];
}
```

##### 获取成本

```
GET /api/costs
```

**响应**:
```typescript
{
  totalCostUsd: number;
  totalTokens: number;
  bySession: Array<{
    sessionId: string;
    costUsd: number;
    tokens: number;
  }>;
  byModel: Array<{
    model: string;
    costUsd: number;
    tokens: number;
  }>;
  byTurn: Array<{
    id: string;
    sessionId: string;
    turnId: string;
    timestamp: number;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  }>;
}
```

##### 获取会话成本

```
GET /api/costs/:sessionId
```

##### 获取追踪

```
GET /api/traces/:sessionId?since=...
```

**响应**:
```typescript
{
  sessionId: string;
  events: StoreEvent[];
  count: number;
}
```

##### 获取工具调用

```
GET /api/traces/:traceId/tool-calls
```

**响应**: `[]`（未实现）

##### 详细健康检查

```
GET /api/health/detailed
```

#### 2.6 状态路由（status.ts）

##### 获取状态

```
GET /api/status
```

**响应**:
```typescript
{
  lifecycle: LifecycleState;
  uptime: number;
  metrics: MetricsSnapshot;
}
```

##### 获取配置

```
GET /api/config
```

**响应**: `AgentConfig`

##### 更新配置

```
POST /api/config
```

**请求体**: `AgentConfig`

#### 2.7 自修改路由（self-modify.ts）

**前缀**: `/api/self-modify`

##### 获取修改历史

```
GET /api/self-modify
```

**响应**:
```typescript
Array<{
  commitId: string;
  message: string;
  timestamp: number;
  traceId?: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  author?: string;
}>
```

##### 获取修改详情

```
GET /api/self-modify/:commitId
```

**响应**:
```typescript
interface ModifyDetail {
  commitId: string;
  message: string;
  timestamp: number;
  traceId?: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  author?: string;
  diff?: {
    before: string;
    after: string;
  };
  metadata?: Record<string, unknown>;
}
```

##### 回滚

```
POST /api/self-modify/rollback
```

**请求体**:
```typescript
{
  commitId: string;
}
```

**响应**:
```typescript
{
  ok: boolean;
  message: string;
}
```

### 3. 健康检查

```
GET /health
```

**响应**:
```typescript
{
  status: "ok";
  version: "0.0.1";
  uptime: number;
}
```

## 公共 API 导出

### 主要导出

- `ProteusServer` - 服务器主类
- `createServer` - 工厂函数
- `ServerOptions` - 服务器选项接口
- `registerMetricsRoutes` - 指标路由注册函数
- `MetricsRoutesOptions` - 指标路由选项接口

### 类型导出

- 所有从 `@proteus/core` 重新导出的类型

## 使用示例

### 基本使用

```typescript
import { createServer } from "@proteus/server";

const server = createServer({
  port: 3000,
  host: "0.0.0.0",
  cors: true,
  llm: myLLMProvider,
});

await server.start();
// 服务器运行在 http://0.0.0.0:3000
```

### 创建会话

```typescript
const response = await fetch("http://localhost:3000/api/sessions", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "My Session",
    config: {
      sessionId: "sess-1",
      llm: { provider: "openai", model: "gpt-4", temperature: 0.7 },
      tools: {},
      logLevel: "info",
    },
  }),
});

const session = await response.json();
// { id: "sess-1", name: "My Session", createdAt: 1234567890 }
```

### 同步聊天

```typescript
const response = await fetch("http://localhost:3000/api/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: "sess-1",
    message: "Hello, how are you?",
  }),
});

const result = await response.json();
// { turnId: "turn-123", status: "completed", response: "I'm doing well..." }
```

### SSE 流式聊天

```typescript
const eventSource = new EventSource(
  "http://localhost:3000/api/chat/sess-1/stream?message=Tell%20me%20a%20story"
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.event === "chunk") {
    process.stdout.write(data.content);
  } else if (data.event === "done") {
    console.log("\nDone!", data.usage);
  }
};
```

### WebSocket 事件订阅

```typescript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => {
  ws.send(JSON.stringify({
    action: "subscribe",
    sessionId: "sess-1",
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log("Event:", data.type, data.data);
};
```

## 设计决策

1. **Fastify v5** - 高性能、类型安全的 Web 框架
2. **模块化路由** - 按功能分离，易于维护
3. **SSE 流式** - 通过 Harness 回调实现真正的流式推理
4. **WebSocket 事件总线** - 发布/订阅模式，支持全局和会话级订阅
5. **内存存储默认** - 开发环境友好，生产环境可切换 SQLite
6. **CORS 默认启用** - 方便前端开发

## 与 Core/SDK 的关系

- Server 依赖 Core，不包含独立实现
- 封装 Core 的底层类为 HTTP/WS API
- 适用于多客户端服务场景（Server 模式：每个连接一个会话）
- 提供 Studio 前端所需的 API 接口
