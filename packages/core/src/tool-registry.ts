import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";
import type { Tool, ToolDefinition, ToolResult, TurnContext } from "./index.js";

interface RegisteredTool {
  tool: Tool;
  zodSchema?: z.ZodType;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(tool: Tool, zodSchema?: z.ZodType): void {
    const name = tool.definition.name;
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`);
    }
    this.tools.set(name, { tool, zodSchema });
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)?.tool;
  }

  list(): string[] {
    return [...this.tools.keys()];
  }

  getDefinitions(): ToolDefinition[] {
    const defs: ToolDefinition[] = [];
    for (const [, entry] of this.tools) {
      const def = entry.tool.definition;
      if (entry.zodSchema) {
        const jsonSchema = zodToJsonSchema(entry.zodSchema) as Record<string, unknown>;
        defs.push({ ...def, parameters: jsonSchema });
      } else {
        defs.push(def);
      }
    }
    return defs;
  }

  async execute(name: string, params: Record<string, unknown>, context: TurnContext): Promise<ToolResult> {
    const entry = this.tools.get(name);
    if (!entry) {
      throw new Error(`Tool "${name}" not found in registry`);
    }

    if (entry.zodSchema) {
      const result = entry.zodSchema.safeParse(params);
      if (!result.success) {
        throw new Error(`Validation error for tool "${name}": ${result.error.message}`);
      }
      return entry.tool.execute(result.data, context);
    }

    return entry.tool.execute(params, context);
  }
}
