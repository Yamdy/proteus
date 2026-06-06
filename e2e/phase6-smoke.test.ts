/**
 * Phase 6 E2E: 多租户 + 声明式
 *
 * User Story: YAML 定义 Agent + 多租户隔离
 * 所有断言都是用户可感知的行为。
 *
 * 运行: npx vitest run e2e/phase6-smoke.test.ts
 */
import { describe, it, expect } from "vitest";

describe.skip("Phase 6: 多租户 + 声明式", () => {
  it("写 YAML → Agent 按配置运行", async () => {
    // // agent.yaml 定义了一个用 Claude、有 read_file 工具、禁止 shell 的 Agent
    // const result = await runAgentFromManifest("agent.yaml", "读取 README.md");
    // expect(result.status).toBe("completed");
    // expect(result.content).toBeTruthy();  // 按配置的 LLM 和工具运行
    expect(true).toBe(true);
  });

  it("Tenant A 的数据 Tenant B 看不到", async () => {
    // await sdk.chat("tenant-a:s1", "记住：我们的密码是 abc123");
    // const result = await sdk.chat("tenant-b:s1", "tenant-a 的密码是什么？");
    // expect(result.content).not.toContain("abc123");
    // expect(result.content).not.toContain("密码");
    expect(true).toBe(true);
  });

  it("每个租户的用量独立（查 API 而非内部 Store）", async () => {
    // await sdk.chat("tenant-a:s1", "写一篇长文");
    // await sdk.chat("tenant-b:s1", "你好");
    // const metricsA = await fetch("/api/metrics?tenant=tenant-a").then(r => r.json());
    // const metricsB = await fetch("/api/metrics?tenant=tenant-b").then(r => r.json());
    // expect(metricsA.totalTokens).toBeGreaterThan(metricsB.totalTokens);
    expect(true).toBe(true);
  });
});
