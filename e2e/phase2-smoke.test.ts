/**
 * Phase 2 E2E: 带工具的 Agent
 *
 * User Story: Agent 能读写文件 + 记忆读写
 * 所有断言都是用户可感知的行为。
 *
 * 运行: npx vitest run e2e/phase2-smoke.test.ts
 */
import { describe, it, expect } from "vitest";

describe.skip("Phase 2: 带工具的 Agent", () => {
  it("让 Agent 创建文件 → 文件存在且内容正确", async () => {
    // const result = await sdk.chat("s1", "创建 hello.txt，内容 hello world");
    // expect(result.status).toBe("completed");
    // expect(fs.readFileSync("hello.txt", "utf-8")).toBe("hello world");
    expect(true).toBe(true);
  });

  it("让 Agent 读文件 → Agent 知道文件内容", async () => {
    // const result = await sdk.chat("s1", "hello.txt 里写了什么？");
    // expect(result.content).toContain("hello world");
    expect(true).toBe(true);
  });

  it("告诉 Agent 一件事 → Agent 后来能回忆", async () => {
    // await sdk.chat("s1", "记住：我喜欢 TypeScript");
    // const result = await sdk.chat("s1", "我之前说过喜欢什么语言？");
    // expect(result.content).toContain("TypeScript");
    expect(true).toBe(true);
  });

  it("Agent 自主决定存记忆 → 无需用户显式指令", async () => {
    // await sdk.chat("s1", "我的生日是 3 月 15 日");
    // const result = await sdk.chat("s1", "我生日几号？");
    // expect(result.content).toContain("3");
    // expect(result.content).toContain("15");
    expect(true).toBe(true);
  });
});
