import { describe, it, expect, beforeEach } from "vitest";
import { AgentRegistry } from "./agent-registry.js";
import type { AgentDefinition } from "./types.js";

function makeAgent(overrides?: Partial<AgentDefinition>): AgentDefinition {
  return {
    id: "test-agent",
    name: "Test Agent",
    description: "A test agent",
    systemPrompt: "You are a test agent.",
    ...overrides,
  };
}

describe("AgentRegistry", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  describe("register()", () => {
    it("registers a valid agent definition", () => {
      const result = registry.register(makeAgent());
      expect(result).toEqual({ ok: true });
      expect(registry.has("test-agent")).toBe(true);
    });

    it("rejects duplicate registration", () => {
      registry.register(makeAgent());
      const result = registry.register(makeAgent());
      expect(result).toEqual({ ok: false, reason: 'Agent "test-agent" is already registered' });
    });

    it("rejects invalid definition (missing id)", () => {
      const result = registry.register(makeAgent({ id: "" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Invalid agent definition");
      }
    });

    it("rejects invalid definition (missing name)", () => {
      const result = registry.register(makeAgent({ name: "" }));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain("Invalid agent definition");
      }
    });

    it("accepts optional fields", () => {
      const result = registry.register(
        makeAgent({
          tools: ["tool-a", "tool-b"],
          model: "gpt-4",
          metadata: { version: 1 },
        }),
      );
      expect(result).toEqual({ ok: true });
    });
  });

  describe("unregister()", () => {
    it("removes an existing agent", () => {
      registry.register(makeAgent());
      const result = registry.unregister("test-agent");
      expect(result).toEqual({ ok: true });
      expect(registry.has("test-agent")).toBe(false);
    });

    it("returns error for non-existent agent", () => {
      const result = registry.unregister("missing-agent");
      expect(result).toEqual({ ok: false, reason: 'Agent "missing-agent" not found' });
    });
  });

  describe("get()", () => {
    it("returns the agent definition for a registered id", () => {
      const agent = makeAgent();
      registry.register(agent);
      expect(registry.get("test-agent")).toEqual(agent);
    });

    it("returns undefined for unknown id", () => {
      expect(registry.get("unknown")).toBeUndefined();
    });
  });

  describe("list()", () => {
    it("returns empty array when no agents registered", () => {
      expect(registry.list()).toEqual([]);
    });

    it("returns all registered agent definitions", () => {
      registry.register(makeAgent({ id: "a", name: "A" }));
      registry.register(makeAgent({ id: "b", name: "B" }));
      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.map((a) => a.id).sort()).toEqual(["a", "b"]);
    });
  });

  describe("has()", () => {
    it("returns true for registered agent", () => {
      registry.register(makeAgent());
      expect(registry.has("test-agent")).toBe(true);
    });

    it("returns false for unregistered agent", () => {
      expect(registry.has("test-agent")).toBe(false);
    });
  });
});
