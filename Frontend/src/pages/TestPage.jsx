import { useEffect, useRef, useState } from "react";
import { generateLangQuestion, updateLangProgress, generateQuest } from "../utils/api";
import { useAttention } from "../engines/useAttention.js";

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// ── Varied fallback pool (quest-themed) ──────────────────────────────
const FALLBACK_POOL = [
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
  { question: 'Batman grabs a pen to write a note. What is "the pen" in French?', options: ["A) Le livre", "B) La porte", "C) Le stylo", "D) La table"], correct_index: 2, explanation: "'The pen' in French is 'Le stylo'.", skill_tag: "vocabulary_basic" },
  { question: 'Batman needs to get someone\'s attention. How do you say "Excuse me"?', options: ["A) Merci", "B) Excusez-moi", "C) Au revoir", "D) Bonjour"], correct_index: 1, explanation: "'Excuse me' in French is 'Excusez-moi'.", skill_tag: "social_phrases" },
  { question: 'Batman says goodnight before resting. What is "Good night" in French?', options: ["A) Bonsoir", "B) Bonjour", "C) Bonne nuit", "D) Salut"], correct_index: 2, explanation: "'Good night' in French is 'Bonne nuit'.", skill_tag: "social_phrases" },
];
let _fallbackIdx = 0;
function getNextFallback(questStep) {
  const fb = { ...FALLBACK_POOL[_fallbackIdx % FALLBACK_POOL.length] };
  _fallbackIdx++;
  // Inject quest scene if available
  if (questStep?.scene) {
    fb.question = questStep.scene + " " + fb.question;
  }
  fb.exercise_type = "multiple_choice_vocab";
  fb.hints = ["Think about common French words.", "Look at the first letter of each option."];
  return fb;
}

export default function TestPage({ section, character, targetLanguage = "fr", totalQuestions: TOTAL = 10, onFinish, onBack }) {
  const [qNum, setQNum] = useState(0); // 0 = loading first
  const [mcq, setMcq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [locked, setLocked] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [hintIdx, setHintIdx] = useState(0);
  const [showHint, setShowHint] = useState(false);

  // Quest state
  const [quest, setQuest] = useState(null);
  const [, setQuestLoading] = useState(true);

  // Typewriter
  const [typed, setTyped] = useState("");
  const typingRef = useRef(null);

  // Eye tracking + attention fusion
  const {
    eyeActive, eyeMetrics, attentionState: fusedAttention,
    computeAttention, startEyeTracking,
  } = useAttention();

  // Stats
  const [difficulty, setDifficulty] = useState(2);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [retries, setRetries] = useState(0);
  const [attentionState, setAttentionState] = useState("Focused");
  const [attentionHistory, setAttentionHistory] = useState([]);
  const [prevQuestions, setPrevQuestions] = useState([]);
  const [skillResults, setSkillResults] = useState({});
  const [sessionFatigue, setSessionFatigue] = useState(0);
  const recentErrorsRef = useRef(0);

  // Timers
  const startRef = useRef(Date.now());
  const idleRef = useRef(null);
  const [idleTime, setIdleTime] = useState(0);

  const accuracy = qNum > 0 ? totalCorrect / qNum : 0;

  // Current quest step for this question number
  const currentQuestStep = quest?.steps?.[qNum] || quest?.steps?.[qNum % (quest?.steps?.length || 1)] || null;

  const resetTimers = () => {
    startRef.current = Date.now();
    setIdleTime(0);
    if (idleRef.current) clearInterval(idleRef.current);
    idleRef.current = setInterval(() => setIdleTime((t) => t + 1), 1000);
  };

  const startTypewriter = (text) => {
    if (typingRef.current) clearInterval(typingRef.current);
    setTyped("");
    let i = 0;
    typingRef.current = setInterval(() => {
      i += 2;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(typingRef.current);
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

    // Get the quest step for this question
    const stepForQ = quest?.steps?.[qNum] || null;

    try {
      const data = await generateLangQuestion({
        character: character?.name || character || "Dragon",
        topic: section.topic,
        targetLanguage,
        difficulty: diff,
        attentionState,
        attentionConfidence: 0.5,
        eyeMetrics,
        recentStates: attentionHistory.slice(-5),
        lastCorrect: qNum > 0 ? (totalCorrect > 0) : null,
        lastRt: null,
        sessionAccuracy: accuracy,
        previousQuestions: prevQuestions.slice(-5),
        questionNumber: qNum + 1,
        totalQuestions: TOTAL,
        skillFocus: section.skill_focus || "vocabulary_basic",
        exerciseType: null,
        learnerAge: 12,
        studentId: "default",
        sessionFatigue,
        questStep: stepForQ,
      });
      setMcq(data);
      resetTimers();
      startTypewriter(data?.question || "");
    } catch {
      // Varied fallback — never the same question twice in a row
      const fb = getNextFallback(stepForQ);
      setMcq(fb);
      resetTimers();
      startTypewriter(fb.question);
    } finally {
      setLoading(false);
    }
  };

  // Auto-start eye tracking
  useEffect(() => { startEyeTracking(); }, [startEyeTracking]);

  // Generate quest on mount, then load first question
  useEffect(() => {
    let cancelled = false;
    setQuestLoading(true);

    generateQuest({
      character: character?.name || character || "Dragon",
      topic: section.topic,
      targetLanguage,
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
      if (idleRef.current) clearInterval(idleRef.current);
      if (typingRef.current) clearInterval(typingRef.current);
    };
  }, []);

  const submit = () => {
    if (!mcq || selected === null || locked) return;
    const rt = (Date.now() - startRef.current) / 1000;
    const ci = mcq.correctIndex ?? mcq.correct_index ?? 0;
    const correct = selected === ci;

    // Track error burst for fusion
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

    // Track skill results for feedback
    const skillTag = mcq?.skill_tag || section.skill_focus || "vocabulary_basic";
    setSkillResults((prev) => {
      const old = prev[skillTag] || { correct: 0, total: 0 };
      return { ...prev, [skillTag]: { correct: old.correct + (correct ? 1 : 0), total: old.total + 1 } };
    });

    // Update fatigue (rises per question)
    setSessionFatigue((f) => Math.min(1, f + 0.08));

    // Update backend progress
    updateLangProgress({
      studentId: "default",
      skillTag,
      correct,
      responseTime: rt,
      attentionState: state,
      xpEarned: correct ? 25 : 5,
      exerciseType: mcq?.exercise_type || "multiple_choice_vocab",
      targetLanguage,
      sectionId: section.id,
    }).catch(() => {});
  };

  const next = () => {
    if (qNum >= TOTAL) {
      // Build skill accuracy map for feedback
      const skillAccuracyMap = {};
      Object.entries(skillResults).forEach(([tag, { correct: c, total: t }]) => {
        skillAccuracyMap[tag] = t > 0 ? c / t : 0;
      });
      onFinish({ totalCorrect, totalQuestions: TOTAL, attentionHistory, skillResults: skillAccuracyMap, topic: section.topic });
      return;
    }
    loadQuestion(difficulty);
  };

  const optionStyle = (idx) => {
    if (!locked) {
      return idx === selected
        ? "border-[rgba(56,189,248,0.75)] bg-[rgba(56,189,248,0.12)]"
        : "border-[rgba(48,68,105,0.9)] bg-[rgba(10,20,44,0.65)] hover:bg-[rgba(13,26,58,0.85)]";
    }
    if (idx === mcq?.correct_index) return "border-[rgba(52,211,153,0.75)] bg-[rgba(52,211,153,0.10)]";
    if (idx === selected && selected !== mcq?.correct_index) return "border-[rgba(251,113,133,0.75)] bg-[rgba(251,113,133,0.10)]";
    return "border-[rgba(48,68,105,0.9)] bg-[rgba(10,20,44,0.60)] opacity-80";
  };

  return (
    <div className="min-h-screen text-slate-100">
      {/* Top bar */}
        <div className="sticky top-0 z-50 backdrop-blur-md border-b border-white/[0.06] bg-[rgba(15,23,42,0.82)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={onBack} className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] hover:bg-[rgba(13,26,58,0.85)] transition text-sm">
            ← Roadmap
          </button>
          <div className="flex items-center gap-4">
            {/* Eye tracking indicator */}
            <span className={`inline-block h-2 w-2 rounded-full ${eyeActive ? "bg-[rgb(52,211,153)] animate-pulse" : "bg-[rgb(100,116,139)]"}`} />
            <span className="text-xs text-slate-300/80">
              {eyeActive ? `👁 ${fusedAttention.state}` : "Eye: Off"}
            </span>
            <img src={character.image} alt={character.name} className="w-8 h-8 object-contain rounded-lg" />
            <span className="text-sm">{Math.min(qNum, TOTAL)}/{TOTAL}</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Quest Header */}
        {quest && (
          <div className="mb-6 rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚔️</span>
              <div>
                <div className="pixel-heading text-lg text-[rgb(250,204,21)]">{quest.quest_title}</div>
                {qNum === 0 && !locked && (
                  <div className="mt-1 text-sm text-slate-200/80">{quest.quest_intro}</div>
                )}
              </div>
            </div>
            {/* Current quest step scene */}
            {currentQuestStep && (
              <div className="mt-3 flex items-start gap-3 p-3 rounded-xl bg-[rgba(15,23,42,0.55)] border border-[rgba(48,68,105,0.6)]">
                <span className="text-lg">📍</span>
                <div>
                  <div className="text-sm font-semibold text-[rgb(94,234,212)]">
                    Step {currentQuestStep.step_number || (qNum + 1)} — {currentQuestStep.location}
                  </div>
                  <div className="mt-1 text-sm text-slate-200/80">{currentQuestStep.scene}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-[rgb(56,189,248)] to-[rgb(94,234,212)] transition-all" style={{ width: `${(Math.min(qNum, TOTAL) / TOTAL) * 100}%` }} />
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
                    {typed?.length < (mcq?.question?.length || 0) && (
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
                        {hintIdx === 1 ? (mcq.hints.hint_1 || mcq.hints[0]) : (mcq.hints.hint_2 || mcq.hints[1])}
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
                            onClick={() => { setHintIdx((h) => h + 1); setShowHint(true); }}
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
                      {/* Correct/Wrong + Dopamine reward */}
                      <div className="rounded-2xl border-2 border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.05)] p-5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold">
                            {selected === (mcq?.correctIndex ?? mcq?.correct_index ?? 0) ? "✅ Correct!" : "Try again next time!"}
                          </span>
                          <span className="text-sm text-slate-300/80">
                            Answer: {String.fromCharCode(65 + (mcq?.correctIndex ?? mcq?.correct_index ?? 0))}
                          </span>
                        </div>
                        {selected === (mcq?.correctIndex ?? mcq?.correct_index ?? 0) && mcq?.dopamine_reward && (
                          <div className="mt-2 text-lg font-bold text-[rgb(250,204,21)]">{mcq.dopamine_reward}</div>
                        )}
                        <div className="mt-2 text-slate-200/90 leading-relaxed">
                          {mcq.explanation || ""}
                        </div>
                      </div>

                      {/* Grammar Explanation */}
                      {mcq?.grammar_explanation && (
                        <div className="rounded-2xl border-2 border-[rgba(232,121,249,0.35)] bg-[rgba(232,121,249,0.05)] p-4">
                          <div className="text-sm font-semibold text-[rgb(232,121,249)]">📝 Grammar Note</div>
                          <div className="mt-1 text-slate-200/90">{mcq.grammar_explanation}</div>
                        </div>
                      )}

                      {/* Visual Breakdown */}
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
    </div>
  );
}
