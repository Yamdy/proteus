import { ChatServer } from "./chat-server.js";
import { HandlerEngine } from "./handler-engine.js";
import { VercelLLMProvider } from "./vercel-llm-provider.js";
import { InMemoryCheckpointStore } from "./checkpoint-store.js";
import { registerBuiltInProcessors } from "./processors.js";
import type { LLMProvider } from "./index.js";

function resolveLLM(): LLMProvider {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.LLM_MODEL ?? "gpt-4o";
  const provider = process.env.LLM_PROVIDER ?? "openai";

  if (apiKey) {
    return new VercelLLMProvider({ provider, model, apiKey });
  }

  console.warn("  No OPENAI_API_KEY set — using stub LLM (returns fixed responses)");
  return {
    chat: async () => ({
      content: "This is a simulated response. Set OPENAI_API_KEY for real LLM calls.",
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop" as const,
    }),
    chatStream: async function* () {},
    countTokens: (text: string) => Math.ceil(text.length / 4),
  };
}

async function main() {
  const port = Number(process.env.PORT) || 3210;

  const engine = new HandlerEngine();
  registerBuiltInProcessors(engine);

  const store = new InMemoryCheckpointStore();
  const llm = resolveLLM();

  const server = new ChatServer({ port, llm, store, engine });
  const addr = await server.start();
  const actualPort = typeof addr === "string" ? addr : addr.port;

  console.log(`\n  Proteus Dev Server running at http://127.0.0.1:${actualPort}`);
  console.log(`  Endpoints:`);
  console.log(`    POST   /chat       — send a message`);
  console.log(`    GET    /sessions   — list sessions`);
  console.log(`    POST   /sessions   — create session`);
  console.log(`    DELETE /sessions/:id — destroy session`);
  console.log(`    GET    /events     — SSE stream\n`);
}

main().catch(console.error);
