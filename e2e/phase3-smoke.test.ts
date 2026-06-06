/**
 * Phase 3 E2E: 服务化
 *
 * User Story: HTTP API + WebSocket 实时流 + 重启后对话可恢复
 * 所有断言都是用户可感知的行为。
 *
 * 运行: npx vitest run e2e/phase3-smoke.test.ts
 */
import { describe, it, expect } from "vitest";

describe.skip("Phase 3: 服务化", () => {
  it("发 HTTP 请求 → 收到 LLM 回复", async () => {
    // const res = await fetch("http://localhost:3000/api/chat", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ sessionId: "s1", message: "你好" }),
    // });
    // expect(res.status).toBe(200);
    // const body = await res.json();
    // expect(body.content).toBeTruthy();
    // expect(body.content.length).toBeGreaterThan(0);
    expect(true).toBe(true);
  });

  it("WebSocket 实时收到 token（用户看到逐字输出）", async () => {
    // const tokens = await collectWsTokens("ws://localhost:3000/ws", async () => {
    //   await fetch("http://localhost:3000/api/chat", { method: "POST", ... });
    // });
    // expect(tokens.length).toBeGreaterThan(1);  // 逐字输出，不止一个 token
    // expect(tokens.join("")).toBeTruthy();        // 拼起来有内容
    expect(true).toBe(true);
  });

  it("重启 Server 后 → 对话可恢复", async () => {
    // await chat("s1", "记住数字 42");
    // restartServer();
    // const result = await chat("s1", "我刚才说了什么数字？");
    // expect(result.content).toContain("42");
    expect(true).toBe(true);
  });
});
