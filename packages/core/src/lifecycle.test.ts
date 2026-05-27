import { describe, it, expect } from "vitest";
import { LifecycleStateMachine } from "./lifecycle.js";

describe("LifecycleStateMachine", () => {
  it("starts in pending state by default", () => {
    const sm = new LifecycleStateMachine();
    expect(sm.state).toBe("pending");
  });

  it("transitions pending → running via start", () => {
    const sm = new LifecycleStateMachine();
    sm.transition("start");
    expect(sm.state).toBe("running");
  });

  it("transitions running → completed via complete", () => {
    const sm = new LifecycleStateMachine("running");
    sm.transition("complete");
    expect(sm.state).toBe("completed");
  });

  it("transitions running → paused via suspend", () => {
    const sm = new LifecycleStateMachine("running");
    sm.transition("suspend");
    expect(sm.state).toBe("paused");
  });

  it("transitions paused → running via resume", () => {
    const sm = new LifecycleStateMachine("paused");
    sm.transition("resume");
    expect(sm.state).toBe("running");
  });

  it("transitions running → errored via error", () => {
    const sm = new LifecycleStateMachine("running");
    sm.transition("error");
    expect(sm.state).toBe("errored");
  });

  it("transitions running → cancelled via cancel", () => {
    const sm = new LifecycleStateMachine("running");
    sm.transition("cancel");
    expect(sm.state).toBe("cancelled");
  });

  it("throws on invalid transition (completed → running)", () => {
    const sm = new LifecycleStateMachine("completed");
    expect(() => sm.transition("start")).toThrow(/Invalid transition/);
  });

  it("canTransition returns true for valid transitions", () => {
    const sm = new LifecycleStateMachine("running");
    expect(sm.canTransition("complete")).toBe(true);
    expect(sm.canTransition("suspend")).toBe(true);
  });

  it("canTransition returns false for invalid transitions", () => {
    const sm = new LifecycleStateMachine("completed");
    expect(sm.canTransition("start")).toBe(false);
  });

  it("serializes and deserializes via JSON", () => {
    const sm = new LifecycleStateMachine("running");
    sm.transition("suspend");
    const json = sm.toJSON();
    const restored = LifecycleStateMachine.fromJSON(json);
    expect(restored.state).toBe("paused");
  });
});
