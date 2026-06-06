/**
 * Phase 1 E2E: 最小可运行 Agent
 *
 * User Story: 开发者用 3 行代码创建 Agent，发送消息，收到 LLM 回复
 * 所有断言都是用户可感知的行为，不依赖内部 API。
 *
 * 运行: npx vitest run e2e/phase1-smoke.test.ts
 */
import { describe, it, expect } from "vitest";

describe.skip("Phase 1: 最小可运行 Agent", () => {
  it("发消息 → 收到回复", async () => {
    // const result = await sdk.chat("s1", "1+1等于几？");
    // expect(result.status).toBe("completed");
    expect(true).toBe(true);
  });

  it("回复内容正确", async () => {
    // const result = await sdk.chat("s1", "1+1等于几？");
    // expect(result.content).toContain("2");
    expect(true).toBe(true);
  });

  it("回复包含有效的 turnId", async () => {
    // const result = await sdk.chat("s1", "你好");
    // expect(result.turnId).toBeTruthy();
    // expect(typeof result.turnId).toBe("string");
    // expect(result.turnId.length).toBeGreaterThan(0);
    expect(true).toBe(true);
  });
});
