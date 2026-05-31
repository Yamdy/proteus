# @proteus/mcp 模块分析

## 模块概述

`@proteus/mcp` 是 Proteus 框架的 MCP（Model Context Protocol）协议适配器模块，提供客户端、服务器和工具翻译功能。支持 JSON-RPC 通信，可连接本地（stdio）或远程（SSE）MCP 服务器。

## 架构设计

### 技术栈

- **协议**: MCP (Model Context Protocol) - JSON-RPC 2.0
- **传输**: stdio（子进程）、SSE（HTTP + EventSource）
- **依赖**: @proteus/core、zod、zod-to-json-schema

### 依赖关系

```json
{
  "dependencies": {
    "@proteus/core": "workspace:*",
    "zod": "^3.25.0",
    "zod-to-json-schema": "^3.25.0"
  }
}
```

### 架构模式

1. **适配器模式** - MCP 工具与 Proteus Tool 之间的双向转换
2. **传输抽象** - AbstractTransport 基类封装通用逻辑
3. **客户端/服务器模式** - McpClient 和 McpServer 分离
4. **懒发现** - 工具列表首次调用时获取并缓存

## 核心特性

### 1. MCP 协议类型

**文件**: `types.ts`

#### JSON-RPC 基础类型

```typescript
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: JsonRpcError;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
}
```

#### MCP 工具定义

```typescript
interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: JsonSchema;
}

interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

interface McpToolCallResult {
  content: McpContent[];
  isError?: boolean;
}

type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; text?: string; mimeType?: string } };
```

#### MCP 服务器信息

```typescript
interface McpServerInfo {
  name: string;
  version: string;
  capabilities?: McpServerCapabilities;
}

interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { subscribe?: boolean; listChanged?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

interface McpClientInfo {
  name: string;
  version: string;
}
```

#### JSON Schema

```typescript
interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  $ref?: string;
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  allOf?: JsonSchema[];
}
```

#### 传输类型

```typescript
interface ClientTransport {
  sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;
  sendNotification(notification: JsonRpcNotification): Promise<void>;
  close(): Promise<void>;
}

interface ServerTransport {
  receive(): Promise<JsonRpcRequest | JsonRpcNotification>;
  send(response: JsonRpcResponse): Promise<void>;
  close(): Promise<void>;
}

interface StdioTransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface SseTransportOptions {
  url: string;
  headers?: Record<string, string>;
}
```

#### MCP 方法常量

```typescript
const MCP_METHODS = {
  INITIALIZE: "initialize",
  INITIALIZED: "notifications/initialized",
  LIST_TOOLS: "tools/list",
  CALL_TOOL: "tools/call",
  SHUTDOWN: "shutdown",
} as const;
```

### 2. McpClient（MCP 客户端）

**文件**: `client.ts`

连接到 MCP 服务器，发现工具，转发调用。

#### 选项

```typescript
interface McpClientOptions {
  clientInfo?: McpClientInfo;       // 客户端信息，默认 { name: "proteus-mcp-client", version: "0.0.1" }
  maxRetries?: number;              // 最大重试次数，默认 3
  retryBaseDelayMs?: number;        // 重试基础延迟，默认 1000ms
}
```

#### 核心方法

```typescript
class McpClient {
  // 连接方法
  async connectStdio(options: StdioTransportOptions): Promise<void>;
  async connectSse(options: SseTransportOptions): Promise<void>;
  async connect(transport: ClientTransport): Promise<void>;
  async disconnect(): Promise<void>;

  // 工具发现
  async listTools(): Promise<ToolDefinition[]>;

  // 工具调用（带指数退避重试）
  async callTool(name: string, params: Record<string, unknown>): Promise<ToolResult>;

  // 获取 Proteus Tool
  getTool(name: string): Tool | null;
  async getTools(): Promise<Tool[]>;

  // 状态
  get connected(): boolean;
  get server(): McpServerInfo | null;
}
```

#### 功能特性

- **懒发现**: 首次 `listTools()` 从服务器获取，后续返回缓存
- **指数退避重试**: 瞬态失败自动重试，应用级错误不重试
- **工具转换**: MCP 工具定义自动转换为 Proteus ToolDefinition
- **优雅关闭**: 发送 shutdown 通知后关闭传输

#### McpError 类

```typescript
class McpError extends Error {
  constructor(code: number, message: string);
}
```

应用级 MCP 错误（JSON-RPC 错误响应），不会被重试。

### 3. McpServer（MCP 服务器）

**文件**: `server.ts`

将 ToolRegistry 暴露为 MCP 服务器。

#### 选项

```typescript
interface McpServerOptions {
  port?: number;                    // HTTP 端口
  host?: string;                    // 绑定地址
  serverInfo?: McpServerInfo;       // 服务器信息
}
```

#### 核心方法

```typescript
class McpServer {
  // 注册工具
  registerTool(tool: Tool): void;
  registerFromRegistry(registry: ToolRegistry): void;

  // 启动/停止
  async start(port: number, host?: string): Promise<void>;
  async serve(transport: ServerTransport): Promise<void>;
  async stop(): Promise<void>;

  // 请求处理
  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;
  async handleMessage(message: JsonRpcRequest | JsonRpcNotification): Promise<JsonRpcResponse | null>;
}
```

#### 支持的 MCP 方法

- `initialize` - 初始化握手
- `tools/list` - 列出可用工具
- `tools/call` - 调用工具
- `notifications/initialized` - 客户端确认初始化
- `shutdown` - 优雅关闭

### 4. McpToolAdapter（工具适配器）

**文件**: `adapter.ts`

MCP 工具定义与 Proteus Tool 之间的双向转换。

#### 转换函数

```typescript
// MCP → Proteus
function fromMcpTool(mcpDef: McpToolDefinition): ToolDefinition;
function fromMcpToolCallResult(mcpResult: McpToolCallResult): ToolResult;

// Proteus → MCP
function toMcpTool(tool: Tool): McpToolDefinition;
function toMcpToolCallResult(result: ToolResult): McpToolCallResult;
```

#### 转换规则

- **MCP → Proteus**: 直接映射 `inputSchema` 到 `parameters`
- **Proteus → MCP**: 自动检测 Zod schema 并转换为 JSON Schema
- **错误处理**: `isError` 标志映射到 `error` 字段

### 5. 传输层

#### 5.1 AbstractTransport（抽象传输）

**文件**: `transport/abstract.ts`

基类，封装请求/响应关联和超时逻辑。

```typescript
abstract class AbstractTransport implements ClientTransport {
  protected readonly timeoutMs: number;  // 默认 30000ms

  async sendRequest(request: JsonRpcRequest): Promise<JsonRpcResponse>;
  async sendNotification(notification: JsonRpcNotification): Promise<void>;
  async close(): Promise<void>;

  // 子类实现
  protected abstract doSend(msg: JsonRpcRequest | JsonRpcNotification): Promise<void>;
  protected abstract doClose(): Promise<void>;

  // 子类调用
  protected deliverResponse(response: JsonRpcResponse): void;
  protected rejectAll(err: Error): void;
}
```

#### 5.2 StdioTransport（标准 IO 传输）

**文件**: `transport/stdio.ts`

通过子进程的 stdin/stdout 进行 JSON-RPC 通信。

```typescript
class StdioTransport extends AbstractTransport {
  constructor(options: StdioTransportFullOptions);
}
```

**选项**:
```typescript
interface StdioTransportFullOptions extends StdioTransportOptions, AbstractTransportOptions {
  command: string;      // 要执行的命令
  args?: string[];      // 命令参数
  env?: Record<string, string>;  // 环境变量
}
```

**特性**:
- 通过 `child_process.spawn` 启动子进程
- 换行分隔的 JSON 消息
- 忽略非 JSON 输出（调试信息等）

#### 5.3 SseTransport（SSE 传输）

**文件**: `transport/sse.ts`

通过 HTTP POST + EventSource 进行 JSON-RPC 通信。

```typescript
class SseTransport extends AbstractTransport {
  constructor(options: SseTransportFullOptions);
  async connect(): Promise<void>;
}
```

**选项**:
```typescript
interface SseTransportFullOptions extends SseTransportOptions, AbstractTransportOptions {
  url: string;                        // SSE 端点 URL
  headers?: Record<string, string>;   // 自定义请求头
}
```

**特性**:
- HTTP POST 发送请求
- EventSource 接收响应
- 支持自定义请求头（认证等）

### 6. 测试工具

**文件**: `testing/in-memory-transport.ts`

内存传输，用于测试。

## 公共 API 导出

### 主要导出

- `McpClient` - MCP 客户端类
- `McpError` - MCP 错误类
- `McpServer` - MCP 服务器类
- `McpClientOptions` - 客户端选项接口
- `McpServerOptions` - 服务器选项接口

### 工具适配器

- `fromMcpTool` - MCP 工具定义 → Proteus ToolDefinition
- `toMcpTool` - Proteus Tool → MCP 工具定义
- `fromMcpToolCallResult` - MCP 结果 → Proteus ToolResult
- `toMcpToolCallResult` - Proteus ToolResult → MCP 结果

### 类型

- `JsonRpcRequest`, `JsonRpcResponse`, `JsonRpcError`, `JsonRpcNotification`
- `McpToolDefinition`, `McpToolCallParams`, `McpToolCallResult`, `McpContent`
- `McpServerInfo`, `McpServerCapabilities`, `McpClientInfo`
- `JsonSchema`
- `ClientTransport`, `ServerTransport`
- `StdioTransportOptions`, `SseTransportOptions`

### 常量

- `MCP_METHODS` - MCP 方法常量

### 传输层

- `AbstractTransport` - 抽象传输基类
- `StdioTransport` - 标准 IO 传输
- `SseTransport` - SSE 传输

## 使用示例

### 客户端连接

```typescript
import { McpClient } from "@proteus/mcp";

// 连接本地 MCP 服务器（stdio）
const client = new McpClient({
  clientInfo: { name: "my-app", version: "1.0.0" },
});

await client.connectStdio({
  command: "node",
  args: ["mcp-server.js"],
});

// 或连接远程 MCP 服务器（SSE）
await client.connectSse({
  url: "https://mcp-server.example.com/sse",
  headers: { Authorization: "Bearer token" },
});
```

### 发现和调用工具

```typescript
// 发现工具
const tools = await client.listTools();
console.log("Available tools:", tools.map(t => t.name));

// 调用工具
const result = await client.callTool("search", { query: "hello" });
console.log("Result:", result.output);

// 获取 Proteus Tool 对象
const tool = client.getTool("search");
if (tool) {
  const result = await tool.execute({ query: "hello" }, { turnId: "1", sessionId: "sess-1" });
}
```

### 暴露为 MCP 服务器

```typescript
import { McpServer } from "@proteus/mcp";
import { ToolRegistry } from "@proteus/core";

const server = new McpServer({
  serverInfo: { name: "my-tools", version: "1.0.0" },
});

// 注册单个工具
server.registerTool(myTool);

// 或从 ToolRegistry 批量注册
server.registerFromRegistry(toolRegistry);

// 启动 HTTP 服务器
await server.start(3001);

// 或在自定义传输上服务
await server.serve(myTransport);
```

### 工具适配器

```typescript
import { fromMcpTool, toMcpTool, fromMcpToolCallResult, toMcpToolCallResult } from "@proteus/mcp";

// MCP 工具定义 → Proteus
const proteusDef = fromMcpTool({
  name: "search",
  description: "Search the web",
  inputSchema: { type: "object", properties: { query: { type: "string" } } },
});

// Proteus 工具 → MCP
const mcpDef = toMcpTool(myProteusTool);

// 结果转换
const proteusResult = fromMcpToolCallResult({
  content: [{ type: "text", text: "result" }],
  isError: false,
});

const mcpResult = toMcpToolCallResult({
  output: "result",
});
```

## 设计决策

1. **JSON-RPC 2.0** - 标准协议，广泛支持
2. **传输抽象** - 支持多种传输方式（stdio、SSE）
3. **懒发现** - 首次调用时获取工具列表，减少初始化开销
4. **指数退避重试** - 处理瞬态网络故障
5. **双向适配** - MCP 与 Proteus 工具无缝转换
6. **Zod 自动转换** - 自动将 Zod schema 转换为 JSON Schema

## 与 Core 的关系

- MCP 模块依赖 Core 的 Tool 和 ToolRegistry 类型
- 提供 MCP 协议到 Proteus 内部类型的转换
- 可将 Proteus 工具暴露为 MCP 服务器
- 可连接外部 MCP 服务器并将其工具集成到 Proteus
