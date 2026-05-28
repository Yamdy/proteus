import { generateText, streamText } from "ai";
import type { LanguageModel } from "ai";
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  ToolDefinition,
  ToolCall,
} from "./index.js";

export interface VercelLLMConfig {
  provider: string;
  model: string;
  temperature?: number;
  apiKey?: string;
  modelInstance?: LanguageModel;
}

const PROVIDER_MODULES: Record<string, string> = {
  openai: "@ai-sdk/openai",
  anthropic: "@ai-sdk/anthropic",
  google: "@ai-sdk/google",
};

function mapMessages(messages: LLMMessage[]) {
  return messages.map((m) => {
    if (m.role === "system") {
      return { role: "system" as const, content: m.content };
    }
    if (m.role === "user") {
      return { role: "user" as const, content: [{ type: "text" as const, text: m.content }] };
    }
    if (m.role === "assistant") {
      return { role: "assistant" as const, content: [{ type: "text" as const, text: m.content }] };
    }
    // tool role
    return { role: "tool" as const, content: [{ type: "tool-result" as const, toolCallId: m.toolCallId ?? "", toolName: m.name ?? "", output: { type: "json" as const, value: m.content } }] };
  });
}

function mapTools(tools: ToolDefinition[]) {
  const mapped: Record<string, { description: string; parameters: Record<string, unknown> }> = {};
  for (const t of tools) {
    mapped[t.name] = {
      description: t.description,
      parameters: t.parameters,
    };
  }
  return mapped;
}

function mapToolCalls(toolCalls: any[]): ToolCall[] {
  if (!toolCalls || toolCalls.length === 0) return [];
  return toolCalls.map((tc) => ({
    id: tc.toolCallId ?? tc.id ?? "",
    name: tc.toolName ?? tc.name ?? "",
    arguments: tc.input ?? tc.arguments ?? {},
  }));
}

function mapFinishReason(reason: string): LLMResponse["finishReason"] {
  switch (reason) {
    case "stop": return "stop";
    case "tool-calls": return "tool_call";
    case "length": return "length";
    default: return "error";
  }
}

export class VercelLLMProvider implements LLMProvider {
  private readonly model: LanguageModel;
  private readonly temperature: number;

  constructor(config: VercelLLMConfig) {
    this.temperature = config.temperature ?? 0;
    if (config.modelInstance) {
      this.model = config.modelInstance;
    } else {
      const apiKeyEnv = config.apiKey ? { apiKey: config.apiKey } : {};
      const modName = PROVIDER_MODULES[config.provider];
      if (!modName) {
        throw new Error(`Unsupported provider: ${config.provider}`);
      }
      // Dynamic import is async; store a promise and resolve in constructor alternative.
      // For sync construction, we require the caller to pass a modelInstance or use the
      // string-based model ID pattern supported by AI SDK.
      this.model = `${config.provider}/${config.model}` as unknown as LanguageModel;
    }
  }

  async chat(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    const result = await generateText({
      model: this.model,
      messages: mapMessages(messages),
      tools: mapTools(tools),
      temperature: this.temperature,
    });

    return {
      content: result.text ?? "",
      toolCalls: mapToolCalls(result.toolCalls as any[]) ?? [],
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
      },
      finishReason: mapFinishReason(result.finishReason),
    };
  }

  async *chatStream(messages: LLMMessage[], tools: ToolDefinition[]): AsyncIterable<LLMResponse> {
    const result = streamText({
      model: this.model,
      messages: mapMessages(messages),
      tools: mapTools(tools),
      temperature: this.temperature,
    });

    const toolCalls: ToolCall[] = [];
    let finishReason: LLMResponse["finishReason"] = "stop";
    let usage = { promptTokens: 0, completionTokens: 0 };

    for await (const chunk of (await result).fullStream) {
      if (chunk.type === "text") {
        yield {
          content: chunk.text,
          usage: { promptTokens: 0, completionTokens: 0 },
          finishReason: "stop",
        };
      } else if (chunk.type === "tool-call") {
        toolCalls.push({
          id: (chunk as any).toolCallId ?? "",
          name: (chunk as any).toolName ?? "",
          arguments: (chunk as any).input ?? {},
        });
      } else if (chunk.type === "finish") {
        finishReason = mapFinishReason((chunk as any).finishReason);
        usage = {
          promptTokens: (chunk as any).usage?.promptTokens ?? 0,
          completionTokens: (chunk as any).usage?.completionTokens ?? 0,
        };
      }
    }

    if (toolCalls.length > 0) {
      yield { content: "", toolCalls, usage, finishReason };
    }

    yield { content: "", usage, finishReason };
  }

  countTokens(text: string): number {
    // Rough approximation: ~4 chars per token for English
    return Math.ceil(text.length / 4);
  }
}
