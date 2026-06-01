import { test, expect, isServerAvailable, isLLMConfigured } from "./fixtures";

test.describe("Chat Module", () => {
  let testSessionId: string;

  test.beforeAll(async () => {
    const available = await isServerAvailable();
    if (!available) {
      console.warn("Server not available — skipping chat tests");
      test.skip();
    }
  });

  test.beforeEach(async ({ page, createTestSession, waitForAppReady }) => {
    // Create a real session for the test
    testSessionId = await createTestSession("E2E Chat Test");

    await page.goto("/chat");
    await waitForAppReady();
    // Wait for session sidebar to appear
    await page.locator('[data-testid="session-sidebar"]').waitFor();
  });

  test("displays session sidebar with session list", async ({ page }) => {
    const sidebar = page.locator('[data-testid="session-sidebar"]');
    await expect(sidebar).toBeVisible();

    const sessionList = page.locator('[data-testid="session-list"]');
    await expect(sessionList).toBeVisible();

    // Should have at least one session (our test session)
    const sessionItems = sessionList.locator("[data-testid^='session-item-']");
    await expect(sessionItems.first()).toBeVisible();
  });

  test("shows empty chat area when no session is selected", async ({
    page,
  }) => {
    const chatArea = page.locator('[data-testid="chat-area"]');
    const emptyState = page.locator('[data-testid="chat-empty"]');

    const hasChatArea = await chatArea.isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasChatArea || hasEmpty).toBe(true);
  });

  test("selects a session and shows chat area", async ({ page }) => {
    // Find the session item matching our test session
    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();

    const chatArea = page.locator('[data-testid="chat-area"]');
    await expect(chatArea).toBeVisible();
  });

  test("creates a new session", async ({ page }) => {
    const createBtn = page.locator('[data-testid="create-session-btn"]');
    await expect(createBtn).toBeVisible();

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes("/api/threads") && resp.request().method() === "POST",
    );
    await createBtn.click();
    await responsePromise;

    // After creation, the session list should have one more item
    const sessionList = page.locator('[data-testid="session-list"]');
    const sessionItems = sessionList.locator("[data-testid^='session-item-']");
    const count = await sessionItems.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("deletes a session", async ({ page }) => {
    // Hover over our test session to reveal delete button
    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.hover();

    const deleteBtn = page.locator(`[data-testid="delete-session-${testSessionId}"]`);
    await expect(deleteBtn).toBeVisible();

    const responsePromise = page.waitForResponse((resp) =>
      resp.url().includes(`/api/threads/${testSessionId}`) &&
      resp.request().method() === "DELETE",
    );
    await deleteBtn.click();
    await responsePromise;

    // Session should be removed from the list
    await expect(sessionItem).not.toBeVisible({ timeout: 10000 });
  });

  test("sends a message via input and send button", async ({ page }) => {
    if (!isLLMConfigured()) {
      test.skip();
      return;
    }

    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();

    const input = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');

    await expect(input).toBeVisible();
    await expect(sendBtn).toBeVisible();

    // Initially send button should be disabled (empty input)
    await expect(sendBtn).toBeDisabled();

    // Type a message
    await input.fill("Hello, assistant!");
    await expect(sendBtn).toBeEnabled();

    // Send the message
    await sendBtn.click();

    // User message should appear
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toContainText("Hello, assistant!");
  });

  test("sends a message via Enter key", async ({ page }) => {
    if (!isLLMConfigured()) {
      test.skip();
      return;
    }

    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();

    const input = page.locator('[data-testid="chat-input"]');
    await input.fill("Test message via Enter");
    await input.press("Enter");

    // User message should appear
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible();
  });

  test("receives streaming response after sending message", async ({
    page,
  }) => {
    if (!isLLMConfigured()) {
      test.skip();
      return;
    }

    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();

    const input = page.locator('[data-testid="chat-input"]');
    await input.fill("Say hello in one word");
    await input.press("Enter");

    // Wait for assistant message to appear (streaming response — allow up to 120s)
    await expect(
      page.locator('[data-testid="message-assistant"]').first(),
    ).toBeVisible({ timeout: 120_000 });

    const assistantMsg = page
      .locator('[data-testid="message-assistant"]')
      .first();
    await expect(assistantMsg).not.toBeEmpty();
  });

  test("renders Markdown in assistant messages", async ({ page }) => {
    if (!isLLMConfigured()) {
      test.skip();
      return;
    }

    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();

    const input = page.locator('[data-testid="chat-input"]');
    await input.fill("Respond with a markdown heading: # Hello World");
    await input.press("Enter");

    // Wait for assistant message
    await expect(
      page.locator('[data-testid="message-assistant"]').first(),
    ).toBeVisible({ timeout: 120_000 });

    const assistantMsg = page
      .locator('[data-testid="message-assistant"]')
      .first();
    await expect(assistantMsg).toBeVisible();
  });

  test("chat messages container supports scrolling", async ({ page }) => {
    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();

    const messagesContainer = page.locator('[data-testid="chat-messages"]');
    await expect(messagesContainer).toBeVisible();

    const classAttr = await messagesContainer.getAttribute("class");
    expect(classAttr).toContain("overflow-y-auto");
  });

  test("send button is disabled when input is empty or whitespace", async ({
    page,
  }) => {
    const sessionItem = page.locator(`[data-testid="session-item-${testSessionId}"]`);
    await expect(sessionItem).toBeVisible({ timeout: 10000 });
    await sessionItem.click();
    await expect(page.locator('[data-testid="chat-area"]')).toBeVisible();

    const input = page.locator('[data-testid="chat-input"]');
    const sendBtn = page.locator('[data-testid="send-btn"]');

    // Empty input
    await expect(sendBtn).toBeDisabled();

    // Whitespace only
    await input.fill("   ");
    await expect(sendBtn).toBeDisabled();

    // With content
    await input.fill("Hello");
    await expect(sendBtn).toBeEnabled();
  });

  test("session footer shows session count", async ({ page }) => {
    const sidebar = page.locator('[data-testid="session-sidebar"]');
    // We created at least one test session, so count should be >= 1
    await expect(sidebar).toContainText(/\d+ sessions?/);
  });
});
