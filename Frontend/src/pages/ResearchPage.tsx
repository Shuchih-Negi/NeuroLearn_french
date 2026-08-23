import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getResearchStats,
  getResearchStatus,
  setResearchConsent,
  researchExportUrl,
  type ResearchStats,
} from "../utils/api";
import { useStore } from "../store/useStore";

const STATE_META: Array<{ key: string; label: string; color: string }> = [
  { key: "Focused", label: "🎯 Focused", color: "bg-[rgb(52,211,153)]" },
  { key: "Drifting", label: "🌊 Drifting", color: "bg-[rgb(250,204,21)]" },
  { key: "Impulsive", label: "😤 Impulsive", color: "bg-[rgb(232,121,249)]" },
  { key: "Overwhelmed", label: "🌋 Overwhelmed", color: "bg-[rgb(251,113,133)]" },
];

const COLLECTION_GOAL = 1000;

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
  const goalPct = stats
    ? Math.min(100, Math.round((stats.total_interactions / COLLECTION_GOAL) * 100))
    : 0;
  const agreement = stats?.labels.detected_agreement_rate ?? null;

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
          <div className="pixel-heading text-base">🧠 Data Lab</div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Explainer */}
        <section>
          <h1 className="pixel-heading text-2xl md:text-3xl text-[rgb(232,121,249)]">
            Learn French. Advance the science.
          </h1>
          <p className="mt-4 text-slate-200/90 leading-relaxed">
            Every quest played with Research Mode on builds the first open dataset of
            ADHD-oriented French learning: anonymous interactions plus one-tap
            “how did that feel?” ground truth. Consent required, revocable anytime.
          </p>
        </section>

        {/* Contribution status */}
        <section className="rounded-3xl border-2 border-[rgba(56,189,248,0.35)] bg-[rgba(56,189,248,0.05)] p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="pixel-heading text-lg">Your participation</h2>
            {consented !== null && (
              <span
                className={`text-xs px-3 py-1.5 rounded-full border font-semibold ${
                  consented
                    ? "border-[rgba(52,211,153,0.55)] bg-[rgba(52,211,153,0.10)] text-[rgb(52,211,153)]"
                    : "border-[rgba(51,65,85,0.7)] bg-[rgba(30,41,59,0.5)]"
                }`}
              >
                {consented ? "● Contributing" : "○ Off"}
              </span>
            )}
          </div>

          {consented === null ? (
            <p className="mt-3 text-sm text-slate-300/80">Checking status…</p>
          ) : (
            <>
              <div className="mt-4 flex gap-3 flex-wrap">
                {!consented && (
                  <button
                    onClick={() => toggleConsent(true)}
                    disabled={busy}
                    className="btn-pixel px-6 py-3 rounded-xl disabled:opacity-50"
                  >
                    Join Research Mode
                  </button>
                )}
                {consented && (
                  <>
                    <button
                      onClick={() => navigate("/roadmap")}
                      className="px-5 py-2.5 rounded-xl border-2 border-[rgba(94,234,212,0.5)] bg-[rgba(94,234,212,0.08)] hover:bg-[rgba(94,234,212,0.16)] transition text-sm font-semibold"
                    >
                      ⚔️ Play & contribute
                    </button>
                    <button
                      onClick={() => toggleConsent(false)}
                      disabled={busy}
                      className="px-5 py-2.5 rounded-xl border border-[rgba(251,113,133,0.5)] bg-[rgba(251,113,133,0.08)] hover:bg-[rgba(251,113,133,0.15)] transition text-sm"
                    >
                      Withdraw consent
                    </button>
                  </>
                )}
              </div>
              {consented && (
                <p className="mt-3 text-xs text-slate-400/80">
                  A “How did that feel?” chip appears every 3rd question — that tap is the
                  gold-standard label. Skipping is always OK.
                </p>
              )}
            </>
          )}
        </section>

        {/* Collection progress toward goal */}
        {stats && (
          <section aria-label="Collection progress">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <h2 className="pixel-heading text-xl">📊 Dataset so far</h2>
              <span className="text-sm text-slate-300/80">
                {fmt(stats.total_interactions)} / {fmt(COLLECTION_GOAL)} interactions to training-ready
              </span>
            </div>
            <div className="mt-3 h-4 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden border border-[rgba(48,68,105,0.6)]">
              <div
                className="h-4 bg-gradient-to-r from-[rgb(232,121,249)] via-[rgb(56,189,248)] to-[rgb(94,234,212)] transition-all duration-700"
                style={{ width: `${goalPct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-400/80">
              ~{Math.max(0, COLLECTION_GOAL - stats.total_interactions)} to go — roughly{" "}
              {Math.max(1, Math.ceil((COLLECTION_GOAL - stats.total_interactions) / 10))} more sessions.
            </p>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Interactions" value={fmt(stats.total_interactions)} />
              <StatCard label="Self-report labels" value={fmt(stats.labels.total)} />
              <StatCard label="Contributors" value={fmt(stats.distinct_students)} />
              <StatCard
                label="Model–human agreement"
                value={agreement != null ? `${Math.round(agreement * 100)}%` : "—"}
                accent={
                  agreement == null
                    ? ""
                    : agreement >= 0.7
                      ? "text-[rgb(52,211,153)]"
                      : agreement >= 0.45
                        ? "text-[rgb(250,204,21)]"
                        : "text-[rgb(251,113,133)]"
                }
              />
            </div>
          </section>
        )}

        {/* Label distribution + skill coverage */}
        {stats && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-5">
              <h3 className="font-semibold">Label balance</h3>
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
                  No labels yet — one session gets you started.
                </p>
              )}
            </div>

            <div className="rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-5">
              <h3 className="font-semibold">Skill coverage</h3>
              <div className="mt-3 space-y-2">
                {Object.entries(stats.per_skill).slice(0, 8).map(([skill, count]) => (
                  <div key={skill} className="flex items-center justify-between text-xs">
                    <span className="text-slate-200/85">{skill.replace(/_/g, " ")}</span>
                    <span className="px-2 py-0.5 rounded-full border border-[rgba(94,234,212,0.35)] bg-[rgba(94,234,212,0.08)]">
                      {count}
                    </span>
                  </div>
                ))}
                {Object.keys(stats.per_skill).length === 0 && (
                  <span className="text-xs text-slate-400/70">Nothing collected yet.</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Export center */}
        <section className="rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-5">
          <h3 className="font-semibold">⬇️ Export for training</h3>
          <p className="mt-1 text-xs text-slate-300/80">
            DKT-ready rows for <code className="text-[rgb(250,204,21)]">ml_training/train_lstm.py</code>{" "}
            and labels for the attention classifier. Schema in{" "}
            <code className="text-[rgb(250,204,21)]">docs/dataset_card.md</code>.
          </p>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <a href={researchExportUrl("interactions", "jsonl")} className="text-center px-3 py-2.5 rounded-xl border border-[rgba(94,234,212,0.4)] bg-[rgba(94,234,212,0.08)] hover:bg-[rgba(94,234,212,0.16)] transition text-xs font-semibold">
              interactions.jsonl
            </a>
            <a href={researchExportUrl("interactions", "csv")} className="text-center px-3 py-2.5 rounded-xl border border-[rgba(94,234,212,0.4)] bg-[rgba(94,234,212,0.08)] hover:bg-[rgba(94,234,212,0.16)] transition text-xs font-semibold">
              interactions.csv
            </a>
            <a href={researchExportUrl("labels", "jsonl")} className="text-center px-3 py-2.5 rounded-xl border border-[rgba(232,121,249,0.4)] bg-[rgba(232,121,249,0.08)] hover:bg-[rgba(232,121,249,0.16)] transition text-xs font-semibold">
              labels.jsonl
            </a>
            <a href={researchExportUrl("labels", "csv")} className="text-center px-3 py-2.5 rounded-xl border border-[rgba(232,121,249,0.4)] bg-[rgba(232,121,249,0.08)] hover:bg-[rgba(232,121,249,0.16)] transition text-xs font-semibold">
              labels.csv
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-4">
      <div className="text-xs text-slate-300/70">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent || "text-slate-100"}`}>{value}</div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
