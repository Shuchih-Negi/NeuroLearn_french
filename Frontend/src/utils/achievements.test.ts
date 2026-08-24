import { describe, expect, it } from "vitest";
import { evaluateAchievements, type EvaluationContext } from "./achievements";

const base: EvaluationContext = {
  totalXP: 0,
  level: 1,
  streakDays: 0,
  answersToday: 0,
  dailyGoal: 10,
  sessionCorrect: 0,
  sessionTotal: 0,
  sessionMaxStreak: 0,
  attentionHistory: [],
  researchLabels: 0,
  bossWins: 0,
  finishedBefore8AM: false,
};

describe("evaluateAchievements", () => {
  it("awards first_quest for any completed session", () => {
    const ids = evaluateAchievements({ ...base, sessionCorrect: 3, sessionTotal: 10 });
    expect(ids).toContain("first_quest");
  });

  it("requires ≥5 questions for perfect_run", () => {
    const small = evaluateAchievements({
      ...base,
      sessionCorrect: 3,
      sessionTotal: 3,
      sessionMaxStreak: 3,
    });
    expect(small).not.toContain("perfect_run");

    const full = evaluateAchievements({
      ...base,
      sessionCorrect: 5,
      sessionTotal: 5,
      sessionMaxStreak: 5,
    });
    expect(full).toContain("perfect_run");
    expect(full).toContain("streak5");
  });

  it("uses max streak thresholds", () => {
    const s9 = evaluateAchievements({ ...base, sessionCorrect: 9, sessionTotal: 10, sessionMaxStreak: 9 });
    expect(s9).toContain("streak5");
    expect(s9).not.toContain("streak10");

    const s12 = evaluateAchievements({ ...base, sessionCorrect: 10, sessionTotal: 10, sessionMaxStreak: 12 });
    expect(s12).toContain("streak10");
  });

  it("handles day-streak and daily-goal badges", () => {
    const ctx = evaluateAchievements({
      ...base,
      streakDays: 7,
      answersToday: 10,
      sessionCorrect: 6,
      sessionTotal: 10,
    });
    expect(ctx).toContain("streak3days");
    expect(ctx).toContain("streak7days");
    expect(ctx).toContain("goal_smasher");
  });

  it("gates level and XP milestones", () => {
    const low = evaluateAchievements({ ...base, totalXP: 999, level: 4 });
    expect(low).not.toContain("level5");
    expect(low).not.toContain("xp1000");
    const high = evaluateAchievements({ ...base, totalXP: 1200, level: 6 });
    expect(high).toContain("level5");
    expect(high).toContain("xp1000");
  });

  it("computes focus ratio and comeback conditions", () => {
    const history = ["Focused", "Focused", "Focused", "Focused", "Drifting"];
    const focused = evaluateAchievements({
      ...base,
      sessionCorrect: 8,
      sessionTotal: 10,
      attentionHistory: history,
    });
    expect(focused).toContain("focused_mind"); // 4/5 = 80% exactly → qualifies
    expect(focused).toContain("comeback_kid"); // drifting present + 80% ≥ 70%
  });

  it("awards data tiers, boss wins and early bird independently of sessions", () => {
    const ids = evaluateAchievements({
      ...base,
      researchLabels: 75,
      bossWins: 2,
    });
    expect(ids).toContain("data_hero");
    expect(ids).toContain("data_legend");
    expect(ids).toContain("boss_slayer");
    expect(ids).not.toContain("early_bird"); // no session completed

    const early = evaluateAchievements({
      ...base,
      sessionCorrect: 5,
      sessionTotal: 10,
      finishedBefore8AM: true,
    });
    expect(early).toContain("early_bird");
  });
});
