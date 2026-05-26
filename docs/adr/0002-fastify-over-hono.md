# ADR-0002: Fastify v5 over Hono for Server

## Status

Accepted

## Context

Proteus Server needs an HTTP framework to expose Core as a network service (HTTP + WebSocket API, session management, Studio API). The framework choice affects Server architecture, plugin model alignment, and operational characteristics.

Two candidates were evaluated:

**Hono** — edge-first, multi-runtime (Node/Bun/Deno/CF Workers), lightweight, Web Standards API (Request/Response). Popular for serverless/edge deployments.

**Fastify v5** — Node.js-only, plugin architecture (avvio), schema-based validation, first-class WebSocket support via `@fastify/websocket`, mature ecosystem.

## Decision

Choose Fastify v5. Do not use Hono.

## Rationale

### 1. Node.js-only is a feature, not a limitation

Proteus Server is a long-lived Node.js process managing Agent Loop sessions, WebSocket connections, and SQLite persistence. We have zero requirement for edge/serverless deployment. Multi-runtime abstraction adds conceptual overhead with no payoff — Server will never run on Cloudflare Workers.

### 2. WebSocket integration

`@fastify/websocket` provides lifecycle-integrated WebSocket handling. WebSocket connections participate in Fastify's request lifecycle and plugin encapsulation. Hono's WebSocket story is designed for edge runtimes and requires adapter-specific code. Proteus Studio streams Agent events over WebSocket — this is a primary transport, not a side feature.

### 3. Avvio lifecycle aligns with Session isolation

Fastify's avvio plugin system provides deterministic startup/shutdown lifecycle with dependency declaration. This maps naturally to Proteus Session management:

- Session-scoped plugins register per-connection
- Graceful shutdown drains active Sessions before closing
- Plugin encapsulation matches Session isolation boundaries

Hono's middleware model is request-scoped and stateless — it has no equivalent of avvio's lifecycle management.

### 4. Ecosystem maturity for Server concerns

Fastify has mature plugins for CORS, rate limiting, JWT, static serving, formdata — all things a Server needs. Hono's ecosystem is younger and edge-oriented.

### 5. Schema validation aligns with Zod strategy

Fastify's built-in schema validation (JSON Schema for request/response) composes with our Zod → JSON Schema pipeline. Hono validates via Zod middleware, which works, but Fastify's integration is at the framework level (serialization, response validation, Swagger generation).

## Consequences

**Positive:**
- WebSocket + HTTP in one lifecycle-managed server
- Avvio lifecycle maps to Session lifecycle naturally
- Mature plugin ecosystem for production Server concerns
- No multi-runtime abstraction tax

**Negative:**
- Server is locked to Node.js runtime (acceptable — SDK is the embeddable surface, Server is deployment infrastructure)
- Fastify's type system is less ergonomic than Hono's Web Standards types (mitigated by keeping Server thin — business logic lives in Core)
- If we ever need edge deployment, we'd need a separate adapter (unlikely — Server manages stateful sessions)
