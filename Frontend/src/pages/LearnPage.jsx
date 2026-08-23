import { useEffect, useRef, useState } from "react";
import { generateLangStory } from "../utils/api";
import boxImg from "../assets/box.png";

export default function LearnPage({ section, character, targetLanguage = "fr", onGoTest, onBack }) {
  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState(null);
  const [typed, setTyped] = useState("");
  const [doneTyping, setDoneTyping] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const timerRef = useRef(null);

  function startTypewriter(text) {
    if (timerRef.current) clearInterval(timerRef.current);
    setTyped("");
    setDoneTyping(false);
    let i = 0;
    timerRef.current = setInterval(() => {
      i += 2;
      setTyped(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setDoneTyping(true);
      }
    }, 18);
  }

  useEffect(() => {
    let cancelled = false;

    generateLangStory({
      character: character.name,
      topic: section.topic,
      targetLanguage,
      difficulty: 1,
      learnerAge: 12,
    })
      .then((data) => {
        if (!cancelled) {
          setStory(data);
          setLoading(false);
          startTypewriter(data.story || "");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStory({
            title: `${character.name}'s French Quest`,
            story: `${character.name} is ready to teach you ${section.title} in French! Let's dive in.`,
            key_words: [{ word: "Bonjour", meaning: "Hello", pronunciation: "bon-ZHOOR", example: "Bonjour, comment allez-vous?" }],
            comprehension_question: `What does ${section.title} cover?`,
            comprehension_answer: section.topic,
            language_tip: "Practice saying each word out loud!",
          });
          setLoading(false);
          setDoneTyping(true);
          setTyped(`${character.name} is ready to teach you ${section.title} in French! Let's dive in.`);
        }
      });

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
      speechSynthesis.cancel();
    };
  }, [section.id]);

  const skipTypewriter = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setTyped(story?.story || "");
    setDoneTyping(true);
  };

  const handleSpeak = () => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = story?.story || "";
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <div className="min-h-screen text-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-50 backdrop-blur-md border-b border-white/[0.06] bg-[rgba(15,23,42,0.82)]">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={onBack} className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] hover:bg-[rgba(13,26,58,0.85)] transition text-sm">
            ← Roadmap
          </button>
          <div className="text-sm font-semibold">{section.title}</div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="pixel-heading text-xl">{character.name} is preparing your quest...</div>
            <div className="mt-4 h-2 w-48 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
              <div className="h-2 w-1/3 bg-[rgb(56,189,248)] animate-pulse" />
            </div>
          </div>
        ) : (
          <>
            {/* Story title */}
            <div className="pixel-heading text-2xl md:text-3xl">{story?.title || section.title}</div>

            {/* Character + Box conversation */}
            <div className="mt-8 flex gap-4 items-start">
              {/* Character */}
              <div className="shrink-0 hidden md:block">
                <img src={character.image} alt={character.name} className="w-28 h-28 object-contain rounded-2xl" />
                <div className="mt-2 text-center text-xs text-slate-300/70 font-semibold">{character.name}</div>
              </div>

              {/* Speech box */}
              <div className="flex-1 relative min-h-[200px]">
                <div
                  className="relative rounded-2xl border-2 border-[rgba(48,68,105,0.9)] overflow-hidden"
                  style={{
                    backgroundImage: `url(${boxImg})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  {/* Dark overlay for readability */}
                  <div className="absolute inset-0 bg-[rgba(10,20,44,0.85)]" />

                  <div className="relative p-6 md:p-8">
                    {/* Mobile character */}
                    <div className="md:hidden flex items-center gap-3 mb-4">
                      <img src={character.image} alt={character.name} className="w-12 h-12 object-contain rounded-xl" />
                      <span className="font-semibold">{character.name}</span>
                    </div>

                    <div
                      className="text-base md:text-lg text-slate-100/95 leading-relaxed whitespace-pre-line"
                      onClick={!doneTyping ? skipTypewriter : undefined}
                    >
                      {typed}
                      {!doneTyping && (
                        <span className="tw-caret" />
                      )}
                    </div>

                    {!doneTyping && (
                      <div className="mt-3 text-xs text-slate-400/70">Click to skip animation</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Key Words Learned */}
            {story?.key_words?.length > 0 && doneTyping && (
              <div className="mt-8 rounded-2xl border-2 border-[rgba(94,234,212,0.35)] bg-[rgba(94,234,212,0.05)] p-6">
                <div className="pixel-heading text-base">📚 Key Words Learned</div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {story.key_words.map((kw, i) => (
                    <div key={i} className="rounded-xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-[rgb(94,234,212)]">{kw.word}</span>
                        <span className="text-sm text-slate-300/70">= {kw.meaning}</span>
                      </div>
                      {kw.pronunciation && (
                        <div className="mt-1 text-xs text-slate-400/80">🔊 {kw.pronunciation}</div>
                      )}
                      {kw.example && (
                        <div className="mt-2 text-sm text-slate-200/80 italic">“{kw.example}”</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comprehension Question */}
            {story?.comprehension_question && doneTyping && (
              <div className="mt-6 rounded-2xl border-2 border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.05)] p-5">
                <div className="font-semibold text-[rgb(56,189,248)]">❓ Quick Check</div>
                <div className="mt-2 text-slate-200/90">{story.comprehension_question}</div>
                <details className="mt-2">
                  <summary className="text-sm text-slate-300/70 cursor-pointer hover:text-slate-200">Show answer</summary>
                  <div className="mt-1 text-sm text-[rgb(94,234,212)]">{story.comprehension_answer}</div>
                </details>
              </div>
            )}

            {/* Language Tip */}
            {story?.language_tip && doneTyping && (
              <div className="mt-6 rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-5">
                <div className="font-semibold text-[rgb(250,204,21)]">💡 Language Tip</div>
                <div className="mt-1 text-slate-200/90">{story.language_tip}</div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 flex items-center gap-4 flex-wrap">
              <button
                onClick={handleSpeak}
                className="px-5 py-3 rounded-xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(13,26,58,0.55)] hover:bg-[rgba(13,26,58,0.85)] transition"
              >
                {speaking ? "🔇 Stop Audio" : "🔊 Listen"}
              </button>
              <button
                onClick={onGoTest}
                className="px-7 py-3 rounded-xl bg-[rgb(94,234,212)] text-slate-900 font-semibold hover:brightness-110 transition shadow-lg"
              >
                Ready for Test →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
