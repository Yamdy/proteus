# @proteus/memory 模块分析

## 模块概述

`@proteus/memory` 是 Proteus 框架的内存子系统模块，提供上下文压缩、内存存储、渐进式披露等功能。支持键值存储和向量存储，用于管理 Agent 的长期记忆。

## 架构设计

### 技术栈

- **存储**: 内存 Map、向量相似度搜索
- **嵌入**: 自定义嵌入函数（Mock 实现）
- **压缩**: 截断和 LLM 摘要策略
- **依赖**: @proteus/core

### 依赖关系

```json
{
  "dependencies": {
    "@proteus/core": "workspace:*"
  }
}
```

### 架构模式

1. **策略模式** - 可插拔的存储后端和嵌入函数
2. **模板方法** - MemoryStore 接口定义统一操作
3. **工厂模式** - 嵌入函数和存储的创建
4. **缓存模式** - ProgressiveDisclosure 的懒加载和缓存

## 核心特性

### 1. 内存类型

**文件**: `types.ts`

#### MemoryEntry

```typescript
interface MemoryEntry {
  id: string;                           // 唯一标识符
  content: string;                      // 内存内容
  metadata: Record<string, unknown>;    // 元数据
  createdAt: number;                    // 创建时间
  updatedAt: number;                    // 更新时间
  embedding?: number[];                 // 可选嵌入向量
  importance?: number;                  // 可选重要性分数
}
```

#### MemoryQuery

```typescript
interface MemoryQuery {
  text?: string;                        // 用于向量搜索的文本
  filter?: Record<string, unknown>;     // 元数据过滤器
  limit?: number;                       // 结果数量限制
  offset?: number;                      // 结果偏移
}
```

#### CompactionResult

```typescript
interface CompactionResult {
  messages: LLMMessage[];               // 压缩后的消息
  originalCount: number;                // 原始消息数
  compactedCount: number;               // 压缩后消息数
  strategy: "full" | "compacted" | "llm";  // 使用的策略
  summary?: string;                     // 摘要（非 full 策略时）
  summarizedCount?: number;             // 已摘要的消息数
}
```

### 2. MemoryStore（内存存储接口）

**文件**: `memory-store.ts`

通用内存存储接口，实现范围从内存到向量数据库。

```typescript
interface MemoryStore {
  put(entry: MemoryEntry): Promise<void>;
  get(id: string): Promise<MemoryEntry | undefined>;
  delete(id: string): Promise<void>;
  search(query: MemoryQuery): Promise<MemoryEntry[]>;
  list(): Promise<MemoryEntry[]>;
}
```

### 3. KvMemoryStore（键值内存存储）

**文件**: `kv-store.ts`

基于 Map 的内存 MemoryStore 实现。

```typescript
class KvMemoryStore implements MemoryStore {
  async put(entry: MemoryEntry): Promise<void>;
  async get(id: string): Promise<MemoryEntry | undefined>;
  async delete(id: string): Promise<void>;
  async search(query: MemoryQuery): Promise<MemoryEntry[]>;
  async list(): Promise<MemoryEntry[]>;
}
```

#### 功能特性

- 基于内存 Map 存储
- 支持元数据过滤
- 支持分页（offset/limit）
- 浅拷贝返回，避免外部修改

### 4. VectorMemoryStore（向量内存存储）

**文件**: `vector-store.ts`

基于余弦相似度的向量搜索内存存储。

```typescript
class VectorMemoryStore implements MemoryStore {
  constructor(embeddingFn?: EmbeddingFunction);

  async put(entry: MemoryEntry, embedding?: number[]): Promise<void>;
  async get(id: string): Promise<MemoryEntry | undefined>;
  async delete(id: string): Promise<void>;
  async search(query: VectorQuery): Promise<MemoryEntry[]>;
  async list(): Promise<MemoryEntry[]>;

  // 持久化
  save(): string;
  load(json: string): void;

  // 合并重复项
  async consolidate(threshold?: number): Promise<ConsolidateResult>;
}
```

#### VectorQuery

```typescript
interface VectorQuery extends MemoryQuery {
  embedding?: number[];                 // 查询向量
}
```

#### ConsolidateResult

```typescript
interface ConsolidateResult {
  removed: MemoryEntry[];               // 被移除的条目
  merged: MemoryEntry[];                // 合并后的条目
}
```

#### 功能特性

- **自动嵌入**: 配置 embeddingFn 后，put/search 自动计算嵌入
- **余弦相似度排序**: 基于向量相似度的搜索结果排序
- **JSON 持久化**: save/load 方法支持序列化和反序列化
- **合并重复项**: consolidate 方法检测并合并相似条目

#### cosineSimilarity 函数

```typescript
function cosineSimilarity(a: number[], b: number[]): number
```

纯 TypeScript 实现的余弦相似度计算。

### 5. EmbeddingFunction（嵌入函数）

**文件**: `embedding.ts`

#### 类型定义

```typescript
type EmbeddingFunction = (text: string) => Promise<number[]>;
```

#### MockEmbeddingFunction

基于哈希的确定性嵌入函数，用于测试和开发。

```typescript
class MockEmbeddingFunction {
  constructor(dimension?: number);  // 默认 128 维

  async embed(text: string): Promise<number[]>;
}
```

**特性**:
- 使用 djb2 哈希变体
- 相同文本产生相同向量
- 归一化为单位长度
- 不是语义有意义的嵌入，仅用于测试

### 6. ContextCompactor（上下文压缩器）

**文件**: `compactor.ts`

四步上下文窗口压缩。

#### 选项

```typescript
interface ContextCompactorOptions {
  recentCount?: number;                 // 保留的最近消息数，默认 10
  llmProvider?: LLMProvider;            // LLM 提供者（用于 LLM 摘要）
  summaryStrategy?: SummaryStrategy;    // 摘要策略，默认 "truncation"
  summaryMaxTokens?: number;            // LLM 摘要最大 token 数，默认 256
  summaryPrompt?: string;               // 自定义摘要提示词
}

type SummaryStrategy = "truncation" | "llm";
```

#### 核心方法

```typescript
class ContextCompactor {
  constructor(opts?: ContextCompactorOptions);

  async compact(messages: LLMMessage[], previousResult?: CompactionResult): Promise<CompactionResult>;
}
```

#### 压缩步骤

1. **保留系统提示**: role=system 的消息
2. **保留最近 N 条**: 非系统、非工具的最近消息
3. **摘要中间区域**: 截断或 LLM 摘要
4. **丢弃工具结果**: role=tool 的消息

#### 摘要策略

- **truncation**: 截断策略，生成 `[compacted: N messages summarized]` 占位符
- **llm**: LLM 摘要策略，调用 LLM 生成摘要

#### 增量摘要

支持增量摘要：当存在 previousResult 时，只摘要新消息并合并到现有摘要。

### 7. ProgressiveDisclosure（渐进式披露）

**文件**: `progressive-disclosure.ts`

懒加载标识符 → 异步加载器映射。

```typescript
class ProgressiveDisclosure<T> {
  register(id: string, loader: () => Promise<T>): void;
  async get(id: string): Promise<T>;
  invalidate(id: string): void;
  invalidateAll(): void;
  has(id: string): boolean;
  list(): string[];
}
```

#### 功能特性

- **懒加载**: 首次 get 调用时执行加载器
- **缓存**: 后续调用返回缓存值
- **失效**: 支持单个或全部缓存失效
- **注册检查**: has 方法检查标识符是否已注册

### 8. MemoryManager（内存管理器）

**文件**: `memory-manager.ts`

编排内存提取和检索。

#### 选项

```typescript
interface MemoryManagerOptions {
  store: MemoryStore;                   // 内存存储后端
  extractor?: MemoryExtractor;          // 自定义提取器
  autoWrite?: boolean;                  // 自动写入，默认 true
  autoRead?: boolean;                   // 自动读取，默认 true
  maxMemoriesPerTurn?: number;          // 每轮最大内存数，默认 5
  maxRetrievedMemories?: number;        // 检索时最大内存数，默认 10
}

type MemoryExtractor = (messages: LLMMessage[]) => MemoryEntry[];
```

#### 核心方法

```typescript
class MemoryManager {
  constructor(opts: MemoryManagerOptions);

  // 轮次结束时提取内存
  async onTurnEnd(messages: LLMMessage[]): Promise<MemoryEntry[]>;

  // 上下文组装前检索内存
  async beforeContextAssembly(query: string): Promise<MemoryEntry[]>;

  // 获取底层存储
  getStore(): MemoryStore;
}
```

#### 默认提取器

```typescript
function defaultExtractor(messages: LLMMessage[]): MemoryEntry[]
```

- 提取 user 和 assistant 消息
- 忽略空内容
- 生成唯一 ID（`mem-{timestamp}-{counter}`）

#### 功能特性

- **自动写入**: 轮次结束时自动提取并存储内存
- **自动读取**: 上下文组装前自动检索相关内存
- **相关性过滤**: 简单的关键词匹配过滤
- **可配置限制**: 控制每轮写入和检索的最大内存数

## 公共 API 导出

### 类型

- `MemoryEntry` - 内存条目
- `MemoryQuery` - 查询参数
- `CompactionResult` - 压缩结果
- `MemoryStore` - 存储接口
- `EmbeddingFunction` - 嵌入函数类型
- `VectorQuery` - 向量查询
- `ContextCompactorOptions` - 压缩器选项
- `SummaryStrategy` - 摘要策略
- `MemoryManagerOptions` - 管理器选项
- `MemoryExtractor` - 提取器类型

### 类

- `KvMemoryStore` - 键值内存存储
- `VectorMemoryStore` - 向量内存存储
- `MockEmbeddingFunction` - 模拟嵌入函数
- `ContextCompactor` - 上下文压缩器
- `ProgressiveDisclosure` - 渐进式披露
- `MemoryManager` - 内存管理器

### 函数

- `cosineSimilarity` - 余弦相似度计算

## 使用示例

### 键值存储

```typescript
import { KvMemoryStore } from "@proteus/memory";

const store = new KvMemoryStore();

// 存储内存
await store.put({
  id: "mem-1",
  content: "用户喜欢 TypeScript",
  metadata: { role: "user", topic: "preferences" },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// 检索内存
const entry = await store.get("mem-1");

// 搜索内存
const results = await store.search({
  filter: { topic: "preferences" },
  limit: 10,
});
```

### 向量存储

```typescript
import { VectorMemoryStore, MockEmbeddingFunction } from "@proteus/memory";

const embeddingFn = new MockEmbeddingFunction(128);
const store = new VectorMemoryStore(embeddingFn);

// 自动嵌入存储
await store.put({
  id: "mem-1",
  content: "用户喜欢 TypeScript",
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// 向量搜索
const results = await store.search({
  text: "编程语言偏好",
  limit: 5,
});

// 合并重复项
const { removed, merged } = await store.consolidate(0.95);

// 持久化
const json = store.save();
store.load(json);
```

### 上下文压缩

```typescript
import { ContextCompactor } from "@proteus/memory";

const compactor = new ContextCompactor({
  recentCount: 10,
  summaryStrategy: "llm",
  llmProvider: myLLMProvider,
});

const result = await compactor.compact(messages);
console.log(`压缩: ${result.originalCount} → ${result.compactedCount} 条消息`);
console.log(`策略: ${result.strategy}`);
if (result.summary) {
  console.log(`摘要: ${result.summary}`);
}

// 增量压缩
const nextResult = await compactor.compact(newMessages, result);
```

### 渐进式披露

```typescript
import { ProgressiveDisclosure } from "@proteus/memory";

const disclosure = new ProgressiveDisclosure<string>();

// 注册加载器
disclosure.register("config", async () => {
  const res = await fetch("/api/config");
  return res.json();
});

// 懒加载
const config = await disclosure.get("config"); // 首次加载
const cached = await disclosure.get("config");  // 返回缓存

// 失效缓存
disclosure.invalidate("config");
disclosure.invalidateAll();
```

### 内存管理器

```typescript
import { MemoryManager, VectorMemoryStore, MockEmbeddingFunction } from "@proteus/memory";

const store = new VectorMemoryStore(new MockEmbeddingFunction());
const manager = new MemoryManager({
  store,
  autoWrite: true,
  autoRead: true,
  maxMemoriesPerTurn: 5,
  maxRetrievedMemories: 10,
});

// 轮次结束时提取内存
const extracted = await manager.onTurnEnd(turnMessages);

// 上下文组装前检索内存
const memories = await manager.beforeContextAssembly("用户的问题");
```

## 设计决策

1. **接口抽象** - MemoryStore 接口支持多种后端实现
2. **自动嵌入** - 配置 embeddingFn 后自动计算向量
3. **增量摘要** - 支持增量 LLM 摘要，避免重复处理
4. **渐进式披露** - 懒加载和缓存，优化性能
5. **相关性过滤** - 简单的关键词匹配，可扩展为更复杂的算法

## 与 Core 的关系

- Memory 模块依赖 Core 的 LLMMessage 和 LLMProvider 类型
- 提供上下文压缩功能，可集成到 ContextAssemblyProcessor
- 提供内存存储功能，可集成到 SessionContext
- 支持跨会话的长期记忆（未来功能）
