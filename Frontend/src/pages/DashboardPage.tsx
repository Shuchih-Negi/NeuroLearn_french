import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLangDashboard } from "../utils/api";
import { chapters } from "../data/chapters";
import { useStore } from "../store/useStore";
import { effectiveStreak, levelFromXP, usePlayer } from "../store/playerStore";
import { ACHIEVEMENTS } from "../utils/achievements";

type DashboardData = any;

const STATE_COLORS: Record<string, string> = {
  Focused: "bg-[rgb(52,211,153)]",
  Drifting: "bg-[rgb(250,204,21)]",
  Impulsive: "bg-[rgb(232,121,249)]",
  Overwhelmed: "bg-[rgb(251,113,133)]",
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const studentId = useStore((s) => s.studentId);
  const totalXP = usePlayer((s) => s.totalXP);
  const streakDays = usePlayer((s) => s.streakDays);
  const lastPlayDate = usePlayer((s) => s.lastPlayDate);
  const unlockedMap = usePlayer((s) => s.unlocked);
  const [data, setData] = useState<DashboardData>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLangDashboard(studentId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [studentId]);

  const streak = effectiveStreak({ streakDays, lastPlayDate });
  const unlockedCount = Object.keys(unlockedMap).length;

  const sectionTitleMap: Record<string, string> = {};
  chapters.forEach((ch) =>
    ch.sections.forEach((s) => {
      sectionTitleMap[s.id] = s.title;
    })
  );

  return (
    <div className="min-h-screen text-slate-100">
      {/* Top bar */}
      <div className="sticky top-0 z-50 backdrop-blur-md border-b border-white/[0.06] bg-[rgba(15,23,42,0.82)]">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="px-4 py-2 rounded-xl border border-[rgba(48,68,105,0.8)] bg-[rgba(13,26,58,0.55)] hover:bg-[rgba(13,26,58,0.85)] transition text-sm"
          >
            ← Home
          </button>
          <div className="pixel-heading text-base">🇫🇷 Progress Dashboard</div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {loading ? (
          <div className="flex flex-col items-center py-20">
            <div className="pixel-heading text-xl">Loading dashboard...</div>
            <div className="mt-4 h-2 w-48 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
              <div className="h-2 w-1/3 bg-[rgb(56,189,248)] animate-pulse" />
            </div>
          </div>
        ) : !data || data.total_answered === 0 ? (
          <div className="text-center py-20">
            <div aria-hidden="true" className="text-4xl mb-4">📊</div>
            <div className="pixel-heading text-xl">No Data Yet</div>
            <p className="mt-2 text-slate-300/80">
              Complete a French quest and your mastery, streaks and attention insights will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Player snapshot */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="px-3 py-1.5 rounded-full border border-[rgba(56,189,248,0.5)] bg-[rgba(56,189,248,0.12)] text-sm font-bold">
                Lv {levelFromXP(totalXP)}
              </span>
              <span className="text-xs text-slate-300/80">{totalXP} XP</span>
              <span className={`text-sm font-bold ${streak > 0 ? "text-[rgb(251,146,60)]" : "text-slate-400/70"}`}>
                🔥 {streak}-day streak
              </span>
            </div>

            {/* Achievements grid */}
            <div className="rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-5 mb-8">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="pixel-heading text-base">🏅 Achievements</h2>
                <span className="text-xs text-slate-300/80 font-semibold">
                  {unlockedCount}/{ACHIEVEMENTS.length} unlocked
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 md:grid-cols-5 gap-3">
                {ACHIEVEMENTS.map((a) => {
                  const got = Boolean(unlockedMap[a.id]);
                  return (
                    <div
                      key={a.id}
                      title={a.desc}
                      className={`rounded-xl border-2 p-3 text-center transition ${
                        got
                          ? "border-[rgba(250,204,21,0.65)] bg-[rgba(250,204,21,0.10)]"
                          : "border-[rgba(51,65,85,0.5)] bg-[rgba(15,23,42,0.5)] opacity-55"
                      }`}
                    >
                      <div className={`text-2xl ${got ? "" : "grayscale"}`} aria-hidden="true">
                        {got ? a.icon : "🔒"}
                      </div>
                      <div className={`mt-1 text-[11px] font-bold leading-tight ${got ? "text-slate-100" : "text-slate-400"}`}>
                        {a.title}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400/80 leading-tight">{a.desc}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Overview cards */}
            <h1 className="pixel-heading text-2xl">Student Overview</h1>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
              <StatCard label="Total XP" value={data.total_xp} color="text-[rgb(250,204,21)]" />
              <StatCard label="Level" value={data.level} color="text-[rgb(56,189,248)]" />
              <StatCard label="Questions" value={`${data.total_correct}/${data.total_answered}`} color="text-[rgb(94,234,212)]" />
              <StatCard label="Accuracy" value={`${data.overall_accuracy}%`} color="text-white" />
              <StatCard label="XP to Next" value={data.xp_to_next_level ?? "—"} color="text-[rgb(232,121,249)]" />
            </div>

            {/* Skill Mastery Scores */}
            {data.mastery_scores && Object.keys(data.mastery_scores).length > 0 && (
              <div className="mt-10">
                <h2 className="pixel-heading text-xl">🎯 Skill Mastery</h2>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(data.mastery_scores as Record<string, number>).map(([skill, score]) => (
                    <div key={skill} className="rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{skill.replace(/_/g, " ")}</span>
                        <span
                          className={`text-lg font-bold ${
                            score >= 0.7
                              ? "text-[rgb(52,211,153)]"
                              : score >= 0.4
                                ? "text-[rgb(250,204,21)]"
                                : "text-[rgb(251,113,133)]"
                          }`}
                        >
                          {Math.round(score * 100)}%
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                        <div
                          className={`h-2 transition-all rounded-full ${
                            score >= 0.7
                              ? "bg-[rgb(52,211,153)]"
                              : score >= 0.4
                                ? "bg-[rgb(250,204,21)]"
                                : "bg-[rgb(251,113,133)]"
                          }`}
                          style={{ width: `${Math.round(score * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skills Due for Review */}
            {data.skills_due_for_review?.length > 0 && (
              <div className="mt-8 rounded-2xl border-2 border-[rgba(250,204,21,0.35)] bg-[rgba(250,204,21,0.05)] p-5">
                <h2 className="pixel-heading text-base">🔄 Skills Due for Review</h2>
                <div className="mt-3 flex gap-2 flex-wrap">
                  {data.skills_due_for_review.map((skill: string, i: number) => (
                    <span
                      key={i}
                      className="text-xs px-3 py-1.5 rounded-full border border-[rgba(250,204,21,0.5)] bg-[rgba(250,204,21,0.10)] font-semibold"
                    >
                      {skill.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ADHD Insights */}
            {data.adhd_insights && (
              <div className="mt-8 rounded-2xl border-2 border-[rgba(232,121,249,0.35)] bg-[rgba(232,121,249,0.05)] p-5">
                <h2 className="pixel-heading text-base">🧠 ADHD Learning Insights</h2>
                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                  <MiniStat label="Focus Rate" value={`${data.adhd_insights.focus_rate ?? 0}%`} />
                  <MiniStat
                    label="Best Performance"
                    value={data.adhd_insights.best_time_of_session === "start" ? "First Half" : "Second Half"}
                  />
                  <MiniStat label="Avg Mastery" value={`${data.adhd_insights.avg_mastery ?? 0}%`} />
                  <MiniStat label="1st Half Accuracy" value={`${data.adhd_insights.first_half_accuracy ?? 0}%`} />
                  <MiniStat label="2nd Half Accuracy" value={`${data.adhd_insights.second_half_accuracy ?? 0}%`} />
                  <MiniStat label="Fatigue Detected" value={data.adhd_insights.fatigue_detected ? "Yes ⚠️" : "No ✅"} />
                </div>
                {data.adhd_insights.recommendation && (
                  <div className="mt-4 text-sm text-slate-200/90 italic">💡 {data.adhd_insights.recommendation}</div>
                )}
              </div>
            )}

            {/* Section breakdown */}
            <div className="mt-10">
              <h2 className="pixel-heading text-xl">Section Performance</h2>
              <div className="mt-4 space-y-4">
                {(data.sections as Array<Record<string, any>>).map((sec) => (
                  <div key={sec.section_id} className="rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-5">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <div className="font-semibold">{sectionTitleMap[sec.section_id] || sec.section_id}</div>
                        <div className="text-sm text-slate-300/80 mt-1">
                          {sec.correct}/{sec.answered} correct • Best streak: {sec.best_streak}
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-[rgb(94,234,212)]">{sec.accuracy}%</div>
                    </div>

                    <div className="mt-3 h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
                      <div
                        className="h-2 bg-gradient-to-r from-[rgb(56,189,248)] to-[rgb(94,234,212)] transition-all"
                        style={{ width: `${sec.accuracy}%` }}
                      />
                    </div>

                    {sec.exercise_types && Object.keys(sec.exercise_types).length > 0 && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {Object.entries(sec.exercise_types as Record<string, number>).map(([type, count]) => (
                          <span
                            key={type}
                            className="text-xs px-2 py-0.5 rounded-full border border-[rgba(94,234,212,0.3)] bg-[rgba(94,234,212,0.06)] text-slate-300/80"
                          >
                            {String(type).replace(/_/g, " ")}: {count}
                          </span>
                        ))}
                      </div>
                    )}

                    {sec.state_counts && Object.keys(sec.state_counts).length > 0 && (
                      <div className="mt-3 flex gap-2 flex-wrap">
                        {Object.entries(sec.state_counts as Record<string, number>).map(([state, count]) => (
                          <span key={state} className="flex items-center gap-1.5 text-xs text-slate-300/80">
                            <span className={`w-2.5 h-2.5 rounded-full ${STATE_COLORS[state] || "bg-slate-500"}`} />
                            {state}: {count}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            {data.recent_history?.length > 0 && (
              <div className="mt-10">
                <h2 className="pixel-heading text-xl">Recent Activity</h2>
                <div className="mt-4 rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-5">
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {[...(data.recent_history as Array<Record<string, any>>)].reverse().map((h, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${h.correct ? "bg-[rgb(52,211,153)]" : "bg-[rgb(251,113,133)]"}`} />
                        <span className="text-slate-300/80">{sectionTitleMap[h.section_id] || h.section_id}</span>
                        <span className="text-slate-400/60">•</span>
                        <span className="text-slate-200/90">{String(h.skill_tag || "").replace(/_/g, " ")}</span>
                        <span className="text-slate-400/60">•</span>
                        <span>{h.state}</span>
                        <span className="text-slate-400/60">•</span>
                        <span className="text-slate-400/70">{Number(h.rt).toFixed(1)}s</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Attention Legend */}
            <div className="mt-10 rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-5">
              <h2 className="pixel-heading text-base">Attention States Guide</h2>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-slate-200/90">
                <Legend color="bg-[rgb(52,211,153)]" strong="Focused" text="engaged and answering correctly" />
                <Legend color="bg-[rgb(250,204,21)]" strong="Drifting" text="slow responses, attention wandering" />
                <Legend color="bg-[rgb(232,121,249)]" strong="Impulsive" text="fast but incorrect answers" />
                <Legend color="bg-[rgb(251,113,133)]" strong="Overwhelmed" text="struggling, needs simpler exercises" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-2xl border-2 border-[rgba(48,68,105,0.9)] bg-[rgba(15,23,42,0.72)] p-4">
      <div className="text-xs text-slate-300/70">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[rgba(48,68,105,0.7)] bg-[rgba(13,26,58,0.4)] p-3">
      <div className="text-xs text-slate-300/70">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-100">{value}</div>
    </div>
  );
}

function Legend({ color, strong, text }: { color: string; strong: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`w-3 h-3 rounded-full ${color} mt-0.5 shrink-0`} aria-hidden="true" />
      <span>
        <strong>{strong}</strong> — {text}
      </span>
    </div>
  );
}
