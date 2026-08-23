import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  generateLangQuestion,
  updateLangProgress,
  generateQuest,
  setResearchConsent,
  submitAttentionLabel,
  type Quest,
  type QuestionPacket,
} from "../utils/api";
import { useAttention } from "../engines/useAttention";
import PixelSettingsModal, { type PixelSettings } from "../components/PixelSettingsModal";
import { useStore } from "../store/useStore";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

// ── Varied fallback pool (quest-themed) ──────────────────────────────
interface FallbackQ {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  skill_tag: string;
}

const FALLBACK_POOL: FallbackQ[] = [
  { question: 'Batman arrives at the airport! How do you say "Hello" in French?', options: ["A) Bonjour", "B) Merci", "C) Au revoir", "D) Oui"], correct_index: 0, explanation: "'Hello' in French is 'Bonjour'.", skill_tag: "social_phrases" },
  { question: 'Batman needs to thank a local for the tip. How do you say "Thank you"?', options: ["A) Non", "B) Merci", "C) Bonjour", "D) Salut"], correct_index: 1, explanation: "'Thank you' in French is 'Merci'.", skill_tag: "social_phrases" },
  { question: 'Batman must say goodbye to his informant. How do you say "Goodbye"?', options: ["A) Bonjour", "B) S'il vous plaît", "C) Au revoir", "D) Merci"], correct_index: 2, explanation: "'Goodbye' in French is 'Au revoir'.", skill_tag: "social_phrases" },
  { question: 'Batman enters a café and needs to say "Please". What is it in French?', options: ["A) Merci", "B) Excusez-moi", "C) Bonjour", "D) S'il vous plaît"], correct_index: 3, explanation: "'Please' in French is 'S'il vous plaît'.", skill_tag: "social_phrases" },
  { question: 'Batman must confirm something. How do you say "Yes" in French?', options: ["A) Oui", "B) Non", "C) Peut-être", "D) Merci"], correct_index: 0, explanation: "'Yes' in French is 'Oui'.", skill_tag: "vocabulary_basic" },
  { question: 'Batman refuses a trap! How do you say "No" in French?', options: ["A) Oui", "B) Merci", "C) Non", "D) Bonjour"], correct_index: 2, explanation: "'No' in French is 'Non'.", skill_tag: "vocabulary_basic" },
  { question: 'Batman arrives at night. How do you say "Good evening" in French?', options: ["A) Bonjour", "B) Bonsoir", "C) Bonne nuit", "D) Salut"], correct_index: 1, explanation: "'Good evening' in French is 'Bonsoir'.", skill_tag: "social_phrases" },
  { question: 'Batman checks into a hotel. How do you say "My name is" in French?', options: ["A) Comment allez-vous", "B) Merci beaucoup", "C) Je m'appelle", "D) S'il vous plaît"], correct_index: 2, explanation: "'My name is' in French is 'Je m'appelle'.", skill_tag: "social_phrases" },
  { question: 'Batman needs to ask someone how they are. What\'s "How are you?" in French?', options: ["A) Je m'appelle", "B) Comment allez-vous?", "C) Merci", "D) Au revoir"], correct_index: 1, explanation: "'How are you?' in French is 'Comment allez-vous?'.", skill_tag: "social_phrases" },
  { question: 'Batman finds a clue near a book. What is "the book" in French?', options: ["A) La table", "B) Le stylo", "C) Le livre", "D) La porte"], correct_index: 2, explanation: "'The book' in French is 'Le livre'.", skill_tag: "vocabulary_basic" },
  { question: 'Batman needs water after the chase. What is "water" in French?', options: ["A) Le café", "B) Le pain", "C) Le fromage", "D) L'eau"], correct_index: 3, explanation: "'Water' in French is 'L'eau'.", skill_tag: "vocabulary_basic" },
  { question: 'Batman orders at the bakery to blend in. What is "bread" in French?', options: ["A) Le pain", "B) Le fromage", "C) L'eau", "D) Le café"], correct_index: 0, explanation: "'Bread' in French is 'Le pain'.", skill_tag: "vocabulary_basic" },
];

let _fallbackIdx = 0;
function getNextFallback(questStep: { scene?: string } | null): QuestionPacket & { hints: string[]; exercise_type: string } {
  const fb: FallbackQ & Record<string, unknown> = { ...FALLBACK_POOL[_fallbackIdx % FALLBACK_POOL.length] };
  _fallbackIdx++;
  if (questStep?.scene) {
    fb.question = questStep.scene + " " + fb.question;
  }
  return {
    ...(fb as unknown as QuestionPacket),
    exercise_type: "multiple_choice_vocab",
    hints: ["Think about common French words.", "Look at the first letter of each option."],
  };
}

export default function TestPage() {
  const navigate = useNavigate();
  const section = useStore((s) => s.section);
  const character = useStore((s) => s.character);
  const studentId = useStore((s) => s.studentId);
  const setLastResults = useStore((s) => s.setLastResults);
  const recordSectionResult = useStore((s) => s.recordSectionResult);

  const [qNum, setQNum] = useState(0); // 0 = loading first
  const [mcq, setMcq] = useState<QuestionPacket | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<PixelSettings>({
    sound: true,
    calm: false,
    autoCalm: true,
    sprintSeconds: 60,
  });

  // Quest state
  const [quest, setQuest] = useState<Quest | null>(null);
  const [, setQuestLoading] = useState(true);

  // Typewriter
  const [typed, setTyped] = useState("");
  const typingRef = useRef<number | null>(null);

  // Eye tracking + attention fusion (opt-in Focus Sensor)
  const {
    eyeActive,
    eyeMetrics,
    attentionState: fusedAttention,
    computeAttention,
    startEyeTracking,
  } = useAttention();
  const [sensorStarting, setSensorStarting] = useState(false);
  const [sensorError, setSensorError] = useState(false);

  const enableSensor = async () => {
    setSensorStarting(true);
    setSensorError(false);
    const ok = await startEyeTracking();
    setSensorStarting(false);
    if (!ok) setSensorError(true);
  };

  // Stats
  const [difficulty, setDifficulty] = useState(2);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [retries, setRetries] = useState(0);
  const [attentionState, setAttentionState] = useState("Focused");
  const [attentionHistory, setAttentionHistory] = useState<string[]>([]);
  const [prevQuestions, setPrevQuestions] = useState<string[]>([]);
  const [skillResults, setSkillResults] = useState<Record<string, { correct: number; total: number }>>({});
  const [sessionFatigue, setSessionFatigue] = useState(0);
  const recentErrorsRef = useRef(0);

  // Timers
  const startRef = useRef(Date.now());
  const idleRef = useRef<number | null>(null);
  const [idleTime, setIdleTime] = useState(0);

  const TOTAL = section?.isFinalBoss ? 5 : 10;
  const accuracy = qNum > 0 ? totalCorrect / qNum : 0;

  // Current quest step for this question number
  const currentQuestStep =
    quest?.steps?.[qNum] || quest?.steps?.[qNum % (quest?.steps?.length || 1)] || null;

  const resetTimers = () => {
    startRef.current = Date.now();
    setIdleTime(0);
    if (idleRef.current) window.clearInterval(idleRef.current);
    idleRef.current = window.setInterval(() => setIdleTime((t) => t + 1), 1000);
  };

  const startTypewriter = (text: string) => {
    if (typingRef.current) window.clearInterval(typingRef.current!);
    setTyped("");
    let i = 0;
    typingRef.current = window.setInterval(() => {
      i += 2;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(typingRef.current!);
        typingRef.current = null;
      }
    }, 14);
  };

  const loadQuestion = async (diff = difficulty) => {
    setLoading(true);
    setSelected(null);
    setLocked(false);
    setShowExplain(false);
    setShowHint(false);
    setHintIdx(0);

    const stepForQ = quest?.steps?.[qNum] || null;

    try {
      const data = await generateLangQuestion({
        character: character?.name || "Dragon",
        topic: section?.topic || "French basics",
        targetLanguage: "fr",
        difficulty: diff,
        attentionState,
        attentionConfidence: fusedAttention.confidence,
        eyeMetrics,
        recentStates: attentionHistory.slice(-5),
        lastCorrect: qNum > 0 ? totalCorrect > 0 : null,
        lastRt: null,
        sessionAccuracy: accuracy,
        previousQuestions: prevQuestions.slice(-5),
        questionNumber: qNum + 1,
        totalQuestions: TOTAL,
        skillFocus: section?.skill_focus || "vocabulary_basic",
        exerciseType: null,
        learnerAge: 12,
        studentId,
        sessionFatigue,
        questStep: stepForQ,
      });
      setMcq(data);
      resetTimers();
      startTypewriter(data?.question || "");
    } catch {
      const fb = getNextFallback(stepForQ);
      setMcq(fb);
      resetTimers();
      startTypewriter(fb.question);
    } finally {
      setLoading(false);
    }
  };

  // Generate quest on mount, then load first question
  useEffect(() => {
    let cancelled = false;
    setQuestLoading(true);

    generateQuest({
      character: character?.name || "Dragon",
      topic: section?.topic || "French basics",
      targetLanguage: "fr",
      totalQuestions: TOTAL,
      learnerAge: 12,
    })
      .then((data) => {
        if (!cancelled) {
          setQuest(data);
          setQuestLoading(false);
          loadQuestion();
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuestLoading(false);
          loadQuestion();
        }
      });

    return () => {
      cancelled = true;
      if (idleRef.current) window.clearInterval(idleRef.current);
      if (typingRef.current) window.clearInterval(typingRef.current!);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (!mcq || selected === null || locked) return;
    const rt = (Date.now() - startRef.current) / 1000;
    const ci = mcq.correctIndex ?? mcq.correct_index ?? 0;
    const correct = selected === ci;

    if (!correct) recentErrorsRef.current++;
    else recentErrorsRef.current = Math.max(0, recentErrorsRef.current - 1);

    const result = computeAttention({
      responseTime: rt,
      correct,
      retries,
      recentErrors: recentErrorsRef.current,
      idleTime,
    });
    const state = result.state;

    // Auto-calm when struggling (ADHD support)
    if (settings.autoCalm && (state === "Overwhelmed" || state === "Drifting") && !settings.calm) {
      setSettings((s) => ({ ...s, calm: true }));
      document.body.classList.add("calm");
    }

    setAttentionState(state);
    setAttentionHistory((h) => [...h, state]);
    setLocked(true);
    setShowExplain(true);

    const newQ = qNum + 1;
    setQNum(newQ);
    if (correct) {
      setTotalCorrect((c) => c + 1);
      setStreak((s) => s + 1);
    } else {
      setStreak(0);
      setRetries((r) => r + 1);
    }

    // Adaptive difficulty
    if (state === "Focused" && correct) setDifficulty((d) => clamp(d + 1, 1, 5));
    else if (state === "Overwhelmed") setDifficulty((d) => clamp(d - 1, 1, 5));
    else if (state === "Drifting") setDifficulty((d) => clamp(d - 1, 1, 5));

    setPrevQuestions((p) => [...p, mcq.question]);

    const skillTag = mcq?.skill_tag || section?.skill_focus || "vocabulary_basic";
    setSkillResults((prev) => {
      const old = prev[skillTag] || { correct: 0, total: 0 };
      return {
        ...prev,
        [skillTag]: { correct: old.correct + (correct ? 1 : 0), total: old.total + 1 },
      };
    });

    setSessionFatigue((f) => Math.min(1, f + 0.08));

    updateLangProgress({
      studentId,
      skillTag,
      correct,
      responseTime: rt,
      attentionState: state,
      xpEarned: correct ? 25 : 5,
      exerciseType: mcq?.exercise_type || "multiple_choice_vocab",
      targetLanguage: "fr",
      sectionId: section?.id || "default_section",
    }).catch(() => {});

    // Dataset: schedule a self-report prompt every 3rd question
    if (researchChoice === "accepted" && newQ % 3 === 0 && newQ < TOTAL) {
      labelDueRef.current = {
        section_id: section?.id || "default_section",
        question_number: newQ,
        detected_state: state,
        detected_confidence: result.confidence ?? 0.5,
      };
    }
  };

  // ── Research Mode (anonymous dataset contribution) ──
  const RESEARCH_KEY = "nl_research_consent";
  const [researchChoice, setResearchChoice] = useState<string | null>(() =>
    localStorage.getItem(RESEARCH_KEY)
  );
  const [showConsent, setShowConsent] = useState(() => !localStorage.getItem(RESEARCH_KEY));
  const [pendingLabel, setPendingLabel] = useState(false);
  const labelDueRef = useRef<{ section_id: string; question_number: number; detected_state: string; detected_confidence: number } | null>(null);
  const proceedRef = useRef<(() => void) | null>(null);

  const next = () => {
    const proceed = () => {
      if (qNum >= TOTAL) {
        // Build skill accuracy map for feedback
        const skillAccuracyMap: Record<string, number> = {};
        Object.entries(skillResults).forEach(([tag, { correct: c, total: t }]) => {
          skillAccuracyMap[tag] = t > 0 ? c / t : 0;
        });
        const results = {
          totalCorrect,
          totalQuestions: TOTAL,
          attentionHistory,
          skillResults: skillAccuracyMap,
          topic: section?.topic,
        };
        recordSectionResult(section?.id || "default_section", TOTAL, totalCorrect);
        setLastResults(results);
        navigate("/feedback");
        return;
      }
      loadQuestion(difficulty);
    };
    // Pause the loop when a self-report prompt is due
    if (researchChoice === "accepted" && labelDueRef.current) {
      proceedRef.current = proceed;
      setPendingLabel(true);
      return;
    }
    proceed();
  };

  const acceptResearch = () => {
    localStorage.setItem(RESEARCH_KEY, "accepted");
    setResearchChoice("accepted");
    setShowConsent(false);
    setResearchConsent({ studentId, accepted: true }).catch(() => {});
  };

  const declineResearch = () => {
    localStorage.setItem(RESEARCH_KEY, "declined");
    setResearchChoice("declined");
    setShowConsent(false);
    setResearchConsent({ studentId, accepted: false }).catch(() => {});
  };

  const finishLabel = (reportedState: string | null) => {
    const due = labelDueRef.current;
    if (due && reportedState) {
      submitAttentionLabel({
        studentId,
        sectionId: due.section_id,
        questionNumber: due.question_number,
        reportedState,
        detectedState: due.detected_state,
        detectedConfidence: due.detected_confidence,
      }).catch(() => {});
    }
    labelDueRef.current = null;
    setPendingLabel(false);
    const p = proceedRef.current;
    proceedRef.current = null;
    if (p) p();
  };

  if (!section || !character) return <Navigate to="/" replace />;

  const optionStyle = (idx: number): string => {
    if (!locked) {
      return idx === selected
        ? "border-[rgba(56,189,248,0.75)] bg-[rgba(56,189,248,0.12)]"
        : "border-[rgba(48,68,105,0.9)] bg-[rgba(10,20,44,0.65)] hover:bg-[rgba(13,26,58,0.85)]";
    }
    if (idx === (mcq?.correctIndex ?? mcq?.correct_index))
      return "border-[rgba(52,211,153,0.75)] bg-[rgba(52,211,153,0.10)]";
    if (idx === selected && selected !== (mcq?.correctIndex ?? mcq?.correct_index))
      return "border-[rgba(251,113,133,0.75)] bg-[rgba(251,113,133,0.10)]";
    return "border-[rgba(48,68,105,0.9)] bg-[rgba(10,20,44,0.60)] opacity-80";
  };

  return (
    <div className="min-h-screen text-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-50 backdrop-blur-md border-b border-white/[0.06] bg-[rgba(15,23,42,0.82)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/roadmap")}
            className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] hover:bg-[rgba(13,26,58,0.85)] transition text-sm"
          >
            ← Roadmap
          </button>
          <div className="flex items-center gap-3">
            {/* Focus Sensor (opt-in) */}
            {!eyeActive ? (
              <button
                onClick={enableSensor}
                disabled={sensorStarting}
                title="Optional webcam attention tracking — all processing stays on your device"
                className="px-3 py-1.5 rounded-lg border border-[rgba(94,234,212,0.35)] bg-[rgba(94,234,212,0.06)] hover:bg-[rgba(94,234,212,0.14)] transition text-xs"
              >
                {sensorStarting ? "⏳ Starting…" : "👁 Enable Focus Sensor"}
              </button>
            ) : (
              <span className="flex items-center gap-2 text-xs">
                <span className={`inline-block h-2 w-2 rounded-full ${eyeActive ? "bg-[rgb(52,211,153)] animate-pulse" : ""}`} />
                👁 {fusedAttention.state}
              </span>
            )}
            {sensorError && (
              <span className="text-xs text-slate-400/70" role="status">camera unavailable</span>
            )}
            <img src={character.image} alt={character.name} className="w-8 h-8 object-contain rounded-lg" />
            <span className="text-sm">{Math.min(qNum, TOTAL)}/{TOTAL}</span>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition"
              aria-label="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Quest Header */}
        {quest && (
          <div className="mb-6 rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-5">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="text-2xl">⚔️</span>
              <div>
                <div className="pixel-heading text-lg text-[rgb(250,204,21)]">{quest.quest_title}</div>
                {qNum === 0 && !locked && (
                  <div className="mt-1 text-sm text-slate-200/80">{quest.quest_intro}</div>
                )}
              </div>
            </div>
            {currentQuestStep && (
              <div className="mt-3 flex items-start gap-3 p-3 rounded-xl bg-[rgba(15,23,42,0.55)] border border-[rgba(48,68,105,0.6)]">
                <span aria-hidden="true" className="text-lg">📍</span>
                <div>
                  <div className="text-sm font-semibold text-[rgb(94,234,212)]">
                    Step {currentQuestStep.step_number || qNum + 1} — {currentQuestStep.location}
                  </div>
                  <div className="mt-1 text-sm text-slate-200/80">{currentQuestStep.scene}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
          <div
            className="h-2 bg-gradient-to-r from-[rgb(56,189,248)] to-[rgb(94,234,212)] transition-all"
            style={{ width: `${(Math.min(qNum, TOTAL) / TOTAL) * 100}%` }}
          />
        </div>

        <div className="mt-8">
          <div className="rounded-3xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(10,20,44,0.75)] shadow-xl overflow-hidden">
            {/* Header */}
            <div className="p-6 bg-gradient-to-br from-[rgba(56,189,248,0.12)] to-transparent border-b border-[rgba(48,68,105,0.6)]">
              <div className="pixel-heading text-xl">{section.title}</div>
              <div className="mt-2 text-sm text-slate-300/80">
                Question {Math.min(qNum + (locked ? 0 : 1), TOTAL)} of {TOTAL} • Difficulty {difficulty}/5
              </div>
            </div>

            {/* Body */}
            <div className="p-6 md:p-8">
              {loading ? (
                <div className="py-10">
                  <div className="text-sm text-slate-200/90">Generating quest challenge...</div>
                  <div className="mt-3 h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                    <div className="h-2 w-1/3 bg-[rgb(56,189,248)] animate-pulse" />
                  </div>
                </div>
              ) : (
                <>
                  {/* Question */}
                  <div className="text-xl md:text-2xl font-bold text-slate-100 leading-relaxed">
                    {typed}
                    {typed.length < (mcq?.question?.length || 0) && (
                      <span className="inline-block w-[10px] ml-1 animate-pulse">▍</span>
                    )}
                  </div>

                  {/* Options */}
                  <div className="mt-6 grid grid-cols-1 gap-3">
                    {(mcq?.options ?? []).map((opt, idx) => (
                      <button
                        key={idx}
                        onClick={() => !locked && setSelected(idx)}
                        className={`text-left rounded-2xl border-2 p-4 transition ${optionStyle(idx)}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="h-9 w-9 rounded-xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(13,26,58,0.55)] flex items-center justify-center text-sm font-bold shrink-0">
                            {String.fromCharCode(65 + idx)}
                          </div>
                          <div className="text-base text-slate-100 leading-relaxed">{opt}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Hints */}
                  {showHint && mcq?.hints && (
                    <div className="mt-4 rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-4">
                      <div className="text-sm text-[rgb(250,204,21)] font-semibold">Hint {hintIdx}</div>
                      <div className="mt-1 text-slate-200/90">
                        {Array.isArray(mcq.hints)
                          ? hintIdx === 1
                            ? mcq.hints[1]
                            : mcq.hints[0]
                          : hintIdx === 1
                            ? mcq.hints.hint_1
                            : mcq.hints.hint_2}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-6 flex gap-3 flex-wrap items-center">
                    {!locked ? (
                      <>
                        <button
                          className="btn-pixel px-6 py-3 rounded-xl disabled:opacity-50"
                          onClick={submit}
                          disabled={selected === null}
                        >
                          Submit
                        </button>
                        {mcq?.hints && hintIdx < 2 && (
                          <button
                            onClick={() => {
                              setHintIdx((h) => h + 1);
                              setShowHint(true);
                            }}
                            className="px-5 py-3 rounded-xl border-2 border-[rgba(250,204,21,0.4)] bg-[rgba(250,204,21,0.06)] hover:bg-[rgba(250,204,21,0.12)] transition text-sm"
                          >
                            💡 Hint
                          </button>
                        )}
                      </>
                    ) : (
                      <button className="btn-pixel px-6 py-3 rounded-xl" onClick={next}>
                        {qNum >= TOTAL ? "See Results" : "Next →"}
                      </button>
                    )}
                  </div>

                  {/* Explanation */}
                  {showExplain && (
                    <div className="mt-6 space-y-3">
                      <div className="rounded-2xl border-2 border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.05)] p-5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">
                            {selected === (mcq?.correctIndex ?? mcq?.correct_index ?? 0)
                              ? "✅ Correct!"
                              : "Try again next time!"}
                          </span>
                          <span className="text-sm text-slate-300/80">
                            Answer: {String.fromCharCode(65 + (mcq?.correctIndex ?? mcq?.correct_index ?? 0))}
                          </span>
                        </div>
                        {selected === (mcq?.correctIndex ?? mcq?.correct_index ?? 0) &&
                          mcq?.dopamine_reward && (
                            <div className="mt-2 text-lg font-bold text-[rgb(250,204,21)]">
                              {mcq.dopamine_reward}
                            </div>
                          )}
                        <div className="mt-2 text-slate-200/90 leading-relaxed">{mcq?.explanation ?? ""}</div>
                      </div>

                      {mcq?.grammar_explanation && (
                        <div className="rounded-2xl border-2 border-[rgba(232,121,249,0.35)] bg-[rgba(232,121,249,0.05)] p-4">
                          <div className="text-sm font-semibold text-[rgb(232,121,249)]">📝 Grammar Note</div>
                          <div className="mt-1 text-slate-200/90">{mcq.grammar_explanation}</div>
                        </div>
                      )}

                      {mcq?.visual_breakdown && (
                        <div className="rounded-2xl border-2 border-[rgba(94,234,212,0.35)] bg-[rgba(94,234,212,0.05)] p-4">
                          <div className="text-sm font-semibold text-[rgb(94,234,212)]">🔍 Pattern</div>
                          <div className="mt-1 text-lg text-slate-100">{mcq.visual_breakdown}</div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="mt-6 flex gap-3 flex-wrap">
          <div className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] text-sm">
            Score: {totalCorrect}/{qNum}
          </div>
          <div className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] text-sm">
            Streak: {streak} 🔥
          </div>
          <div className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] text-sm">
            XP: {totalCorrect * 20}
          </div>
        </div>
      </div>

      {/* Research consent modal */}
      {showConsent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-label="Research mode consent">
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-md rounded-3xl border-2 border-[rgba(56,189,248,0.4)] bg-[rgb(10,20,44)] p-6 shadow-2xl">
            <div className="pixel-heading text-lg text-[rgb(94,234,212)]">🧠 Help improve NeuroLearn</div>
            <p className="mt-3 text-sm text-slate-200/85 leading-relaxed">
              With your OK, we save <span className="font-semibold">anonymous</span> answers, timing
              and eye-metrics during quests — plus quick “how did that feel?” taps. This trains the
              attention models. No sign-up, no personal info, opt out anytime.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={acceptResearch} className="btn-pixel flex-1 px-4 py-3 rounded-xl">
                Join Research Mode
              </button>
              <button
                onClick={declineResearch}
                className="px-4 py-3 rounded-xl border border-[rgba(48,68,105,0.9)] bg-[rgba(13,26,58,0.55)] hover:bg-[rgba(13,26,58,0.85)] transition text-sm"
              >
                No thanks
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Self-report attention chip */}
      {pendingLabel && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[55] w-full max-w-xl px-4">
          <div className="rounded-2xl border-2 border-[rgba(250,204,21,0.45)] bg-[rgba(10,20,44,0.95)] p-4 shadow-2xl">
            <div className="text-sm font-semibold text-[rgb(250,204,21)]">
              How did that feel while answering?
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[["Focused", "🎯"], ["Drifting", "🌊"], ["Impulsive", "😤"], ["Overwhelmed", "🌋"]].map(
                ([s, e]) => (
                  <button
                    key={s}
                    onClick={() => finishLabel(s)}
                    className="rounded-xl border border-[rgba(48,68,105,0.9)] bg-[rgba(13,26,58,0.6)] hover:bg-[rgba(56,189,248,0.15)] transition px-2 py-2 text-xs"
                  >
                    <span className="mr-1" aria-hidden="true">{e}</span>
                    {s}
                  </button>
                )
              )}
            </div>
            <button
              onClick={() => finishLabel(null)}
              className="mt-2 text-xs text-slate-400 hover:text-slate-200"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      <PixelSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        setSettings={setSettings}
      />
    </div>
  );
}
