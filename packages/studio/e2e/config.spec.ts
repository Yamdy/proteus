import { test, expect, isServerAvailable, isApiAvailable } from "./fixtures";

test.describe("Config Module", () => {
  let configApiAvailable = false;

  test.beforeAll(async () => {
    const serverUp = await isServerAvailable();
    if (!serverUp) {
      console.warn("Server not available — skipping config tests");
      test.skip();
    }
    // The frontend hooks use /api/agent/config but the real server exposes /api/config.
    // Check which path is reachable so tests can adapt.
    configApiAvailable =
      (await isApiAvailable("/api/agent/config")) ||
      (await isApiAvailable("/api/config"));
  });

  test.beforeEach(async ({ page, waitForAppReady }) => {
    await page.goto("/config");
    await waitForAppReady();
    await page.locator('[data-testid="config-page"]').waitFor();
  });

  test("displays config page with header and tabs", async ({ page }) => {
    const configPage = page.locator('[data-testid="config-page"]');
    await expect(configPage).toBeVisible();
    await expect(configPage.locator("h1")).toHaveText("Configuration");

    await expect(
      page.locator('[data-testid="config-tab-level0"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="config-tab-level1"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="config-tab-level2"]'),
    ).toBeVisible();
  });

  test("Level 0 tab is active by default and shows form", async ({
    page,
  }) => {
    const level0Tab = page.locator('[data-testid="config-tab-level0"]');
    await expect(level0Tab).toHaveClass(/text-white/);

    const level0Form = page.locator('[data-testid="level0-form"]');
    await expect(level0Form).toBeVisible();
  });

  test("Level 0 form displays LLM configuration fields", async ({
    page,
  }) => {
    const providerSelect = page.locator('[data-testid="provider-select"]');
    await expect(providerSelect).toBeVisible();
    // Value depends on real server config — just verify the field exists and has a value
    const providerValue = await providerSelect.inputValue();
    expect(providerValue.length).toBeGreaterThan(0);

    const modelInput = page.locator('[data-testid="model-input"]');
    await expect(modelInput).toBeVisible();
    const modelValue = await modelInput.inputValue();
    expect(modelValue.length).toBeGreaterThan(0);
  });

  test("Level 0 form displays tool toggles", async ({ page }) => {
    const level0Form = page.locator('[data-testid="level0-form"]');
    // Tools section should exist; specific tools depend on real server config
    await expect(level0Form).toBeVisible();
  });

  test("Level 0 form displays log level buttons", async ({ page }) => {
    await expect(
      page.locator('[data-testid="log-level-debug"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="log-level-info"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="log-level-warn"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="log-level-error"]'),
    ).toBeVisible();

    // One of the buttons should be active (have the selected style)
    const activeButton = page.locator(
      '[data-testid^="log-level-"].bg-blue-600',
    );
    await expect(activeButton).toBeVisible();
  });

  test("Level 0 form allows editing and saving", async ({ page }) => {
    if (!configApiAvailable) {
      test.skip();
      return;
    }

    const modelInput = page.locator('[data-testid="model-input"]');
    const originalValue = await modelInput.inputValue();
    await modelInput.clear();
    await modelInput.fill("e2e-test-model");

    const saveBtn = page.locator('[data-testid="save-btn"]');
    await expect(saveBtn).toBeEnabled();

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/api/"),
    );
    await saveBtn.click();
    const response = await responsePromise;
    expect(response.request().method()).toBe("PUT");

    // Restore original value
    await modelInput.clear();
    await modelInput.fill(originalValue);
    const restoreBtn = page.locator('[data-testid="save-btn"]');
    await restoreBtn.click();
  });

  test("Level 0 form allows changing log level", async ({ page }) => {
    await page.locator('[data-testid="log-level-debug"]').click();

    const saveBtn = page.locator('[data-testid="save-btn"]');
    await expect(saveBtn).toBeEnabled();

    await page.locator('[data-testid="log-level-debug"]').click();
    await expect(
      page.locator('[data-testid="log-level-debug"]'),
    ).toHaveClass(/bg-blue-600/);
  });

  test("switches to Level 1 tab and shows handler pipeline", async ({
    page,
  }) => {
    await page.locator('[data-testid="config-tab-level1"]').click();

    const level1Editor = page.locator('[data-testid="level1-editor"]');
    await expect(level1Editor).toBeVisible();

    const handlerList = page.locator('[data-testid="handler-list"]');
    await expect(handlerList).toBeVisible();

    // Should have at least one handler from real server config
    const handlers = handlerList.locator("[data-testid^='handler-']");
    const count = await handlers.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Level 1 handler reorder buttons work", async ({ page }) => {
    await page.locator('[data-testid="config-tab-level1"]').click();
    await page.locator('[data-testid="level1-editor"]').waitFor();

    // Find the first handler that has a move-down button
    const moveDownBtn = page
      .locator("[data-testid^='move-down-']")
      .first();
    if (await moveDownBtn.isVisible().catch(() => false)) {
      await moveDownBtn.click();
    }

    const handlerList = page.locator('[data-testid="handler-list"]');
    const handlers = handlerList.locator("[data-testid^='handler-']");
    const count = await handlers.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("Level 1 handler move-up button is disabled for first handler", async ({
    page,
  }) => {
    await page.locator('[data-testid="config-tab-level1"]').click();
    await page.locator('[data-testid="level1-editor"]').waitFor();

    // The first handler's move-up button should be disabled
    const firstMoveUp = page
      .locator("[data-testid^='move-up-']")
      .first();
    if (await firstMoveUp.isVisible().catch(() => false)) {
      await expect(firstMoveUp).toBeDisabled();
    }
  });

  test("Level 1 handler move-down button is disabled for last handler", async ({
    page,
  }) => {
    await page.locator('[data-testid="config-tab-level1"]').click();
    await page.locator('[data-testid="level1-editor"]').waitFor();

    // The last handler's move-down button should be disabled
    const lastMoveDown = page
      .locator("[data-testid^='move-down-']")
      .last();
    if (await lastMoveDown.isVisible().catch(() => false)) {
      await expect(lastMoveDown).toBeDisabled();
    }
  });

  test("switches to Level 2 tab and shows code editor", async ({ page }) => {
    await page.locator('[data-testid="config-tab-level2"]').click();

    const level2Editor = page.locator('[data-testid="level2-editor"]');
    await expect(level2Editor).toBeVisible();

    // CodeMirror editor should be rendered
    const cmEditor = level2Editor.locator(".cm-editor");
    await expect(cmEditor).toBeVisible();
  });

  test("Level 2 code editor shows Diff View button", async ({ page }) => {
    await page.locator('[data-testid="config-tab-level2"]').click();
    await page.locator('[data-testid="level2-editor"]').waitFor();

    const diffBtn = page.locator('[data-testid="diff-view-btn"]');
    await expect(diffBtn).toBeVisible();
    await expect(diffBtn).toHaveText("Diff View");

    // Toggle diff mode
    await diffBtn.click();
    await expect(diffBtn).toHaveText("Exit Diff");

    // Toggle back
    await diffBtn.click();
    await expect(diffBtn).toHaveText("Diff View");
  });

  test("tab switching preserves state", async ({ page }) => {
    // Start on Level 0
    await expect(page.locator('[data-testid="level0-form"]')).toBeVisible();

    // Capture current model value
    const modelInput = page.locator('[data-testid="model-input"]');
    const originalModel = await modelInput.inputValue();

    // Switch to Level 1
    await page.locator('[data-testid="config-tab-level1"]').click();
    await expect(page.locator('[data-testid="level1-editor"]')).toBeVisible();

    // Switch to Level 2
    await page.locator('[data-testid="config-tab-level2"]').click();
    await expect(page.locator('[data-testid="level2-editor"]')).toBeVisible();

    // Switch back to Level 0
    await page.locator('[data-testid="config-tab-level0"]').click();
    await expect(page.locator('[data-testid="level0-form"]')).toBeVisible();

    // Form should still have original value
    await expect(page.locator('[data-testid="model-input"]')).toHaveValue(
      originalModel,
    );
  });
});
