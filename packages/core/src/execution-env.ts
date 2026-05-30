// @proteus/core — ExecutionEnvironment interface
//
// Defines the abstraction for executing shell commands, reading/writing
// files, and creating sandboxes. LocalExecutionEnvironment provides the
// default implementation backed by child_process and fs.

import type { SandboxHandle, SandboxOptions } from "./types.js";

// --- ExecOptions ---

export interface ExecOptions {
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Environment variables to merge with process.env. */
  env?: Record<string, string>;
  /** Maximum execution time in milliseconds. Defaults to 30 000 ms. */
  timeoutMs?: number;
  /** Maximum stdout/stderr buffer size in bytes. Defaults to 1 MB. */
  maxBuffer?: number;
}

// --- ExecResult ---

export interface ExecResult {
  /** Captured stdout string (may be truncated if maxBuffer hit). */
  stdout: string;
  /** Captured stderr string. */
  stderr: string;
  /** Process exit code. Null if the process was killed by a signal. */
  exitCode: number | null;
}

// --- ExecutionEnvironment ---

export interface ExecutionEnvironment {
  /** Run a shell command and return its output. */
  execute(command: string, args?: string[], options?: ExecOptions): Promise<ExecResult>;

  /** Read a file from the local filesystem (UTF-8). */
  readFile(path: string): Promise<string>;

  /** Write content to a file on the local filesystem (UTF-8). */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Create an isolated sandbox environment.
   * V1: returns a SandboxHandle backed by a temp directory.
   */
  createSandbox(options?: SandboxOptions): Promise<SandboxHandle>;
}

export type { SandboxOptions, SandboxHandle };
