/**
 * Global app state (zustand) — replaces prop-drilling through App.
 * The studentId is a stable per-browser anonymous id used by the backend
 * for progress tracking and dataset rows.
 */

import { create } from "zustand";
import { type CharacterDef, type ChapterDef, type SectionDef } from "../data/chapters";

export interface SessionResults {
  totalCorrect: number;
  totalQuestions: number;
  attentionHistory: string[];
  skillResults: Record<string, number>;
  topic?: string;
}

export interface SectionWithFlags extends SectionDef {
  isFinalBoss?: boolean;
}

interface AppState {
  studentId: string;
  character: CharacterDef | null;
  chapter: ChapterDef | null;
  section: SectionWithFlags | null;
  lastResults: SessionResults | null;
  sectionProgress: Record<string, { answered: number; correct: number }>;

  setCharacter: (c: CharacterDef) => void;
  setChapter: (c: ChapterDef) => void;
  setSection: (s: SectionWithFlags) => void;
  setLastResults: (r: SessionResults) => void;
  recordSectionResult: (sectionId: string, totalQuestions: number, totalCorrect: number) => void;
}

function makeStudentId(): string {
  try {
    const existing = localStorage.getItem("nl_student_id");
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("nl_student_id", id);
    return id;
  } catch {
    return "default";
  }
}

export const useStore = create<AppState>((set) => ({
  studentId: makeStudentId(),
  character: null,
  chapter: null,
  section: null,
  lastResults: null,
  sectionProgress: {},

  setCharacter: (character) => set({ character }),
  setChapter: (chapter) => set({ chapter }),
  setSection: (section) => set({ section }),
  setLastResults: (lastResults) => set({ lastResults }),

  recordSectionResult: (sectionId, totalQuestions, totalCorrect) =>
    set((state) => {
      const old = state.sectionProgress[sectionId] || { answered: 0, correct: 0 };
      return {
        sectionProgress: {
          ...state.sectionProgress,
          [sectionId]: {
            answered: old.answered + totalQuestions,
            correct: old.correct + totalCorrect,
          },
        },
      };
    }),
}));
