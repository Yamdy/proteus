import { describe, it, expect } from "vitest";
import { SqliteMemoryProvider } from "../sqlite-provider.js";
import { runConformanceTests } from "./memory-provider.conformance.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("SqliteMemoryProvider - conformance suite", () => {
  runConformanceTests(function() { return new SqliteMemoryProvider(":memory:"); });
});

describe("SqliteMemoryProvider - persistence", () => {
  it("persists data across reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "proteus-mem-test-"));
    const dbPath = join(dir, "test.db");
    try {
      const p1 = new SqliteMemoryProvider(dbPath);
      p1.createThread({ threadId: "t1", sessionId: "s1", name: "Thread", createdAt: 1000, updatedAt: 1000 });
      p1.addEntry("t1", { id: "e1", role: "user", content: "persisted", timestamp: 1000 });
      p1.setWorkingMemory("t1", { key: "val" });
      p1.close();

      const p2 = new SqliteMemoryProvider(dbPath);
      expect(p2.getHistory("t1")[0]!.content).toBe("persisted");
      expect(p2.getWorkingMemory("t1")).toEqual({ key: "val" });
      expect(p2.getThread("t1")!.name).toBe("Thread");
      p2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("SqliteMemoryProvider - schema", () => {
  it("creates all 3 memory tables on initialization", () => {
    const provider = new SqliteMemoryProvider(":memory:");
    const db = (provider as any).db;
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
    const tables = rows.map(function(r: { name: string }) { return r.name; });
    expect(tables).toContain("memory_entries");
    expect(tables).toContain("working_memory");
    expect(tables).toContain("memory_threads");
    provider.close();
  });

  it("enables WAL mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "proteus-wal-test-"));
    const provider = new SqliteMemoryProvider(join(dir, "wal.db"));
    const db = (provider as any).db;
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
    provider.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates an index on memory_entries(thread_id, timestamp)", () => {
    const provider = new SqliteMemoryProvider(":memory:");
    const db = (provider as any).db;
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_memory_entries_thread'").all() as { name: string }[];
    expect(rows).toHaveLength(1);
    provider.close();
  });
});
