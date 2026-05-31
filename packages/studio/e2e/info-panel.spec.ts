import { test, expect, isServerAvailable } from "./fixtures";

test.describe("InfoPanel (Chat Page)", () => {
  test.beforeAll(async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.warn("Server not available — skipping InfoPanel tests");
      test.skip();
    }
  });

  test.beforeEach(async ({ page, waitForAppReady }) => {
    await page.goto("/chat");
    await waitForAppReady();
    await page.locator('[data-testid="session-sidebar"]').waitFor();
  });

  test("InfoPanel is visible on chat page", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="info-panel"]');
    await expect(infoPanel).toBeVisible();
  });

  test("InfoPanel shows Phase Timeline section", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="info-panel"]');
    await expect(infoPanel).toContainText("Phase Timeline");
  });

  test("InfoPanel shows Configuration section", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="info-panel"]');
    await expect(infoPanel).toContainText("Configuration");
  });

  test("InfoPanel shows Costs section", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="info-panel"]');
    await expect(infoPanel).toContainText("Costs");
  });

  test("InfoPanel shows Self-Modify section", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="info-panel"]');
    await expect(infoPanel).toContainText("Self-Modify");
  });

  test("Phase Timeline section is expanded by default", async ({ page }) => {
    const phaseContent = page.locator(
      '[data-testid="phase-timeline"], [data-testid="ws-status"]',
    );
    const hasContent = await phaseContent
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBe(true);
  });

  test("Configuration section shows LLM settings", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="info-panel"]');
    await expect(infoPanel).toContainText("LLM");
    await expect(infoPanel).toContainText("Provider");
    await expect(infoPanel).toContainText("Model");
  });

  test("collapsible sections can be toggled", async ({ page }) => {
    const infoPanel = page.locator('[data-testid="info-panel"]');
    const costsHeader = infoPanel.locator("button", { hasText: "Costs" });
    await expect(costsHeader).toBeVisible();
    await costsHeader.click();
    await expect(infoPanel).toContainText("Total Cost");
  });

  test("InfoPanel can be toggled from chat area", async ({
    page,
    createTestSession,
    waitForAppReady,
  }) => {
    // Create a session first (before navigating)
    const sessionId = await createTestSession("Toggle Test");

    // Navigate to chat and wait for sidebar to load
    await page.goto("/chat");
    await waitForAppReady();
    await page.locator('[data-testid="session-sidebar"]').waitFor();

    // Find and click the session (wait for it to appear)
    const sessionItem = page.locator(`[data-testid="session-item-${sessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();

    // Wait for chat area to appear
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();

    const toggleBtn = page.locator('[data-testid="toggle-info-btn"]');
    await expect(toggleBtn).toBeVisible();
    const infoPanel = page.locator('[data-testid="info-panel"]');
    await expect(infoPanel).toBeVisible();
    await toggleBtn.click();
    await expect(infoPanel).not.toBeVisible();
    await toggleBtn.click();
    await expect(infoPanel).toBeVisible();
  });

  test("WebSocket connection indicator shows status", async ({ page }) => {
    const wsStatus = page.locator('[data-testid="ws-status"]');
    await expect(wsStatus).toBeVisible({ timeout: 10000 });
    await expect(wsStatus).toContainText(/Live|Disconnected/);
  });
});

test.describe("System Prompt Configuration", () => {
  test.beforeAll(async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.warn("Server not available — skipping config tests");
      test.skip();
    }
  });

  test.beforeEach(async ({ page, waitForAppReady }) => {
    await page.goto("/config");
    await waitForAppReady();
    await page.locator('[data-testid="config-page"]').waitFor();
  });

  test("system prompt textarea is visible", async ({ page }) => {
    const systemPrompt = page.locator('[data-testid="system-prompt-input"]');
    await expect(systemPrompt).toBeVisible();
  });

  test("system prompt has default value", async ({ page }) => {
    const systemPrompt = page.locator('[data-testid="system-prompt-input"]');
    // Wait for config to load and populate the textarea
    await expect(systemPrompt).not.toHaveValue("", { timeout: 10000 });
    const value = await systemPrompt.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test("system prompt can be edited", async ({ page }) => {
    const systemPrompt = page.locator('[data-testid="system-prompt-input"]');
    await systemPrompt.clear();
    await systemPrompt.fill("You are a specialized coding assistant.");
    const newValue = await systemPrompt.inputValue();
    expect(newValue).toBe("You are a specialized coding assistant.");
  });
});

test.describe("Session History Messages", () => {
  test.beforeAll(async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.warn("Server not available — skipping history tests");
      test.skip();
    }
  });

  test("clicking a session loads its messages", async ({
    page,
    createTestSession,
    waitForAppReady,
  }) => {
    const sessionId = await createTestSession("History Test Session");
    await page.goto("/chat");
    await waitForAppReady();
    await page.locator('[data-testid="session-sidebar"]').waitFor();
    const sessionItem = page.locator(`[data-testid="session-item-${sessionId}"]`);
    await sessionItem.click();
    const chatArea = page.locator('[data-testid="chat-area"]');
    await expect(chatArea).toBeVisible();
  });

  test("sessions persist after page reload", async ({
    page,
    createTestSession,
    waitForAppReady,
  }) => {
    const sessionId = await createTestSession("Persist Test Session");
    await page.goto("/chat");
    await waitForAppReady();
    await page.locator('[data-testid="session-sidebar"]').waitFor();
    const sessionItem = page.locator(`[data-testid="session-item-${sessionId}"]`);
    await expect(sessionItem).toBeVisible();
    await page.reload();
    await waitForAppReady();
    await page.locator('[data-testid="session-sidebar"]').waitFor();
    const sessionItemAfterReload = page.locator(
      `[data-testid="session-item-${sessionId}"]`,
    );
    await expect(sessionItemAfterReload).toBeVisible();
  });
});
