// SchemaRegistry — validation utility for Proteus schemas

import { z } from "zod";
import { ToolDefinitionSchema, ToolResultSchema } from "./tool.js";
import { HandlerResultSchema } from "./handler.js";
import { SessionConfigSchema } from "./session.js";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: z.ZodIssue[];
}

export class SchemaRegistry {
  private schemas = new Map<string, z.ZodTypeAny>();

  constructor() {
    // Register built-in schemas
    this.register("ToolDefinition", ToolDefinitionSchema);
    this.register("ToolResult", ToolResultSchema);
    this.register("HandlerResult", HandlerResultSchema);
    this.register("SessionConfig", SessionConfigSchema);
  }

  register<T extends z.ZodTypeAny>(name: string, schema: T): void {
    this.schemas.set(name, schema);
  }

  get(name: string): z.ZodTypeAny | undefined {
    return this.schemas.get(name);
  }

  validate<T>(name: string, data: unknown): ValidationResult<T> {
    const schema = this.schemas.get(name);
    if (!schema) {
      return { success: false, errors: [{ message: `Schema '${name}' not found`, path: [], code: "custom" }] };
    }

    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data as T };
    }
    return { success: false, errors: result.error.issues };
  }

  validateOrThrow<T>(name: string, data: unknown): T {
    const schema = this.schemas.get(name);
    if (!schema) {
      throw new Error(`Schema '${name}' not found`);
    }
    return schema.parse(data) as T;
  }

  has(name: string): boolean {
    return this.schemas.has(name);
  }

  list(): string[] {
    return Array.from(this.schemas.keys());
  }
}

export function createSchemaRegistry(): SchemaRegistry {
  return new SchemaRegistry();
}
