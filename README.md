# Proteus

An event-driven agent loop framework. Proteus provides a modular execution model for LLM-powered agents with a 5-phase turn structure, handler-based event interception, checkpoint/resume capability, and real-time visualization.

## Architecture

```
packages/
  core/       @proteus/core     — Agent loop, HandlerEngine, Harness, CheckpointStore
  sdk/        @proteus/sdk      — Embeddable language API (depends on core)
  server/     @proteus/server   — HTTP/WebSocket service (Fastify v5)
  studio/     @proteus/studio   — Browser UI (Vue 3 + Vite)
```

**Core concepts:**

- **Harness** — orchestrates single-turn and multi-turn (chain) execution
- **HandlerEngine** — event bus with interceptors and observers, short-circuit semantics
- **5-phase turn** — `context_assembly` → `llm_inference` → `action_resolution` → `tool_execution` → `result_observation`
- **Three-region context** — AgentContext (process) → SessionContext (connection) → TurnContext (turn)
- **CheckpointStore** — persist/resume via FrozenContext snapshots (in-memory or SQLite)
- **LifecycleStateMachine** — `pending → running → paused → completed/errored/cancelled`

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start dev server with Harness visualizer
pnpm --filter @proteus/core dev
# → http://127.0.0.1:3210
```

## Development

```bash
# Watch mode (tsc --watch) for core
pnpm --filter @proteus/core dev:watch

# Run tests for a specific package
pnpm --filter @proteus/core test

# Run a single test file
npx vitest run packages/core/src/harness.test.ts
```

## Docs

Architecture decisions are documented in [`docs/adr/`](docs/adr/).
