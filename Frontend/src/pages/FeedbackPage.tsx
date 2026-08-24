import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { generateLangFeedback, type SessionFeedback } from "../utils/api";
import boxImg from "../assets/box.png";
import Confetti from "../components/Confetti";
import { useStore } from "../store/useStore";

export default function FeedbackPage() {
  const navigate = useNavigate();
  const section = useStore((s) => s.section);
  const character = useStore((s) => s.character);
  const results = useStore((s) => s.lastResults);
  const studentId = useStore((s) => s.studentId);

  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<SessionFeedback | null>(null);
  const [typed, setTyped] = useState("");
  const [doneTyping, setDoneTyping] = useState(false);
  const [xpShown, setXpShown] = useState(0);
  const timerRef = useRef<number | null>(null);

  const totalCorrect = results?.totalCorrect ?? 0;
  const totalQuestions = results?.totalQuestions ?? 1;
  const pct = Math.round((totalCorrect / Math.max(1, totalQuestions)) * 100);

  function startTypewriter(text: string) {
    if (timerRef.current) window.window.clearInterval(timerRef.current!);
    setTyped("");
    setDoneTyping(false);
    let i = 0;
    timerRef.current = window.setInterval(() => {
      i += 2;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        window.clearInterval(timerRef.current!);
        timerRef.current = null;
        setDoneTyping(true);
      }
    }, 22);
  }

  function animateXp(target: number) {
    let current = 0;
    const step = Math.ceil(target / 30);
    const iv = window.setInterval(() => {
      current = Math.min(current + step, target);
      setXpShown(current);
      if (current >= target) clearInterval(iv);
    }, 40);
  }

  useEffect(() => {
    let cancelled = false;
    generateLangFeedback({
      character: character?.name || "Luna",
      totalCorrect,
      totalQuestions,
      targetLanguage: "fr",
      topic: results?.topic || section?.topic || section?.title || "French basics",
      attentionHistory: results?.attentionHistory ?? [],
      skillResults: results?.skillResults ?? {},
      studentId,
    })
      .then((data) => {
        if (!cancelled) {
          setFeedback(data);
          setLoading(false);
          startTypewriter(data.message || "Great job!");
          animateXp(data.xp_earned ?? totalCorrect * 25);
        }
      })
      .catch(() => {
        if (!cancelled) {
          const xp = totalCorrect * 25;
          setFeedback({
            message: `Magnifique! You scored ${totalCorrect}/${totalQuestions}! Keep going!`,
            skill_note: "Every word you learn is a step forward.",
            next_step: "Try 5 minutes of French tomorrow to lock in today's words.",
            xp_earned: xp,
            rating: pct >= 70 ? "good" : "keep_going",
            encouragement_quote: "Every expert was once a beginner.",
            review_skills: [],
          });
          setLoading(false);
          setDoneTyping(true);
          setTyped(`Magnifique! You scored ${totalCorrect}/${totalQuestions}! Keep going!`);
          setXpShown(xp);
        }
      });

    return () => {
      cancelled = true;
      if (timerRef.current) window.window.clearInterval(timerRef.current!);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!results || !section || !character) return <Navigate to="/" replace />;

  const ratingEmoji =
    feedback?.rating === "excellent" ? "🏆" : feedback?.rating === "good" ? "⭐" : "💪";

  return (
    <div className="min-h-screen text-slate-100 flex items-center justify-center">
      {pct >= 70 && <Confetti show />}
      <div className="max-w-2xl w-full mx-auto px-6 py-10">
        {loading ? (
          <div className="flex flex-col items-center py-20">
            <div className="pixel-heading text-xl">{character.name} is reviewing your results...</div>
            <div className="mt-4 h-2 w-48 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
              <div className="h-2 w-1/3 bg-[rgb(56,189,248)] animate-pulse" />
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Score card */}
            <div className="rounded-3xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(10,20,44,0.75)] shadow-xl p-8 text-center">
              <div aria-hidden="true" className="text-6xl">{ratingEmoji}</div>
              <div className="pixel-heading text-2xl mt-4">Quest Complete!</div>
              <div className="mt-2 text-slate-300/80">{section.title}</div>

              <div className="mt-6 flex justify-center gap-8">
                <div>
                  <div className="text-3xl font-bold text-[rgb(94,234,212)]">
                    {totalCorrect}/{totalQuestions}
                  </div>
                  <div className="text-xs text-slate-300/70 mt-1">Score</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-[rgb(250,204,21)]">+{xpShown}</div>
                  <div className="text-xs text-slate-300/70 mt-1">XP Earned</div>
                </div>
                <div>
                  <div className="text-3xl font-bold">{pct}%</div>
                  <div className="text-xs text-slate-300/70 mt-1">Accuracy</div>
                </div>
              </div>

              <div className="mt-6 h-3 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                <div
                  className="h-3 bg-gradient-to-r from-[rgb(56,189,248)] to-[rgb(94,234,212)] transition-all duration-1000"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Character feedback */}
            <div className="flex gap-4 items-start">
              <div className="shrink-0 hidden md:block">
                <img src={character.image} alt={character.name} className="w-24 h-24 object-contain rounded-2xl" />
              </div>
              <div
                className="flex-1 relative rounded-2xl border-2 border-[rgba(48,68,105,0.9)] overflow-hidden"
                style={{ backgroundImage: `url(${boxImg})`, backgroundSize: "cover", backgroundPosition: "center" }}
              >
                <div className="absolute inset-0 bg-[rgba(10,20,44,0.88)]" />
                <div className="relative p-6">
                  <div className="md:hidden flex items-center gap-3 mb-3">
                    <img src={character.image} alt={character.name} className="w-10 h-10 object-contain rounded-xl" />
                    <span className="font-semibold">{character.name}</span>
                  </div>
                  <div className="text-base text-slate-100/95 leading-relaxed">
                    {typed}
                    {!doneTyping && <span className="tw-caret" />}
                  </div>
                </div>
              </div>
            </div>

            {/* Skill Note */}
            {feedback?.skill_note && doneTyping && (
              <div className="rounded-2xl border-2 border-[rgba(232,121,249,0.35)] bg-[rgba(232,121,249,0.05)] p-5">
                <div className="font-semibold text-[rgb(232,121,249)]">🎯 Skill Note</div>
                <div className="mt-1 text-slate-200/90">{feedback.skill_note}</div>
              </div>
            )}

            {/* Next Step */}
            {feedback?.next_step && doneTyping && (
              <div className="rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-5">
                <div className="font-semibold text-[rgb(250,204,21)]">💡 Next Step</div>
                <div className="mt-1 text-slate-200/90">{feedback.next_step}</div>
              </div>
            )}

            {/* Review Skills */}
            {feedback?.review_skills && feedback.review_skills.length > 0 && doneTyping && (
              <div className="rounded-2xl border-2 border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.05)] p-5">
                <div className="font-semibold text-[rgb(56,189,248)]">🔄 Skills to Review</div>
                <div className="mt-2 flex gap-2 flex-wrap">
                  {feedback.review_skills.map((skill, i) => (
                    <span
                      key={i}
                      className="text-xs px-3 py-1 rounded-full border border-[rgba(56,189,248,0.4)] bg-[rgba(56,189,248,0.08)]"
                    >
                      {skill.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Encouragement Quote */}
            {feedback?.encouragement_quote && doneTyping && (
              <div className="text-center text-sm text-slate-300/70 italic mt-2">
                “{feedback.encouragement_quote}”
              </div>
            )}

            {/* Continue */}
            <div className="text-center">
              <button
                onClick={() => navigate("/roadmap")}
                className="px-8 py-3 rounded-xl bg-[rgb(94,234,212)] text-slate-900 font-semibold hover:brightness-110 transition shadow-lg"
              >
                Continue to Roadmap →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
