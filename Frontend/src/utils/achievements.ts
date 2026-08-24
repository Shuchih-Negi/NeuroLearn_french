/**
 * Achievement definitions + a pure evaluator.
 * The evaluator takes a plain snapshot (no store imports) so it is trivially
 * unit-testable and reusable from anywhere.
 */

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_quest",   title: "First Quest",      desc: "Finish your first quest",              icon: "🗡️" },
  { id: "perfect_run",   title: "Flawless Victory", desc: "Answer every question correctly",      icon: "💯" },
  { id: "streak5",       title: "On Fire",          desc: "5 correct answers in a row",           icon: "🔥" },
  { id: "streak10",      title: "Unstoppable",      desc: "10 correct answers in a row",          icon: "⚡" },
  { id: "streak3days",   title: "Habit Seed",       desc: "Play 3 days in a row",                 icon: "🌱" },
  { id: "streak7days",   title: "Week Warrior",     desc: "Play 7 days in a row",                 icon: "📅" },
  { id: "goal_smasher",  title: "Goal Smasher",     desc: "Hit your daily goal",                  icon: "🎯" },
  { id: "level5",        title: "Rising Star",      desc: "Reach level 5",                        icon: "🚀" },
  { id: "xp1000",        title: "XP Royalty",       desc: "Earn 1,000 XP total",                  icon: "👑" },
  { id: "focused_mind",  title: "Focused Mind",     desc: "Finish a quest 80% Focused",           icon: "🧘" },
  { id: "comeback_kid",  title: "Comeback Kid",     desc: "Score 70%+ after drifting off",        icon: "🌊" },
  { id: "data_hero",     title: "Data Hero",        desc: "Send 25 attention self-reports",       icon: "🧠" },
  { id: "data_legend",   title: "Data Legend",      desc: "Send 75 attention self-reports",       icon: "🔬" },
  { id: "boss_slayer",   title: "Boss Slayer",      desc: "Defeat a Boss Battle",                 icon: "⚔️" },
  { id: "early_bird",    title: "Early Bird",       desc: "Complete a quest before 8 AM",         icon: "🌅" },
];

export const ACHIEVEMENT_INDEX: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a])
);

export interface EvaluationContext {
  totalXP: number;
  level: number;
  streakDays: number;
  answersToday: number;
  dailyGoal: number;
  sessionCorrect: number;
  sessionTotal: number;
  sessionMaxStreak: number;
  attentionHistory: string[];
  researchLabels: number;
  bossWins: number;
  finishedBefore8AM: boolean;
}

/** Pure: returns the list of achievement ids earned by this context. */
export function evaluateAchievements(ctx: EvaluationContext): string[] {
  const earned: string[] = [];
  const add = (id: string, cond: boolean) => cond && earned.push(id);
  const pct = ctx.sessionTotal > 0 ? ctx.sessionCorrect / ctx.sessionTotal : 0;
  const focusRatio =
    ctx.attentionHistory.length > 0
      ? ctx.attentionHistory.filter((s) => s === "Focused").length /
        ctx.attentionHistory.length
      : 0;

  add("first_quest", ctx.sessionTotal > 0);
  add("perfect_run", ctx.sessionTotal >= 5 && pct === 1);
  add("streak5", ctx.sessionMaxStreak >= 5);
  add("streak10", ctx.sessionMaxStreak >= 10);
  add("streak3days", ctx.streakDays >= 3);
  add("streak7days", ctx.streakDays >= 7);
  add("goal_smasher", ctx.answersToday >= ctx.dailyGoal && ctx.dailyGoal > 0);
  add("level5", ctx.level >= 5);
  add("xp1000", ctx.totalXP >= 1000);
  add("focused_mind", ctx.sessionTotal >= 5 && focusRatio >= 0.8);
  add(
    "comeback_kid",
    ctx.sessionTotal >= 5 &&
      pct >= 0.7 &&
      ctx.attentionHistory.some((s) => s === "Drifting" || s === "Overwhelmed")
  );
  add("data_hero", ctx.researchLabels >= 25);
  add("data_legend", ctx.researchLabels >= 75);
  add("boss_slayer", ctx.bossWins > 0);
  add("early_bird", ctx.sessionTotal > 0 && ctx.finishedBefore8AM);
  return earned;
}
