import { test, expect, isServerAvailable } from "./fixtures";

test.describe("Navigation and Routing", () => {
  test.beforeAll(async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.warn("Server not available — skipping navigation tests");
      test.skip();
    }
  });

  test.beforeEach(async ({ page, waitForServer, waitForAppReady }) => {
    await waitForServer();
    await page.goto("/");
    await waitForAppReady();
  });

  test("redirects / to /chat by default", async ({ page }) => {
    await expect(page).toHaveURL(/\/chat$/);
  });

  test("sidebar displays all navigation items", async ({ page }) => {
    const nav = page.locator('[data-testid="nav"]');
    await expect(nav.locator("a")).toHaveCount(5);

    await expect(page.locator('[data-testid="nav-chat"]')).toBeVisible();
    await expect(page.locator('[data-testid="nav-config"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="nav-self-modify"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="nav-observability"]'),
    ).toBeVisible();
    await expect(page.locator('[data-testid="nav-costs"]')).toBeVisible();
  });

  test("navigates to /chat and highlights Chat nav item", async ({
    page,
  }) => {
    await page.locator('[data-testid="nav-chat"]').click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.locator('[data-testid="nav-chat"]')).toHaveClass(
      /bg-cyan-500/,
    );
  });

  test("navigates to /config and highlights Config nav item", async ({
    page,
  }) => {
    await page.locator('[data-testid="nav-config"]').click();
    await expect(page).toHaveURL(/\/config/);
    await expect(page.locator('[data-testid="nav-config"]')).toHaveClass(
      /bg-cyan-500/,
    );
  });

  test("navigates to /self-modify and highlights nav item", async ({
    page,
  }) => {
    await page.locator('[data-testid="nav-self-modify"]').click();
    await expect(page).toHaveURL(/\/self-modify$/);
    await expect(
      page.locator('[data-testid="nav-self-modify"]'),
    ).toHaveClass(/bg-cyan-500/);
  });

  test("navigates to /observability and highlights nav item", async ({
    page,
  }) => {
    await page.locator('[data-testid="nav-observability"]').click();
    await expect(page).toHaveURL(/\/observability$/);
    await expect(
      page.locator('[data-testid="nav-observability"]'),
    ).toHaveClass(/bg-cyan-500/);
  });

  test("navigates to /costs and highlights Costs nav item", async ({
    page,
  }) => {
    await page.locator('[data-testid="nav-costs"]').click();
    await expect(page).toHaveURL(/\/costs$/);
    await expect(page.locator('[data-testid="nav-costs"]')).toHaveClass(
      /bg-cyan-500/,
    );
  });

  test("connection indicator is visible in sidebar", async ({ page }) => {
    const indicator = page.locator('[data-testid="connection-indicator"]');
    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveText(/Connected|Disconnected/);
  });

  test("connection dot has correct color class", async ({ page }) => {
    const dot = page.locator('[data-testid="connection-dot"]');
    await expect(dot).toBeVisible();
    // Should have either emerald (connected) or red (disconnected)
    const classAttr = await dot.getAttribute("class");
    expect(classAttr).toMatch(/bg-(emerald|green|red)/);
  });

  test("pages are lazy loaded with Suspense fallback", async ({ page }) => {
    // Navigate to a lazy-loaded page and verify content eventually appears
    await page.locator('[data-testid="nav-config"]').click();
    await expect(page.locator('[data-testid="config-page"]')).toBeVisible();
  });

  test("sidebar remains visible across all routes", async ({ page }) => {
    const sidebar = page.locator('[data-testid="sidebar"]');
    await expect(sidebar).toBeVisible();

    await page.locator('[data-testid="nav-config"]').click();
    await expect(page).toHaveURL(/\/config/);
    await expect(sidebar).toBeVisible();

    await page.locator('[data-testid="nav-self-modify"]').click();
    await expect(page).toHaveURL(/\/self-modify/);
    await expect(sidebar).toBeVisible();

    await page.locator('[data-testid="nav-observability"]').click();
    await expect(page).toHaveURL(/\/observability/);
    await expect(sidebar).toBeVisible();

    await page.locator('[data-testid="nav-costs"]').click();
    await expect(page).toHaveURL(/\/costs/);
    await expect(sidebar).toBeVisible();
  });
});
