/**
 * Persistent player profile: XP, level, day-streak, daily goal log,
 * unlocked achievements + toast queue. Survives reloads (zustand persist).
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ACHIEVEMENT_INDEX } from "../utils/achievements";

export const DAILY_GOAL = 10;
export const XP_PER_LEVEL = 150;

export function levelFromXP(totalXP: number): number {
  return Math.floor(Math.max(0, totalXP) / XP_PER_LEVEL) + 1;
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return todayKey(d);
}

export interface SessionOutcome {
  correct: number;
  total: number;
  xpEarned: number;
  maxStreak: number;
  attentionHistory: string[];
}

export interface ToastItem {
  key: number;
  id: string;
  title: string;
  icon: string;
}

interface PlayerState {
  totalXP: number;
  dailyLog: Record<string, number>;
  streakDays: number;
  lastPlayDate: string | null;
  unlocked: Record<string, string>; // achievementId → ISO unlock time
  toasts: ToastItem[];
  bossWins: number;

  recordAnswer: () => void;
  completeSession: (outcome: SessionOutcome) => void;
  registerBossWin: () => void;
  unlock: (id: string) => boolean; // returns true if newly unlocked
  dismissToast: () => void;
}

function touchStreak(state: PlayerState): PlayerState {
  const today = todayKey();
  if (state.lastPlayDate === today) return state;
  const streak =
    state.lastPlayDate === yesterdayKey() ? state.streakDays + 1 : 1;
  return { ...state, streakDays: streak, lastPlayDate: today };
}

/** Streak as it should be DISPLAYED right now (zeroes out after a missed day). */
export function effectiveStreak(s: Pick<PlayerState, "streakDays" | "lastPlayDate">): number {
  if (!s.lastPlayDate) return 0;
  const t = todayKey();
  if (s.lastPlayDate === t || s.lastPlayDate === yesterdayKey()) return s.streakDays;
  return 0;
}

export function answersToday(s: Pick<PlayerState, "dailyLog">): number {
  return s.dailyLog[todayKey()] ?? 0;
}

let toastSeq = 1;

export const usePlayer = create<PlayerState>()(
  persist(
    (set) => ({
      totalXP: 0,
      dailyLog: {},
      streakDays: 0,
      lastPlayDate: null,
      unlocked: {},
      toasts: [],
      bossWins: 0,

      recordAnswer: () =>
        set((state) => {
          const next = touchStreak(state);
          const today = todayKey();
          return {
            ...next,
            dailyLog: { ...next.dailyLog, [today]: (next.dailyLog[today] ?? 0) + 1 },
          };
        }),

      completeSession: (outcome) =>
        set((state) => {
          const next = touchStreak(state);
          return {
            ...next,
            totalXP: next.totalXP + Math.max(0, Math.round(outcome.xpEarned)),
          };
        }),

      registerBossWin: () =>
        set((state) => ({ ...state, bossWins: state.bossWins + 1 })),

      unlock: (id) => {
        let created = false;
        set((state) => {
          if (state.unlocked[id]) return state;
          created = true;
          const badge = ACHIEVEMENT_INDEX[id];
          return {
            ...state,
            unlocked: { ...state.unlocked, [id]: new Date().toISOString() },
            toasts: [
              ...state.toasts,
              {
                key: toastSeq++,
                id,
                title: badge?.title ?? id,
                icon: badge?.icon ?? "🏅",
              },
            ],
          };
        });
        return created;
      },

      dismissToast: () => set((state) => ({ toasts: state.toasts.slice(1) })),
    }),
    { name: "nl_player_v1" }
  )
);
