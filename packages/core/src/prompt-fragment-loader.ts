import type { HandlerContext } from "./context.js";
import type { HandlerResult } from "./handler-engine.js";
import type { HandlerDefinition } from "./types.js";
import type { PromptFragmentRegistry } from "./prompt-fragment-registry.js";

// --- PromptFragmentLoader ---

export class PromptFragmentLoader {
  readonly name = "prompt-fragment-loader";
  private readonly registry: PromptFragmentRegistry;

  constructor(registry: PromptFragmentRegistry) {
    this.registry = registry;
  }

  async handle(ctx: HandlerContext): Promise<HandlerResult> {
    const fragments = this.registry.getAll();

    // Filter by sessionIds (if set, check current session is included)
    const sessionId = ctx.session.sessionId;
    const sessionFiltered = fragments.filter(
      (f) => !f.sessionIds || f.sessionIds.length === 0 || f.sessionIds.includes(sessionId),
    );

    // Filter by condition (if set, evaluate with current context)
    const conditionFiltered = sessionFiltered.filter(
      (f) => !f.condition || f.condition(ctx),
    );

    // Deduplicate by name (last wins) - already sorted by priority from getAll()
    const deduped = new Map<string, (typeof conditionFiltered)[0]>();
    for (const f of conditionFiltered) {
      deduped.set(f.name, f);
    }

    // Add matching fragments to ctx.turn.promptFragments
    for (const f of deduped.values()) {
      ctx.turn.addPromptFragment({
        role: f.role,
        content: f.content,
        name: f.name,
        metadata: { priority: f.priority, tags: f.tags },
      });
    }

    return { ok: true };
  }
}

// --- createPromptFragmentLoaderHandler ---

export function createPromptFragmentLoaderHandler(
  registry: PromptFragmentRegistry,
): HandlerDefinition {
  const loader = new PromptFragmentLoader(registry);
  return {
    name: loader.name,
    phases: ["context_assembly"],
    events: ["phase:before"],
    priority: 5,
    trust: 3,
    builtin: true,
    handle: (ctx) => loader.handle(ctx),
  };
}
