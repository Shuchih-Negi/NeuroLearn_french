import { DAILY_GOAL, answersToday, usePlayer } from "../store/playerStore";

export default function DailyGoalRing() {
  const dailyLog = usePlayer((s) => s.dailyLog);
  const done = Math.min(answersToday({ dailyLog }), DAILY_GOAL);
  const pct = done / DAILY_GOAL;

  // SVG ring: r=26, circumference ≈ 163.36
  const C = 2 * Math.PI * 26;
  const complete = done >= DAILY_GOAL;

  return (
    <div className="flex items-center gap-3" title={`Daily goal: ${done}/${DAILY_GOAL} answers`}>
      <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`Daily goal ${done} of ${DAILY_GOAL}`}>
        <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r="26"
          fill="none"
          stroke={complete ? "rgb(52,211,153)" : "rgb(94,234,212)"}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
          transform="rotate(-90 32 32)"
          style={{ transition: "stroke-dashoffset 500ms ease" }}
        />
        <text x="32" y="37" textAnchor="middle" className="fill-slate-100" fontSize="14" fontWeight="700">
          {done}
        </text>
      </svg>
      <div>
        <div className="text-sm font-semibold">
          {complete ? "Goal smashed! 🎉" : "Daily goal"}
        </div>
        <div className="text-xs text-slate-300/80">
          {done}/{DAILY_GOAL} answers today
        </div>
      </div>
    </div>
  );
}
