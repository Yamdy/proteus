import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalExecutionEnvironment } from "./local-execution-env.js";
import type { ExecutionEnvironment } from "./execution-env.js";

describe("LocalExecutionEnvironment", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  describe("execute", () => {
    it("runs a command and returns stdout/stderr/exitCode", async () => {
      const env = new LocalExecutionEnvironment();
      const result = await env.execute("node", ["-e", "console.log(123)"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("123");
      expect(result.stderr).toBe("");
    });

    it("captures stderr", async () => {
      const env = new LocalExecutionEnvironment();
      const result = await env.execute("node", ["-e", "process.stderr.write('err-output')"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("err-output");
    });

    it("returns non-zero exit code for failing commands", async () => {
      const env = new LocalExecutionEnvironment();
      const result = await env.execute("node", ["-e", "process.exit(42)"]);
      expect(result.exitCode).toBe(42);
    });

    it("works with no args", async () => {
      const env = new LocalExecutionEnvironment();
      const result = await env.execute("node", ["-e", "console.log('no-args')"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("no-args");
    });

    it("respects cwd option", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "exec-env-cwd-"));
      await fsWriteFile(join(tmpDir, "marker.txt"), "found", "utf-8");
      const env = new LocalExecutionEnvironment();
      const result = await env.execute(
        "node",
        ["-e", "const fs=require('fs');console.log(fs.readFileSync('marker.txt','utf-8'))"],
        { cwd: tmpDir },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("found");
    });

    it("respects env option", async () => {
      const env = new LocalExecutionEnvironment();
      const result = await env.execute(
        "node",
        ["-e", "console.log(process.env.MY_VAR)"],
        { env: { MY_VAR: "custom-value" } },
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("custom-value");
    });

    it("throws on timeout", async () => {
      const env = new LocalExecutionEnvironment();
      await expect(
        env.execute("node", ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 100 }),
      ).rejects.toThrow(/timed out/i);
    });

    it("handles non-existent command gracefully", async () => {
      const env = new LocalExecutionEnvironment();
      const result = await env.execute("nonexistent-command-xyz");
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("readFile", () => {
    it("reads a file as UTF-8 string", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "exec-env-read-"));
      const filePath = join(tmpDir, "test.txt");
      await fsWriteFile(filePath, "Hello, world!", "utf-8");
      const env = new LocalExecutionEnvironment();
      const content = await env.readFile(filePath);
      expect(content).toBe("Hello, world!");
    });

    it("throws for non-existent file", async () => {
      const env = new LocalExecutionEnvironment();
      await expect(env.readFile("/no/such/file.txt")).rejects.toThrow();
    });

    it("handles unicode content", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "exec-env-unicode-"));
      const filePath = join(tmpDir, "unicode.txt");
      const unicodeContent = "Hello éèê 世界";
      await fsWriteFile(filePath, unicodeContent, "utf-8");
      const env = new LocalExecutionEnvironment();
      const content = await env.readFile(filePath);
      expect(content).toBe(unicodeContent);
    });
  });

  describe("writeFile", () => {
    it("writes content to a file", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "exec-env-write-"));
      const filePath = join(tmpDir, "output.txt");
      const env = new LocalExecutionEnvironment();
      await env.writeFile(filePath, "written content");
      const content = await fsReadFile(filePath, "utf-8");
      expect(content).toBe("written content");
    });

    it("overwrites existing file", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "exec-env-overwrite-"));
      const filePath = join(tmpDir, "overwrite.txt");
      await fsWriteFile(filePath, "first", "utf-8");
      const env = new LocalExecutionEnvironment();
      await env.writeFile(filePath, "second");
      const content = await fsReadFile(filePath, "utf-8");
      expect(content).toBe("second");
    });

    it("roundtrips readFile after writeFile", async () => {
      tmpDir = await mkdtemp(join(tmpdir(), "exec-env-roundtrip-"));
      const filePath = join(tmpDir, "roundtrip.txt");
      const env = new LocalExecutionEnvironment();
      await env.writeFile(filePath, "roundtrip-data");
      const content = await env.readFile(filePath);
      expect(content).toBe("roundtrip-data");
    });
  });

  describe("createSandbox", () => {
    let sandbox: Awaited<ReturnType<LocalExecutionEnvironment["createSandbox"]>> | undefined;

    afterEach(async () => {
      if (sandbox) {
        await sandbox.destroy();
        sandbox = undefined;
      }
    });

    it("returns an object implementing SandboxHandle interface", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox();
      expect(typeof sandbox.execute).toBe("function");
      expect(typeof sandbox.readFile).toBe("function");
      expect(typeof sandbox.writeFile).toBe("function");
      expect(typeof sandbox.destroy).toBe("function");
    });

    it("sandbox.execute runs commands", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox();
      const result = await sandbox.execute("node", ["-e", "console.log(123)"]);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("123");
    });

    it("sandbox.readFile/writeFile roundtrip", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox();
      await sandbox.writeFile("test.txt", "sandbox-data");
      const content = await sandbox.readFile("test.txt");
      expect(content).toBe("sandbox-data");
    });

    it("sandbox.destroy removes the temp directory", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox();
      await sandbox.writeFile("to-delete.txt", "will be gone");
      await sandbox.destroy();
      sandbox = undefined;
      const sandbox2 = await env.createSandbox();
      await expect(sandbox2.readFile("to-delete.txt")).rejects.toThrow();
      await sandbox2.destroy();
    });

    it("sandbox.destroy is safe to call multiple times", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox();
      await sandbox.destroy();
      await sandbox.destroy();
      sandbox = undefined;
    });

    it("accepts SandboxOptions", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox({ memoryMb: 256, networkAccess: false });
      const result = await sandbox.execute("node", ["-e", "console.log(123)"]);
      expect(result.exitCode).toBe(0);
    });

    it("two sandboxes have separate filesystems", async () => {
      const env = new LocalExecutionEnvironment();
      const sb1 = await env.createSandbox();
      const sb2 = await env.createSandbox();
      await sb1.writeFile("only-in-1.txt", "sandbox 1");
      await sb2.writeFile("only-in-2.txt", "sandbox 2");
      await expect(sb1.readFile("only-in-2.txt")).rejects.toThrow();
      await expect(sb2.readFile("only-in-1.txt")).rejects.toThrow();
      expect(await sb1.readFile("only-in-1.txt")).toBe("sandbox 1");
      expect(await sb2.readFile("only-in-2.txt")).toBe("sandbox 2");
      await sb1.destroy();
      await sb2.destroy();
    });

    it("sandbox.writeFile creates intermediate directories", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox();
      await sandbox.writeFile("a/b/c/deep.txt", "deep content");
      const content = await sandbox.readFile("a/b/c/deep.txt");
      expect(content).toBe("deep content");
    });

    it("sandbox handles unicode content", async () => {
      const env = new LocalExecutionEnvironment();
      sandbox = await env.createSandbox();
      const unicodeContent = "Hello éèê 世界";
      await sandbox.writeFile("unicode.txt", unicodeContent);
      const content = await sandbox.readFile("unicode.txt");
      expect(content).toBe(unicodeContent);
    });
  });

  describe("interface completeness", () => {
    it("implements all ExecutionEnvironment methods", () => {
      const env: ExecutionEnvironment = new LocalExecutionEnvironment();
      expect(typeof env.execute).toBe("function");
      expect(typeof env.readFile).toBe("function");
      expect(typeof env.writeFile).toBe("function");
      expect(typeof env.createSandbox).toBe("function");
    });
  });
});
