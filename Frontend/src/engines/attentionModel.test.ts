import { describe, expect, it } from "vitest";
import {
  detectAttentionFromBehavior,
  fuseAttentionStates,
} from "./attentionModel";

describe("detectAttentionFromBehavior", () => {
  it("classifies fast wrong answers as Impulsive", () => {
    const r = detectAttentionFromBehavior({ responseTime: 1.5, correct: false });
    expect(r.state).toBe("Impulsive");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("classifies error bursts at speed as Impulsive", () => {
    const r = detectAttentionFromBehavior({
      responseTime: 3.0,
      correct: false,
      recentErrors: 2,
    });
    expect(r.state).toBe("Impulsive");
  });

  it("classifies slow or idle answers as Drifting", () => {
    const slow = detectAttentionFromBehavior({ responseTime: 15, correct: true });
    const idle = detectAttentionFromBehavior({ responseTime: 5, correct: false, idleTime: 8 });
    expect(slow.state).toBe("Drifting");
    expect(idle.state).toBe("Drifting");
  });

  it("classifies repeated retries with failure as Overwhelmed", () => {
    const r = detectAttentionFromBehavior({
      responseTime: 6,
      correct: false,
      retries: 2,
    });
    expect(r.state).toBe("Overwhelmed");
  });

  it("classifies steady correct answers as Focused", () => {
    const r = detectAttentionFromBehavior({ responseTime: 6, correct: true });
    expect(r.state).toBe("Focused");
    expect(r.confidence).toBe(0.9);
  });

  it("collects human-readable reasons", () => {
    const r = detectAttentionFromBehavior({ responseTime: 20, correct: false, recentErrors: 1 });
    expect(r.reasons).toContain("Slow answer");
    expect(r.reasons).toContain("Wrong answer");
  });
});

describe("fuseAttentionStates", () => {
  const behavior = { state: "Focused" as const, confidence: 0.9 };

  it("returns the behavior signal when eye data is absent", () => {
    expect(fuseAttentionStates(null, behavior)).toEqual(behavior);
  });

  it("ignores low-confidence eye readings (below 0.55 threshold)", () => {
    const eye = { state: "Overwhelmed" as const, confidence: 0.4 };
    expect(fuseAttentionStates(eye, behavior)).toEqual(behavior);
  });

  it("lets a confident eye reading override behavior when they disagree", () => {
    const eye = { state: "Drifting" as const, confidence: 0.9 };
    const fused = fuseAttentionStates(eye, behavior);
    // eye weight 0.4 * 0.9 = 0.36 vs behavior 0.6 * 0.9 = 0.54 — behavior still wins
    expect(fused.state).toBe("Focused");
  });

  it("fuses agreement into a strong combined score", () => {
    const eye = { state: "Focused" as const, confidence: 0.9 };
    const fused = fuseAttentionStates(eye, behavior);
    expect(fused.state).toBe("Focused");
    expect(fused.confidence).toBeCloseTo(0.9, 5);
  });
});
