import { test as base, expect } from "@playwright/test";
import {
  API_BASE_URL,
  DEFAULT_SESSION_CONFIG,
  TEST_SESSION_PREFIX,
} from "./test-config";

// ---------------------------------------------------------------------------
// Standalone helpers (can be called outside test fixtures, e.g. in beforeAll)
// ---------------------------------------------------------------------------

/** Check if the real Proteus Server is reachable. */
export async function isServerAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Check whether an LLM API key is configured in the environment. */
export function isLLMConfigured(): boolean {
  return !!(
    process.env.PROTEUS_LLM_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_API_KEY
  );
}

/** Create a session via the real server API. */
export async function createSessionDirectly(name: string): Promise<string> {
  const sessionId = `${TEST_SESSION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const resp = await fetch(`${API_BASE_URL}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      config: { sessionId, ...DEFAULT_SESSION_CONFIG },
      name,
    }),
  });
  if (!resp.ok) throw new Error(`Failed to create session: ${resp.status}`);
  return sessionId;
}

/** Delete a session via the real server API. */
export async function deleteSessionDirectly(id: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/sessions/${id}`, { method: "DELETE" });
}

/** Check whether the real server exposes a given API path. */
export async function isApiAvailable(path: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Extended Playwright fixtures
// ---------------------------------------------------------------------------

/** Helper methods added to every page via the extended fixture. */
export interface StudioFixtures {
  /** Wait for the real Proteus Server to be ready. */
  waitForServer: () => Promise<void>;

  /** Create a test session via the real API and return its ID. */
  createTestSession: (name?: string) => Promise<string>;

  /** Delete all test sessions (those with the e2e-test- prefix). */
  cleanupSessions: () => Promise<void>;

  /** Wait for the app to finish its initial data loading. */
  waitForAppReady: () => Promise<void>;

  /** Navigate to a page path and wait for network idle. */
  gotoPage: (path: string) => Promise<void>;
}

export const test = base.extend<StudioFixtures>({
  waitForServer: async ({}, use) => {
    const waitForServer = async () => {
      const maxRetries = 30;
      for (let i = 0; i < maxRetries; i++) {
        try {
          const resp = await fetch(`${API_BASE_URL}/health`);
          if (resp.ok) return;
        } catch {
          // server not ready yet
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw new Error("Proteus Server did not become ready in time");
    };
    await use(waitForServer);
  },

  createTestSession: async ({}, use) => {
    let createdIds: string[] = [];

    const createTestSession = async (name?: string) => {
      const sessionId = `${TEST_SESSION_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const resp = await fetch(`${API_BASE_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          config: {
            sessionId,
            ...DEFAULT_SESSION_CONFIG,
          },
        }),
      });
      if (!resp.ok) {
        throw new Error(`Failed to create test session: ${resp.status} ${await resp.text()}`);
      }
      createdIds.push(sessionId);
      return sessionId;
    };

    await use(createTestSession);

    // Cleanup: delete all sessions created during the test
    for (const id of createdIds) {
      try {
        await fetch(`${API_BASE_URL}/api/sessions/${id}`, { method: "DELETE" });
      } catch {
        // best-effort cleanup
      }
    }
  },

  cleanupSessions: async ({}, use) => {
    const cleanupSessions = async () => {
      const resp = await fetch(`${API_BASE_URL}/api/sessions`);
      if (!resp.ok) return;
      const sessions = (await resp.json()) as Array<{ id: string }>;
      for (const session of sessions) {
        if (session.id.startsWith(TEST_SESSION_PREFIX)) {
          try {
            await fetch(`${API_BASE_URL}/api/sessions/${session.id}`, { method: "DELETE" });
          } catch {
            // best-effort
          }
        }
      }
    };
    await use(cleanupSessions);
  },

  waitForAppReady: async ({ page }, use) => {
    const waitForAppReady = async () => {
      await page.waitForLoadState("domcontentloaded");
      await page.locator("#root > *").first().waitFor({ state: "attached", timeout: 15_000 });
    };
    await use(waitForAppReady);
  },

  gotoPage: async ({ page }, use) => {
    const gotoPage = async (path: string) => {
      await page.goto(path);
      await page.waitForLoadState("domcontentloaded");
    };
    await use(gotoPage);
  },
});

export { expect } from "@playwright/test";
