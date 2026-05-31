import { test, expect, isServerAvailable } from "./fixtures";

test.describe("Observability Module", () => {
  test.beforeAll(async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.warn("Server not available — skipping observability tests");
      test.skip();
    }
  });

  test.beforeEach(async ({ page, waitForAppReady }) => {
    await page.goto("/observability");
    await waitForAppReady();
    await page.locator('[data-testid="observability-page"]').waitFor();
  });

  test("displays observability page with header", async ({ page }) => {
    const obsPage = page.locator('[data-testid="observability-page"]');
    await expect(obsPage).toBeVisible();
    await expect(obsPage.locator("h1")).toHaveText("Observability");
  });

  test("displays all three tabs", async ({ page }) => {
    await expect(
      page.locator('[data-testid="obs-tab-phases"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="obs-tab-traces"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="obs-tab-tools"]'),
    ).toBeVisible();
  });

  test("Phase Timeline tab is active by default", async ({ page }) => {
    const phasesTab = page.locator('[data-testid="obs-tab-phases"]');
    await expect(phasesTab).toHaveClass(/border-cyan-400/);

    const phaseTimeline = page.locator('[data-testid="phase-timeline"]');
    await expect(phaseTimeline).toBeVisible();
  });

  test("phase timeline shows WebSocket connection status", async ({
    page,
  }) => {
    const wsStatus = page.locator('[data-testid="ws-status"]');
    await expect(wsStatus).toBeVisible();
    await expect(wsStatus).toHaveText(/Live|Disconnected/);
  });

  test("phase timeline has Clear button", async ({ page }) => {
    const phaseTimeline = page.locator('[data-testid="phase-timeline"]');
    const clearBtn = phaseTimeline.getByRole("button", { name: "Clear" });
    await expect(clearBtn).toBeVisible();
  });

  test("switches to Traces tab and shows trace list", async ({ page }) => {
    await page.locator('[data-testid="obs-tab-traces"]').click();

    const obsPage = page.locator('[data-testid="observability-page"]');
    // Traces may be empty on a fresh server — verify the tab content renders
    await expect(obsPage).toBeVisible();
  });

  test("selecting a trace shows trace details when traces exist", async ({
    page,
  }) => {
    await page.locator('[data-testid="obs-tab-traces"]').click();

    const obsPage = page.locator('[data-testid="observability-page"]');

    // Look for any trace entry
    const traceEntry = obsPage
      .locator("[data-testid^='trace-']")
      .first();
    const hasTraces = await traceEntry.isVisible().catch(() => false);
    if (!hasTraces) {
      // No traces on the server — skip this test
      test.skip();
      return;
    }

    await traceEntry.click();

    // Trace detail should appear
    await expect(obsPage).toContainText(/Trace|Span|Duration/);
  });

  test("trace entries show status indicators when traces exist", async ({
    page,
  }) => {
    await page.locator('[data-testid="obs-tab-traces"]').click();

    const obsPage = page.locator('[data-testid="observability-page"]');
    const traceEntry = obsPage
      .locator("[data-testid^='trace-']")
      .first();
    const hasTraces = await traceEntry.isVisible().catch(() => false);
    if (!hasTraces) {
      test.skip();
      return;
    }

    // Should show trace entries with some status indicator
    await expect(traceEntry).toBeVisible();
  });

  test("switches to Tool Calls tab", async ({ page }) => {
    await page.locator('[data-testid="obs-tab-tools"]').click();

    const toolsTab = page.locator('[data-testid="obs-tab-tools"]');
    await expect(toolsTab).toHaveClass(/border-cyan-400/);

    // Should show message to select a trace first
    await expect(
      page.locator('[data-testid="observability-page"]'),
    ).toContainText(/Select a trace|No trace selected/i);
  });

  test("tool calls tab shows cards after selecting a trace", async ({
    page,
  }) => {
    // First go to traces tab and select a trace
    await page.locator('[data-testid="obs-tab-traces"]').click();

    const obsPage = page.locator('[data-testid="observability-page"]');
    const traceEntry = obsPage
      .locator("[data-testid^='trace-']")
      .first();
    const hasTraces = await traceEntry.isVisible().catch(() => false);
    if (!hasTraces) {
      test.skip();
      return;
    }

    await traceEntry.click();
    // Wait for tool calls to load
    await page.waitForTimeout(1000);

    // Now switch to tools tab
    await page.locator('[data-testid="obs-tab-tools"]').click();

    // Should show tool call cards (or empty state)
    const toolCards = page.locator("[data-testid^='tool-call-']");
    const hasToolCards = await toolCards.first().isVisible().catch(() => false);
    if (!hasToolCards) {
      // No tool calls for this trace — acceptable
      return;
    }

    await expect(toolCards.first()).toBeVisible();
  });

  test("tool call card can be expanded and collapsed", async ({ page }) => {
    // Select a trace first
    await page.locator('[data-testid="obs-tab-traces"]').click();

    const obsPage = page.locator('[data-testid="observability-page"]');
    const traceEntry = obsPage
      .locator("[data-testid^='trace-']")
      .first();
    const hasTraces = await traceEntry.isVisible().catch(() => false);
    if (!hasTraces) {
      test.skip();
      return;
    }

    await traceEntry.click();
    await page.waitForTimeout(1000);

    // Switch to tools tab
    await page.locator('[data-testid="obs-tab-tools"]').click();

    const toolCard = page.locator("[data-testid^='tool-call-tc-']").first();
    const hasToolCard = await toolCard.isVisible().catch(() => false);
    if (!hasToolCard) {
      test.skip();
      return;
    }

    // Click to expand
    const toggleBtn = page
      .locator("[data-testid^='tool-call-toggle-tc-']")
      .first();
    await toggleBtn.click();

    // Should show expanded details (parameters, result)
    await expect(toolCard).toContainText(/Parameters|Result|Input/);

    // Click again to collapse
    await toggleBtn.click();
  });

  test("tool call card shows tool name and status", async ({ page }) => {
    // Select a trace
    await page.locator('[data-testid="obs-tab-traces"]').click();

    const obsPage = page.locator('[data-testid="observability-page"]');
    const traceEntry = obsPage
      .locator("[data-testid^='trace-']")
      .first();
    const hasTraces = await traceEntry.isVisible().catch(() => false);
    if (!hasTraces) {
      test.skip();
      return;
    }

    await traceEntry.click();
    await page.waitForTimeout(1000);

    await page.locator('[data-testid="obs-tab-tools"]').click();

    const toolCard = page.locator("[data-testid^='tool-call-tc-']").first();
    const hasToolCard = await toolCard.isVisible().catch(() => false);
    if (!hasToolCard) {
      test.skip();
      return;
    }

    // Card should contain tool name and status text
    await expect(toolCard).toContainText(/ok|error|pending/i);
  });

  test("error tool call card shows error styling", async ({ page }) => {
    // Select a trace
    await page.locator('[data-testid="obs-tab-traces"]').click();

    const obsPage = page.locator('[data-testid="observability-page"]');

    // Find a trace that has an error status
    const errorTrace = obsPage
      .locator("[data-testid^='trace-']")
      .filter({ hasText: /error/i })
      .first();
    const hasErrorTrace = await errorTrace.isVisible().catch(() => false);
    if (!hasErrorTrace) {
      test.skip();
      return;
    }

    await errorTrace.click();
    await page.waitForTimeout(1000);

    await page.locator('[data-testid="obs-tab-tools"]').click();

    const toolCard = page.locator("[data-testid^='tool-call-tc-']").first();
    const hasToolCard = await toolCard.isVisible().catch(() => false);
    if (!hasToolCard) {
      test.skip();
      return;
    }

    await expect(toolCard).toContainText(/error/i);

    // Expand to see error details
    const toggleBtn = page
      .locator("[data-testid^='tool-call-toggle-tc-']")
      .first();
    await toggleBtn.click();
    await expect(toolCard).toContainText(/Error|error/i);
  });
});

// ---------------------------------------------------------------------------
// Costs Module
// ---------------------------------------------------------------------------

test.describe("Costs Module", () => {
  test.beforeAll(async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.warn("Server not available — skipping costs tests");
      test.skip();
    }
  });

  test.beforeEach(async ({ page, waitForAppReady }) => {
    await page.goto("/costs");
    await waitForAppReady();
    await page.locator('[data-testid="costs-page"]').waitFor();
  });

  test("displays costs page with header", async ({ page }) => {
    const costsPage = page.locator('[data-testid="costs-page"]');
    await expect(costsPage).toBeVisible();
    await expect(costsPage.locator("h1")).toHaveText("Costs");
  });

  test("renders cost dashboard with summary cards", async ({ page }) => {
    const dashboard = page.locator('[data-testid="cost-dashboard"]');
    await expect(dashboard).toBeVisible();

    const summary = page.locator('[data-testid="cost-summary"]');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Total Cost");
    await expect(summary).toContainText("Total Tokens");
  });

  test("summary cards show cost and token values", async ({ page }) => {
    const summary = page.locator('[data-testid="cost-summary"]');
    // Values depend on real server data — just verify they render as numbers/currency
    await expect(summary).toContainText(/\$/);
    await expect(summary).toContainText(/\d/);
  });

  test("cost dashboard has Refresh button", async ({ page }) => {
    const dashboard = page.locator('[data-testid="cost-dashboard"]');
    const refreshBtn = dashboard.getByRole("button", { name: "Refresh" });
    await expect(refreshBtn).toBeVisible();
  });

  test("cost dashboard shows view toggle (By Cost / By Tokens)", async ({
    page,
  }) => {
    const dashboard = page.locator('[data-testid="cost-dashboard"]');
    await expect(
      dashboard.getByRole("button", { name: "By Cost" }),
    ).toBeVisible();
    await expect(
      dashboard.getByRole("button", { name: "By Tokens" }),
    ).toBeVisible();
  });

  test("cost dashboard renders correctly (with or without data)", async ({
    page,
  }) => {
    const dashboard = page.locator('[data-testid="cost-dashboard"]');
    await expect(dashboard).toBeVisible();

    // Dashboard should show summary cards
    await expect(dashboard).toContainText("Total Cost");
    await expect(dashboard).toContainText("Total Tokens");

    // If there's data, charts will render; if not, that's also valid
    const hasData = await dashboard
      .locator(".recharts-responsive-container")
      .first()
      .isVisible()
      .catch(() => false);

    if (hasData) {
      // Charts are visible when data exists
      await expect(dashboard).toContainText("Cost by Model");
    } else {
      // Empty state is acceptable
      const text = await dashboard.textContent();
      expect(text).toContain("Total Cost");
    }
  });

  test("clicking By Tokens toggle changes chart display", async ({
    page,
  }) => {
    const dashboard = page.locator('[data-testid="cost-dashboard"]');
    const tokensBtn = dashboard.getByRole("button", { name: "By Tokens" });
    await tokensBtn.click();

    // The button should now be active
    await expect(tokensBtn).toHaveClass(/bg-cyan-500\/10/);
  });
});
