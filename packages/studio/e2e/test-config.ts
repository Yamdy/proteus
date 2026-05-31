/**
 * E2E test configuration for Studio tests against the real Proteus Server.
 */

/** Base URL for the Proteus Server API (proxied through Vite dev server). */
export const API_BASE_URL = "http://localhost:3000";

/** WebSocket URL for real-time event push. */
export const WS_URL = "ws://localhost:3000/ws";

/** Default session config used when creating test sessions. */
export const DEFAULT_SESSION_CONFIG = {
  llm: {
    provider: "test",
    model: "test-model",
    temperature: 0.7,
  },
  tools: {} as Record<string, boolean>,
  logLevel: "info" as const,
};

/** Prefix for test session IDs to make cleanup easy. */
export const TEST_SESSION_PREFIX = "e2e-test-";
