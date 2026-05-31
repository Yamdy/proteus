import { test, expect, isServerAvailable, isApiAvailable } from "./fixtures";

test.describe("Self-Modify Module", () => {
  let selfModifyApiAvailable = false;

  test.beforeAll(async () => {
    const serverUp = await isServerAvailable();
    if (!serverUp) {
      console.warn("Server not available — skipping self-modify tests");
      test.skip();
    }
    selfModifyApiAvailable = await isApiAvailable("/api/agent/self-modify");
  });

  test.beforeEach(async ({ page, waitForAppReady }) => {
    await page.goto("/self-modify");
    await waitForAppReady();
    await page.locator('[data-testid="self-modify-page"]').waitFor();
  });

  test("displays self-modify page with header", async ({ page }) => {
    const selfModifyPage = page.locator('[data-testid="self-modify-page"]');
    await expect(selfModifyPage).toBeVisible();
    await expect(selfModifyPage.locator("h1")).toHaveText("Self-Modify");
  });

  test("displays history list", async ({ page }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const historyList = page.locator('[data-testid="history-list"]');
    await expect(historyList).toBeVisible();

    // Real server may have zero or more entries — just verify the list renders
    const entries = historyList.locator("[data-testid^='history-entry-']");
    // No assertion on count — could be 0 on a fresh server
    const count = await entries.count();
    if (count === 0) {
      // Empty state is acceptable
      await expect(historyList).toContainText(/no history|empty/i);
    }
  });

  test("history entries show action badges when entries exist", async ({
    page,
  }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const entries = page.locator("[data-testid^='history-entry-']");
    const count = await entries.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // First entry should have an action badge (ADD / MOD / DEL)
    const firstEntry = entries.first();
    await expect(firstEntry).toBeVisible();
    const text = await firstEntry.textContent();
    expect(text).toMatch(/ADD|MOD|DEL|register|replace|unregister/i);
  });

  test("selecting a history entry shows diff viewer", async ({ page }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const entries = page.locator("[data-testid^='history-entry-']");
    const count = await entries.count();
    if (count === 0) {
      test.skip();
      return;
    }

    // Click on the first entry
    const firstEntry = entries.first();
    const entryId = (await firstEntry.getAttribute("data-testid"))?.replace(
      "history-entry-",
      "",
    );

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes(`/api/agent/self-modify/${entryId}`),
    );
    await firstEntry.click();
    await responsePromise;

    // Diff viewer should now show details
    const diffViewer = page.locator('[data-testid="diff-viewer"]');
    await expect(diffViewer).toBeVisible();
  });

  test("diff viewer shows before and after panels", async ({ page }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const entries = page.locator("[data-testid^='history-entry-']");
    const count = await entries.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstEntry = entries.first();
    const entryId = (await firstEntry.getAttribute("data-testid"))?.replace(
      "history-entry-",
      "",
    );

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes(`/api/agent/self-modify/${entryId}`),
    );
    await firstEntry.click();
    await responsePromise;

    const diffViewer = page.locator('[data-testid="diff-viewer"]');
    await expect(diffViewer).toBeVisible();

    // Should have Before and After labels
    await expect(diffViewer).toContainText("Before");
    await expect(diffViewer).toContainText("After");

    // Should have CodeMirror editors for before/after
    const cmEditors = diffViewer.locator(".cm-editor");
    await expect(cmEditors).toHaveCount(2);
  });

  test("diff viewer shows rollback button", async ({ page }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const entries = page.locator("[data-testid^='history-entry-']");
    const count = await entries.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstEntry = entries.first();
    const entryId = (await firstEntry.getAttribute("data-testid"))?.replace(
      "history-entry-",
      "",
    );

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes(`/api/agent/self-modify/${entryId}`),
    );
    await firstEntry.click();
    await responsePromise;

    const rollbackBtn = page.locator('[data-testid="rollback-btn"]');
    await expect(rollbackBtn).toBeVisible();
    await expect(rollbackBtn).toHaveText("Rollback");
  });

  test("rollback shows confirmation dialog and executes", async ({
    page,
  }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const entries = page.locator("[data-testid^='history-entry-']");
    const count = await entries.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstEntry = entries.first();
    const entryId = (await firstEntry.getAttribute("data-testid"))?.replace(
      "history-entry-",
      "",
    );

    const fetchPromise = page.waitForResponse((resp) =>
      resp.url().includes(`/api/agent/self-modify/${entryId}`),
    );
    await firstEntry.click();
    await fetchPromise;

    const rollbackBtn = page.locator('[data-testid="rollback-btn"]');

    // Set up dialog handler to accept the confirmation
    page.on("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("Rollback");
      await dialog.accept();
    });

    const rollbackResponse = page.waitForResponse((resp) =>
      resp.url().includes("/api/agent/self-modify/rollback"),
    );
    await rollbackBtn.click();
    const response = await rollbackResponse;
    expect(response.request().method()).toBe("POST");
  });

  test("rollback confirmation can be cancelled", async ({ page }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const entries = page.locator("[data-testid^='history-entry-']");
    const count = await entries.count();
    if (count === 0) {
      test.skip();
      return;
    }

    const firstEntry = entries.first();
    const entryId = (await firstEntry.getAttribute("data-testid"))?.replace(
      "history-entry-",
      "",
    );

    const fetchPromise = page.waitForResponse((resp) =>
      resp.url().includes(`/api/agent/self-modify/${entryId}`),
    );
    await firstEntry.click();
    await fetchPromise;

    const rollbackBtn = page.locator('[data-testid="rollback-btn"]');

    // Set up dialog handler to dismiss the confirmation
    let dialogSeen = false;
    page.on("dialog", async (dialog) => {
      dialogSeen = true;
      expect(dialog.type()).toBe("confirm");
      await dialog.dismiss();
    });

    await rollbackBtn.click();

    await page.waitForTimeout(500);
    expect(dialogSeen).toBe(true);

    // Diff viewer should still be visible (no rollback happened)
    await expect(page.locator('[data-testid="diff-viewer"]')).toBeVisible();
  });

  test("clicking different entries updates diff viewer", async ({ page }) => {
    if (!selfModifyApiAvailable) {
      test.skip();
      return;
    }

    const entries = page.locator("[data-testid^='history-entry-']");
    const count = await entries.count();
    if (count < 2) {
      test.skip();
      return;
    }

    // Select first entry
    const firstEntry = entries.first();
    const firstId = (await firstEntry.getAttribute("data-testid"))?.replace(
      "history-entry-",
      "",
    );
    const fetch1 = page.waitForResponse((resp) =>
      resp.url().includes(`/api/agent/self-modify/${firstId}`),
    );
    await firstEntry.click();
    await fetch1;

    const diffViewer = page.locator('[data-testid="diff-viewer"]');
    await expect(diffViewer).toBeVisible();

    // Select second entry
    const secondEntry = entries.nth(1);
    const secondId = (await secondEntry.getAttribute("data-testid"))?.replace(
      "history-entry-",
      "",
    );
    const fetch2 = page.waitForResponse((resp) =>
      resp.url().includes(`/api/agent/self-modify/${secondId}`),
    );
    await secondEntry.click();
    await fetch2;

    await expect(diffViewer).toBeVisible();
  });

  test("history list has refresh button", async ({ page }) => {
    const historyList = page.locator('[data-testid="history-list"]');
    const refreshBtn = historyList.getByRole("button", { name: "Refresh" });
    await expect(refreshBtn).toBeVisible();
  });
});
