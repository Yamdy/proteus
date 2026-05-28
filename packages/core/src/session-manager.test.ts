import { describe, it, expect, beforeEach } from "vitest";
import { SessionManager } from "./session-manager.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import type { SessionConfig } from "./index.js";

function testConfig(sessionId: string): SessionConfig {
  return {
    sessionId,
    llm: { provider: "openai", model: "gpt-4o", temperature: 0 },
    tools: {},
    logLevel: "info",
  };
}

describe("SessionManager", () => {
  let store: InMemoryCheckpointStore;

  beforeEach(() => {
    store = new InMemoryCheckpointStore();
  });

  describe("create()", () => {
    it("creates a new SessionContext and returns it", () => {
      const mgr = new SessionManager({ store });
      const session = mgr.create("s1", testConfig("s1"));
      expect(session.sessionId).toBe("s1");
    });

    it("persists session to CheckpointStore", () => {
      const mgr = new SessionManager({ store });
      mgr.create("s1", testConfig("s1"));
      expect(store.loadSession("s1")).toBeDefined();
      expect(store.loadSession("s1")!.sessionId).toBe("s1");
    });

    it("throws on duplicate session ID", () => {
      const mgr = new SessionManager({ store });
      mgr.create("s1", testConfig("s1"));
      expect(() => mgr.create("s1", testConfig("s1"))).toThrow(/already exists/i);
    });
  });

  describe("get()", () => {
    it("returns existing session", () => {
      const mgr = new SessionManager({ store });
      const created = mgr.create("s1", testConfig("s1"));
      expect(mgr.get("s1")).toBe(created);
    });

    it("returns undefined for unknown session", () => {
      const mgr = new SessionManager({ store });
      expect(mgr.get("unknown")).toBeUndefined();
    });
  });

  describe("destroy()", () => {
    it("removes session from memory", () => {
      const mgr = new SessionManager({ store });
      mgr.create("s1", testConfig("s1"));
      mgr.destroy("s1");
      expect(mgr.get("s1")).toBeUndefined();
      expect(mgr.list()).toEqual([]);
    });

    it("marks session as destroyed in store", () => {
      const mgr = new SessionManager({ store });
      mgr.create("s1", testConfig("s1"));
      mgr.destroy("s1");
      const meta = store.loadSession("s1");
      expect(meta).toBeDefined();
      expect((meta as any).destroyed).toBe(true);
    });

    it("destroy on nonexistent session is a no-op", () => {
      const mgr = new SessionManager({ store });
      expect(() => mgr.destroy("nope")).not.toThrow();
    });
  });

  describe("list()", () => {
    it("returns all active session IDs", () => {
      const mgr = new SessionManager({ store });
      mgr.create("s1", testConfig("s1"));
      mgr.create("s2", testConfig("s2"));
      expect(mgr.list().sort()).toEqual(["s1", "s2"]);
    });

    it("excludes destroyed sessions", () => {
      const mgr = new SessionManager({ store });
      mgr.create("s1", testConfig("s1"));
      mgr.create("s2", testConfig("s2"));
      mgr.destroy("s1");
      expect(mgr.list()).toEqual(["s2"]);
    });

    it("returns empty array when no sessions", () => {
      const mgr = new SessionManager({ store });
      expect(mgr.list()).toEqual([]);
    });
  });

  describe("loads from store on construction", () => {
    it("restores sessions from CheckpointStore", () => {
      const mgr1 = new SessionManager({ store });
      mgr1.create("s1", testConfig("s1"));
      mgr1.create("s2", testConfig("s2"));

      // Simulate restart: new SessionManager with same store
      const mgr2 = new SessionManager({ store });
      expect(mgr2.list().sort()).toEqual(["s1", "s2"]);
      expect(mgr2.get("s1")!.sessionId).toBe("s1");
    });

    it("does not restore destroyed sessions", () => {
      const mgr1 = new SessionManager({ store });
      mgr1.create("s1", testConfig("s1"));
      mgr1.create("s2", testConfig("s2"));
      mgr1.destroy("s1");

      const mgr2 = new SessionManager({ store });
      expect(mgr2.list()).toEqual(["s2"]);
    });
  });
});
