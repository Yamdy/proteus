import { DevServer } from "./dev-server.js";
import type { SSEEvent } from "./dev-server.js";
import { Harness } from "./harness.js";
import { HandlerEngine } from "./handler-engine.js";
import { AgentContext, SessionContext } from "./context.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import type { LLMProvider } from "./index.js";

function stubLLM(): LLMProvider {
  return {
    chat: async () => ({
      content: "This is a simulated LLM response.",
      usage: { promptTokens: 42, completionTokens: 18 },
      finishReason: "stop" as const,
    }),
    chatStream: async function* () {},
    countTokens: (text: string) => text.length,
  };
}

async function main() {
  const port = Number(process.env.PORT) || 3210;

  // Set up HandlerEngine with demo handlers
  const engine = new HandlerEngine();

  engine.observe("phase:before", async (ctx: any) => {
    console.log(`  [phase:before] ${ctx.phaseName}`);
    return { ok: true as const };
  });

  engine.observe("phase:after", async (ctx: any) => {
    console.log(`  [phase:after]  ${ctx.phaseName}`);
    return { ok: true as const };
  });

  engine.observe("turn:start", async (ctx: any) => {
    console.log(`[turn:start] ${ctx.turnId}`);
    return { ok: true as const };
  });

  engine.observe("turn:end", async (ctx: any) => {
    console.log(`[turn:end]   ${ctx.turnId} → ${ctx.status}`);
    return { ok: true as const };
  });

  engine.observe("chain:start", async (ctx: any) => {
    console.log(`[chain:start] ${ctx.chainId}`);
    return { ok: true as const };
  });

  engine.observe("chain:end", async (ctx: any) => {
    console.log(`[chain:end]   ${ctx.chainId} → ${ctx.status}`);
    return { ok: true as const };
  });

  // Set up DevServer
  const devServer = new DevServer({ port });
  const addr = await devServer.start();
  const actualPort = typeof addr === "string" ? addr : addr.port;
  console.log(`\n  Proteus Dev Server running at http://127.0.0.1:${actualPort}`);
  console.log(`  Open the URL above in your browser to see the Harness Visualizer.\n`);

  // Bridge: HandlerEngine events → SSE
  const bridge = (eventType: string) => (ctx: any) => {
    devServer.broadcast({
      type: eventType as SSEEvent["type"],
      timestamp: Date.now(),
      sessionId: ctx.sessionId || "demo",
      chainId: ctx.chainId || "demo-chain",
      turnId: ctx.turnId,
      payload: ctx,
    });
    return { ok: true as const };
  };

  engine.observe("turn:start", bridge("turn:start"));
  engine.observe("turn:end", bridge("turn:end"));
  engine.observe("phase:before", bridge("phase:before"));
  engine.observe("phase:after", bridge("phase:after"));
  engine.observe("chain:start", bridge("chain:start"));
  engine.observe("chain:end", bridge("chain:end"));

  // Set up Harness
  const store = new InMemoryCheckpointStore();
  const harness = new Harness({ store });

  const agent = new AgentContext({
    llm: stubLLM(),
    tools: new Map(),
    handlerEngine: { getHandlers: (e) => engine.getHandlers(e), emit: (e, p) => engine.emit(e, p) },
  });

  const session = new SessionContext({
    sessionId: "demo-session",
    llm: { provider: "stub", model: "demo", temperature: 0 },
    tools: {},
    logLevel: "info",
  });

  // Run a demo chain every 8 seconds
  let turnCount = 0;
  async function runDemo() {
    turnCount++;
    console.log(`\n--- Demo Chain #${turnCount} ---`);
    const result = await harness.runChain(session, agent, { maxTurns: 2 });
    console.log(`--- Chain result: ${result.status} (${result.turns} turns) ---\n`);
  }

  // Run first demo immediately, then every 8 seconds
  await runDemo();
  setInterval(runDemo, 8000);
}

main().catch(console.error);
