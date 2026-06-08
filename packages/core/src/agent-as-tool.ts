/**
 * Agent-as-Tool — wraps an Agent as a Tool so other agents can call it
 * like any other tool in the registry.
 *
 * The tool's execute function delegates to the target agent via an
 * injected AgentRouter, which decouples this module from any specific
 * invocation strategy (Harness, SubHarness, remote HTTP, etc.).
 */

import type {
  Tool,
  ToolDefinition,
  ToolResult,
  ToolContext,
  AgentToolConfig,
  AgentRouter,
} from "./types.js";
import type { AgentRegistry } from "./agent-registry.js";

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Create a Tool that delegates execution to a registered agent.
 *
 * @param config   - Which agent to wrap and optional overrides.
 * @param registry - Used to resolve the agent's description when none is
 *                   provided in the config.
 * @param router   - The function that actually dispatches a task to the
 *                   target agent. Injected to keep this module decoupled
 *                   from any specific execution strategy.
 */
export function createAgentTool(
  config: AgentToolConfig,
  registry: AgentRegistry,
  router: AgentRouter,
): Tool {
  const timeout = config.timeout ?? DEFAULT_TIMEOUT_MS;

  // Resolve description: explicit config > agent's own description > generic fallback
  const agentDef = registry.get(config.agentId);
  const description =
    config.description ??
    agentDef?.description ??
    `Delegate a task to agent "${config.agentId}"`;

  const definition: ToolDefinition = {
    name: `agent_${config.agentId}`,
    description,
    parameters: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "The task or instruction to delegate to the agent.",
        },
        context: {
          type: "string",
          description:
            "Optional additional context or background information for the agent.",
        },
      },
      required: ["task"],
    },
    builtin: false,
  };

  return {
    definition,
    async execute(
      params: Record<string, unknown>,
      _context: ToolContext,
    ): Promise<ToolResult> {
      const task = params.task;
      if (typeof task !== "string" || task.trim().length === 0) {
        return {
          output: null,
          error: {
            message: 'Parameter "task" must be a non-empty string.',
            retryable: false,
          },
        };
      }

      const contextParam =
        typeof params.context === "string" ? params.context : undefined;

      // Enforce timeout via AbortController + Promise.race
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      try {
        // Race the router call against the timeout.
        // We pass the AbortSignal so cooperative routers can honour it.
        const result = await Promise.race([
          router(config.agentId, task, contextParam),
          timeoutSignal(controller.signal),
        ]);

        clearTimeout(timeoutId);

        if (result.status === "timed_out") {
          return {
            output: null,
            error: {
              message: `Agent "${config.agentId}" timed out after ${timeout}ms.`,
              retryable: true,
            },
          };
        }

        if (result.status === "errored") {
          return {
            output: null,
            error: {
              message:
                result.error ?? `Agent "${config.agentId}" returned an error.`,
              retryable: false,
            },
          };
        }

        return { output: result.output };
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        // AbortError means the timeout fired
        if (isAbortError(err)) {
          return {
            output: null,
            error: {
              message: `Agent "${config.agentId}" timed out after ${timeout}ms.`,
              retryable: true,
            },
          };
        }

        const message =
          err instanceof Error ? err.message : String(err);
        return {
          output: null,
          error: {
            message: `Agent "${config.agentId}" invocation failed: ${message}`,
            retryable: false,
          },
        };
      }
    },
  };
}

// --- Internal helpers ---

/**
 * Returns a promise that rejects with an AbortError when the signal fires.
 * Used with Promise.race to implement timeout.
 */
function timeoutSignal(signal: AbortSignal): Promise<never> {
  return new Promise<never>((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    signal.addEventListener(
      "abort",
      () => {
        reject(new DOMException("The operation was aborted.", "AbortError"));
      },
      { once: true },
    );
  });
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException && err.name === "AbortError"
  );
}
