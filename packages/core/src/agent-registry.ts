import type { AgentDefinition, AgentRegistryEntry } from "./types.js";
import { AgentDefinitionSchema } from "./schemas/agent.js";

type RegisterResult = { ok: true } | { ok: false; reason: string };
type UnregisterResult = { ok: true } | { ok: false; reason: string };

export class AgentRegistry {
  private readonly agents = new Map<string, AgentRegistryEntry>();

  register(agent: AgentDefinition): RegisterResult {
    const validation = AgentDefinitionSchema.safeParse(agent);
    if (!validation.success) {
      return { ok: false, reason: `Invalid agent definition: ${validation.error.message}` };
    }

    if (this.agents.has(agent.id)) {
      return { ok: false, reason: `Agent "${agent.id}" is already registered` };
    }

    this.agents.set(agent.id, {
      definition: agent,
      registeredAt: Date.now(),
    });

    return { ok: true };
  }

  unregister(id: string): UnregisterResult {
    if (!this.agents.has(id)) {
      return { ok: false, reason: `Agent "${id}" not found` };
    }

    this.agents.delete(id);
    return { ok: true };
  }

  get(id: string): AgentDefinition | undefined {
    return this.agents.get(id)?.definition;
  }

  list(): AgentDefinition[] {
    return [...this.agents.values()].map((entry) => entry.definition);
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }
}
