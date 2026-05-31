# @proteus/studio 模块分析

## 模块概述

`@proteus/studio` 是 Proteus 框架的浏览器 UI 模块，一个独立的 SPA（单页应用），使用 React 18 + Vite + Tailwind CSS + Zustand 构建。提供 Agent 配置、会话管理、可观测性可视化、自修改历史等功能。

## 架构设计

### 技术栈

- **前端框架**: React 18
- **构建工具**: Vite 6
- **状态管理**: Zustand 5
- **样式**: Tailwind CSS 3
- **路由**: React Router DOM 6
- **代码编辑器**: CodeMirror 6
- **图表**: Recharts 2
- **Markdown**: react-markdown + rehype-highlight
- **测试**: Playwright（E2E）

### 依赖关系

```json
{
  "dependencies": {
    "@codemirror/lang-javascript": "^6.2.5",
    "@codemirror/theme-one-dark": "^6.1.3",
    "@uiw/react-codemirror": "^4.25.10",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-markdown": "^10.1.0",
    "react-router-dom": "^6.28.0",
    "recharts": "^2.15.0",
    "rehype-highlight": "^7.0.2",
    "zustand": "^5.0.2"
  }
}
```

### 架构模式

1. **Hooks 模式** - 自定义 Hooks 封装业务逻辑
2. **Store 模式** - Zustand 管理全局状态
3. **API 抽象** - 集中式 fetch 封装
4. **组件化** - 可复用的 UI 组件

## 核心特性

### 1. API 层

**文件**: `lib/api.ts`

#### ApiError 类

```typescript
class ApiError extends Error {
  constructor(status: number, message: string);
}
```

#### apiFetch 函数

```typescript
async function apiFetch<T>(url: string, options?: RequestInit): Promise<T>
```

- 统一的错误处理
- 自动 JSON 解析
- 空响应返回 undefined

### 2. 状态管理

#### 2.1 Session Store

**文件**: `stores/sessionStore.ts`

##### 类型定义

```typescript
interface Session {
  id: string;
  name: string;
  createdAt: number;
}

interface Message {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  streaming?: boolean;
}
```

##### 状态接口

```typescript
interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  messages: Record<string, Message[]>;

  // Session actions
  setSessions: (sessions: Session[]) => void;
  addSession: (session: Session) => void;
  removeSession: (id: string) => void;
  setCurrentSession: (session: Session | null) => void;

  // Message actions
  addMessage: (sessionId: string, message: Message) => void;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  appendToMessage: (sessionId: string, messageId: string, chunk: string) => void;
  setMessageStreaming: (sessionId: string, messageId: string, streaming: boolean) => void;
  setMessages: (sessionId: string, messages: Message[]) => void;
}
```

##### 使用方式

```typescript
const { sessions, currentSession, addMessage } = useSessionStore();
```

#### 2.2 Connection Store

**文件**: `stores/connectionStore.ts`

```typescript
interface ConnectionState {
  connected: boolean;
  reconnecting: boolean;
  connect: () => void;
  disconnect: () => void;
}
```

### 3. 自定义 Hooks

#### 3.1 useSession

**文件**: `hooks/useSession.ts`

会话管理 Hook，封装会话 CRUD 操作。

##### 返回值

```typescript
interface UseSessionReturn {
  sessions: Session[];
  currentSession: Session | null;
  loading: boolean;
  error: string | null;
  fetchSessions: () => Promise<void>;
  createSession: (name?: string) => Promise<Session>;
  deleteSession: (id: string) => Promise<void>;
  fetchMessages: (sessionId: string) => Promise<void>;
  setCurrentSession: (session: Session | null) => void;
}
```

##### API 端点

- `GET /api/sessions` - 获取会话列表
- `POST /api/sessions` - 创建会话
- `DELETE /api/sessions/:id` - 删除会话
- `GET /api/sessions/:id/messages` - 获取消息历史

#### 3.2 useChat

**文件**: `hooks/useChat.ts`

聊天功能 Hook，封装消息发送和流式响应。

##### 返回值

```typescript
interface UseChatReturn {
  sendMessage: (sessionId: string, content: string) => Promise<Message>;
  streamResponse: (sessionId: string, content: string, options?: SendMessageOptions) => Promise<Message>;
  cancelStream: () => void;
}
```

##### SendMessageOptions

```typescript
interface SendMessageOptions {
  onChunk?: (chunk: string) => void;
  onComplete?: (fullContent: string) => void;
  onError?: (error: Error) => void;
  maxRetries?: number;
}
```

##### 功能特性

- 自动重试（默认 2 次）
- 流式响应处理
- 中断支持（AbortController）
- 实时消息更新

#### 3.3 useConfig

**文件**: `hooks/useConfig.ts`

配置管理 Hook，支持三级配置。

##### 类型定义

```typescript
interface LLMConfig {
  provider: string;
  model: string;
  temperature: number;
}

interface ToolConfig {
  name: string;
  enabled: boolean;
  description?: string;
}

interface Level0Config {
  llm: LLMConfig;
  tools: ToolConfig[];
  logLevel: "debug" | "info" | "warn" | "error";
  systemPrompt: string;
}

interface HandlerConfig {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  description?: string;
  config?: Record<string, unknown>;
}

interface Level1Config {
  handlers: HandlerConfig[];
}

interface Level2Config {
  code: string;
  language: string;
}

interface AgentConfig {
  level0: Level0Config;
  level1: Level1Config;
  level2: Level2Config;
}
```

##### 返回值

```typescript
interface UseConfigReturn {
  config: AgentConfig | null;
  loading: boolean;
  error: string | null;
  fetchConfig: () => Promise<void>;
  updateConfig: (patch: Partial<AgentConfig>) => Promise<void>;
  updateLevel0: (config: Level0Config) => Promise<void>;
  updateLevel1: (config: Level1Config) => Promise<void>;
  updateLevel2: (code: string) => Promise<void>;
  saving: boolean;
}
```

##### API 端点

- `GET /api/config` - 获取配置
- `POST /api/config` - 更新配置

#### 3.4 useObservability

**文件**: `hooks/useObservability.ts`

可观测性 Hook，提供追踪、指标、成本、WebSocket 事件订阅。

##### 类型定义

```typescript
type PhaseName =
  | "context_assembly"
  | "llm_inference"
  | "action_resolution"
  | "tool_execution"
  | "result_observation";

interface PhaseEvent {
  phase: PhaseName;
  status: "started" | "completed" | "error";
  timestamp: number;
  duration?: number;
  traceId: string;
  sessionId?: string;
  turnId?: string;
  metadata?: Record<string, unknown>;
}

interface TraceSpan {
  id: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error" | "unset";
  attributes?: Record<string, unknown>;
  events?: Array<{
    name: string;
    timestamp: number;
    attributes?: Record<string, unknown>;
  }>;
}

interface Trace {
  traceId: string;
  sessionId: string;
  turnId?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error" | "unset";
  spans: TraceSpan[];
}

interface ToolCallMetric {
  id: string;
  traceId: string;
  toolName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error";
  parameters?: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

interface CostEntry {
  id: string;
  sessionId: string;
  turnId?: string;
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
}

interface CostSummary {
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
  byTurn: CostEntry[];
}

interface MetricsSnapshot {
  totalTraces: number;
  totalSpans: number;
  averageLatencyMs: number;
  errorRate: number;
  phaseBreakdown: Record<PhaseName, { count: number; avgDurationMs: number }>;
  toolCallStats: Array<{
    toolName: string;
    count: number;
    avgDurationMs: number;
    errorRate: number;
  }>;
}
```

##### 返回值

```typescript
interface UseObservabilityReturn {
  traces: Trace[];
  metrics: MetricsSnapshot | null;
  costs: CostSummary | null;
  toolCalls: ToolCallMetric[];
  phaseEvents: PhaseEvent[];
  loading: boolean;
  loadingTraces: boolean;
  loadingMetrics: boolean;
  loadingCosts: boolean;
  error: string | null;
  wsConnected: boolean;
  fetchTraces: (params?: { sessionId?: string; limit?: number }) => Promise<void>;
  fetchMetrics: () => Promise<void>;
  fetchCosts: (params?: { sessionId?: string }) => Promise<void>;
  fetchToolCalls: (traceId: string) => Promise<void>;
  subscribeToEvents: () => void;
  unsubscribeFromEvents: () => void;
  clearPhaseEvents: () => void;
}
```

##### API 端点

- `GET /api/traces/:sessionId` - 获取追踪
- `GET /api/metrics` - 获取指标
- `GET /api/costs` - 获取成本
- `GET /api/costs/:sessionId` - 获取会话成本
- `GET /api/traces/:traceId/tool-calls` - 获取工具调用
- `ws://host/ws` - WebSocket 事件订阅

##### WebSocket 功能

- 自动重连（3 秒间隔）
- 阶段事件订阅
- 自修改事件监听

#### 3.5 useSelfModify

**文件**: `hooks/useSelfModify.ts`

自修改历史管理 Hook。

##### 类型定义

```typescript
interface ModifyHistoryEntry {
  commitId: string;
  message: string;
  timestamp: number;
  traceId?: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  author?: string;
}

interface ModifyDetail {
  commitId: string;
  message: string;
  timestamp: number;
  traceId?: string;
  action: "register" | "replace" | "unregister";
  handlerName: string;
  diff?: {
    before: string;
    after: string;
  };
  metadata?: Record<string, unknown>;
}
```

##### 返回值

```typescript
interface UseSelfModifyReturn {
  history: ModifyHistoryEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: ModifyDetail | null;
  fetchHistory: () => Promise<void>;
  fetchDetail: (commitId: string) => Promise<void>;
  rollback: (commitId: string) => Promise<void>;
  rollingBack: boolean;
  clearSelection: () => void;
}
```

##### API 端点

- `GET /api/self-modify` - 获取修改历史
- `GET /api/self-modify/:commitId` - 获取修改详情
- `POST /api/self-modify/rollback` - 回滚

### 4. 工具函数

**文件**: `lib/format.ts`

格式化工具函数（未读取，但存在）。

## 公共 API 导出

### Hooks

- `useSession` - 会话管理
- `useChat` - 聊天功能
- `useConfig` - 配置管理
- `useObservability` - 可观测性
- `useSelfModify` - 自修改历史

### Stores

- `useSessionStore` - 会话状态
- `useConnectionStore` - 连接状态

### 类型

- `Session`, `Message` - 会话和消息类型
- `LLMConfig`, `ToolConfig`, `Level0Config`, `Level1Config`, `Level2Config`, `AgentConfig` - 配置类型
- `PhaseName`, `PhaseEvent`, `TraceSpan`, `Trace`, `ToolCallMetric`, `CostEntry`, `CostSummary`, `MetricsSnapshot` - 可观测性类型
- `ModifyHistoryEntry`, `ModifyDetail` - 自修改类型

### API 层

- `apiFetch` - 通用 fetch 封装
- `ApiError` - API 错误类

## 使用示例

### 会话管理

```typescript
import { useSession } from "./hooks/useSession";

function SessionList() {
  const { sessions, currentSession, fetchSessions, createSession, deleteSession } = useSession();

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div>
      {sessions.map(session => (
        <div key={session.id}>
          {session.name}
          <button onClick={() => deleteSession(session.id)}>Delete</button>
        </div>
      ))}
      <button onClick={() => createSession("New Session")}>Create</button>
    </div>
  );
}
```

### 聊天功能

```typescript
import { useChat } from "./hooks/useChat";

function ChatWindow({ sessionId }: { sessionId: string }) {
  const { sendMessage, streamResponse, cancelStream } = useChat();
  const [input, setInput] = useState("");

  const handleSend = async () => {
    await sendMessage(sessionId, input);
    await streamResponse(sessionId, input, {
      onChunk: (chunk) => console.log("Chunk:", chunk),
      onComplete: (content) => console.log("Complete:", content),
    });
    setInput("");
  };

  return (
    <div>
      <input value={input} onChange={e => setInput(e.target.value)} />
      <button onClick={handleSend}>Send</button>
      <button onClick={cancelStream}>Cancel</button>
    </div>
  );
}
```

### 配置管理

```typescript
import { useConfig } from "./hooks/useConfig";

function ConfigEditor() {
  const { config, updateLevel0, updateLevel1, updateLevel2, saving } = useConfig();

  if (!config) return <div>Loading...</div>;

  return (
    <div>
      <h2>LLM Config</h2>
      <input
        value={config.level0.llm.model}
        onChange={e => updateLevel0({
          ...config.level0,
          llm: { ...config.level0.llm, model: e.target.value }
        })}
      />
      <h2>Code</h2>
      <textarea
        value={config.level2.code}
        onChange={e => updateLevel2(e.target.value)}
      />
      {saving && <div>Saving...</div>}
    </div>
  );
}
```

### 可观测性

```typescript
import { useObservability } from "./hooks/useObservability";

function ObservabilityPanel() {
  const {
    metrics,
    costs,
    phaseEvents,
    wsConnected,
    fetchMetrics,
    fetchCosts,
    subscribeToEvents,
  } = useObservability();

  useEffect(() => {
    fetchMetrics();
    fetchCosts();
    subscribeToEvents();
  }, [fetchMetrics, fetchCosts, subscribeToEvents]);

  return (
    <div>
      <div>WebSocket: {wsConnected ? "Connected" : "Disconnected"}</div>
      <div>Total Traces: {metrics?.totalTraces}</div>
      <div>Total Cost: ${costs?.totalCostUsd}</div>
      <div>Phase Events: {phaseEvents.length}</div>
    </div>
  );
}
```

### 自修改历史

```typescript
import { useSelfModify } from "./hooks/useSelfModify";

function SelfModifyHistory() {
  const { history, selectedEntry, fetchDetail, rollback, rollingBack } = useSelfModify();

  return (
    <div>
      {history.map(entry => (
        <div key={entry.commitId}>
          {entry.message}
          <button onClick={() => fetchDetail(entry.commitId)}>Detail</button>
          <button onClick={() => rollback(entry.commitId)} disabled={rollingBack}>
            Rollback
          </button>
        </div>
      ))}
      {selectedEntry && (
        <pre>{selectedEntry.diff?.after}</pre>
      )}
    </div>
  );
}
```

## 设计决策

1. **React 18** - 现代 React 特性（并发模式、自动批处理）
2. **Zustand** - 轻量级状态管理，避免 Redux 样板代码
3. **自定义 Hooks** - 业务逻辑与 UI 分离
4. **API 抽象** - 统一的错误处理和 JSON 解析
5. **WebSocket 自动重连** - 提供可靠的实时连接
6. **CodeMirror 6** - 模块化代码编辑器，支持 TypeScript 高亮
7. **Tailwind CSS** - 实用优先的 CSS 框架
8. **E2E 测试** - Playwright 确保关键用户流程正常

## 与 Server 的关系

- Studio 是独立的 SPA，通过 API 与 Server 通信
- 消费 Server 的 HTTP/WebSocket API
- 不直接依赖 Core，通过 Server 间接使用
- 适合客户端渲染，无需 SSR
