import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getResearchStats,
  getResearchStatus,
  setResearchConsent,
  type ResearchStats,
} from "../utils/api";
import { useStore } from "../store/useStore";

const STATE_META: Array<{ key: string; label: string; color: string }> = [
  { key: "Focused", label: "🎯 Focused", color: "bg-[rgb(52,211,153)]" },
  { key: "Drifting", label: "🌊 Drifting", color: "bg-[rgb(250,204,21)]" },
  { key: "Impulsive", label: "😤 Impulsive", color: "bg-[rgb(232,121,249)]" },
  { key: "Overwhelmed", label: "🌋 Overwhelmed", color: "bg-[rgb(251,113,133)]" },
];

export default function ResearchPage() {
  const navigate = useNavigate();
  const studentId = useStore((s) => s.studentId);

  const [stats, setStats] = useState<ResearchStats | null>(null);
  const [consented, setConsented] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [s, st] = await Promise.all([getResearchStats(), getResearchStatus(studentId)]);
      setStats(s);
      setConsented(st.consent_accepted);
    } catch {
      // backend offline — page still renders explainer
    }
  }, [studentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleConsent = async (accepted: boolean) => {
    setBusy(true);
    try {
      await setResearchConsent({ studentId, accepted });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const maxLabel = stats
    ? Math.max(1, ...Object.values(stats.labels.per_reported_state))
    : 1;

  return (
    <div className="min-h-screen text-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-50 backdrop-blur-md border-b border-white/[0.06] bg-[rgba(15,23,42,0.82)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] hover:bg-[rgba(13,26,58,0.85)] transition text-sm"
          >
            ← Home
          </button>
          <div className="pixel-heading text-base">🧠 Research Mode</div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Explainer */}
        <section>
          <h1 className="pixel-heading text-2xl md:text-3xl text-[rgb(232,121,249)]">
            Learn French. Advance the science.
          </h1>
          <p className="mt-4 text-slate-200/90 leading-relaxed">
            NeuroLearn is building the first open dataset of ADHD-oriented language-learning
            interactions with self-reported attention labels. When you opt in, every quest you play
            contributes anonymous rows (answers, timing, error types, attention snapshots) plus
            one-tap “how did that feel?” ground truth every third question.
          </p>
          <ul className="mt-4 space-y-2 text-sm text-slate-300/85 list-disc list-inside">
            <li>No accounts, no emails — just a random id stored in your browser</li>
            <li>Consent is required before anything is logged, and revocable anytime</li>
            <li>Exports power open models: knowledge tracing + attention classification</li>
          </ul>
        </section>

        {/* Consent card */}
        <section className="rounded-3xl border-2 border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.05)] p-6">
          <h2 className="pixel-heading text-lg">Your participation</h2>
          {consented === null ? (
            <p className="mt-3 text-sm text-slate-300/80">Checking status…</p>
          ) : (
            <>
              <p className={`mt-3 text-sm font-semibold ${consented ? "text-[rgb(52,211,153)]" : "text-slate-300/80"}`}>
                {consented ? "✅ You are contributing to Research Mode." : "Research Mode is off for this profile."}
              </p>
              <div className="mt-4 flex gap-3 flex-wrap">
                {!consented && (
                  <button
                    onClick={() => toggleConsent(true)}
                    disabled={busy}
                    className="btn-pixel px-5 py-2.5 rounded-xl disabled:opacity-50"
                  >
                    Join Research Mode
                  </button>
                )}
                {consented && (
                  <button
                    onClick={() => toggleConsent(false)}
                    disabled={busy}
                    className="px-5 py-2.5 rounded-xl border border-[rgba(251,113,133,0.5)] bg-[rgba(251,113,133,0.08)] hover:bg-[rgba(251,113,133,0.15)] transition text-sm"
                  >
                    Withdraw consent
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        {/* Live contribution stats */}
        {stats && (
          <section aria-label="Dataset statistics">
            <h2 className="pixel-heading text-xl">📊 Dataset so far</h2>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Interactions" value={fmt(stats.total_interactions)} />
              <StatCard label="Self-report labels" value={fmt(stats.labels.total)} />
              <StatCard label="Contributors" value={fmt(stats.distinct_students)} />
              <StatCard
                label="Model–human agreement"
                value={stats.labels.detected_agreement_rate != null
                  ? `${Math.round(stats.labels.detected_agreement_rate * 100)}%`
                  : "—"}
              />
            </div>

            {/* Label distribution */}
            <div className="mt-6 rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-5">
              <h3 className="font-semibold">Label distribution</h3>
              <div className="mt-4 space-y-3">
                {STATE_META.map(({ key, label, color }) => {
                  const count = stats.labels.per_reported_state[key] ?? 0;
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between text-xs text-slate-300/80">
                        <span>{label}</span>
                        <span>{count}</span>
                      </div>
                      <div className="mt-1 h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                        <div
                          className={`h-2 ${color} transition-all`}
                          style={{ width: `${Math.round((count / maxLabel) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.keys(stats.labels.per_reported_state).length === 0 && (
                <p className="mt-3 text-xs text-slate-400/70">
                  No labels yet — play a session with Research Mode on to contribute the first ones.
                </p>
              )}
            </div>

            {/* Skill coverage */}
            <div className="mt-6 rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-5">
              <h3 className="font-semibold">Skill coverage</h3>
              <div className="mt-3 flex gap-2 flex-wrap">
                {Object.entries(stats.per_skill).map(([skill, count]) => (
                  <span
                    key={skill}
                    className="text-xs px-3 py-1.5 rounded-full border border-[rgba(94,234,212,0.35)] bg-[rgba(94,234,212,0.08)]"
                  >
                    {skill.replace(/_/g, " ")}: {count}
                  </span>
                ))}
                {Object.keys(stats.per_skill).length === 0 && (
                  <span className="text-xs text-slate-400/70">Nothing collected yet.</span>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-slate-400/70">
              Researchers: rows are exportable as DKT-ready JSONL/CSV via{" "}
              <code className="text-[rgb(94,234,212)]">GET /api/research/export</code>. See{" "}
              <code className="text-[rgb(94,234,212)]">docs/dataset_card.md</code>.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-4">
      <div className="text-xs text-slate-300/70">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
