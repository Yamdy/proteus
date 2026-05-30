// @proteus/core — LocalExecutionEnvironment
//
// Default ExecutionEnvironment backed by child_process.execFile and
// node:fs/promises. createSandbox() creates an isolated temp directory
// with its own filesystem root.

import { execFile } from "node:child_process";
import { readFile as fsReadFile, writeFile as fsWriteFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, isAbsolute } from "node:path";
import { promisify } from "node:util";

import type {
  ExecutionEnvironment,
  ExecOptions,
  ExecResult,
} from "./execution-env.js";
import type { SandboxHandle, SandboxOptions, SandboxResult } from "./types.js";

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 1024 * 1024; // 1 MB

export class LocalExecutionEnvironment implements ExecutionEnvironment {
  async execute(
    command: string,
    args?: string[],
    options?: ExecOptions,
  ): Promise<ExecResult> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBuffer = options?.maxBuffer ?? DEFAULT_MAX_BUFFER;

    try {
      const { stdout, stderr } = await execFileAsync(command, args ?? [], {
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
        timeout: timeoutMs,
        maxBuffer,
        encoding: "utf-8",
      });

      return { stdout, stderr, exitCode: 0 };
    } catch (err: unknown) {
      // Node throws on non-zero exit or timeout; extract structured data.
      const nodeErr = err as {
        code?: string | number;
        stdout?: string;
        stderr?: string;
        killed?: boolean;
      };

      if (nodeErr.code === "ETIMEDOUT" || nodeErr.killed) {
        throw new Error(
          `Command timed out after ${timeoutMs}ms: ${command} ${(args ?? []).join(" ")}`.trim(),
        );
      }

      return {
        stdout: nodeErr.stdout ?? "",
        stderr: nodeErr.stderr ?? "",
        exitCode: typeof nodeErr.code === "number" ? nodeErr.code : 1,
      };
    }
  }

  async readFile(path: string): Promise<string> {
    return fsReadFile(path, "utf-8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    await fsWriteFile(path, content, "utf-8");
  }

  /**
   * Create an isolated sandbox backed by a temporary directory.
   *
   * The returned handle lets callers run commands, read/write files inside
   * the temp directory, and destroy it when finished.
   */
  async createSandbox(_options?: SandboxOptions): Promise<SandboxHandle> {
    const root = await mkdtemp(join(tmpdir(), "proteus-sandbox-"));

    return {
      async execute(command: string, args?: string[]): Promise<SandboxResult> {
        try {
          const { stdout, stderr } = await execFileAsync(command, args ?? [], {
            cwd: root,
            timeout: DEFAULT_TIMEOUT_MS,
            maxBuffer: DEFAULT_MAX_BUFFER,
            encoding: "utf-8",
          });
          return { exitCode: 0, stdout, stderr };
        } catch (err: unknown) {
          const nodeErr = err as {
            code?: string | number;
            stdout?: string;
            stderr?: string;
            message?: string;
          };
          return {
            exitCode: typeof nodeErr.code === "number" ? nodeErr.code : 1,
            stdout: nodeErr.stdout ?? "",
            stderr: nodeErr.stderr ?? (nodeErr.message ?? String(err)),
          };
        }
      },

      async readFile(path: string): Promise<string> {
        const abs = isAbsolute(path) ? path : resolve(root, path);
        return fsReadFile(abs, "utf-8");
      },

      async writeFile(path: string, content: string): Promise<void> {
        const abs = isAbsolute(path) ? path : resolve(root, path);
        await mkdir(dirname(abs), { recursive: true });
        await fsWriteFile(abs, content, "utf-8");
      },

      async destroy(): Promise<void> {
        await rm(root, { recursive: true, force: true });
      },
    };
  }
}
