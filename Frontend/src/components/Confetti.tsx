import { useMemo } from "react";

const COLORS = ["#38bdf8", "#5eead4", "#facc15", "#f472b6", "#c084fc", "#4ade80"];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  drift: number;
}

/** Pure-CSS confetti burst. Renders ~50 falling squares for ~3.5s. */
export default function Confetti({ show }: { show: boolean }) {
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: 50 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        drift: (Math.random() - 0.5) * 160,
      })),
    // regenerate pieces each time the burst is triggered
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show]
  );

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[65] pointer-events-none overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            ["--drift" as string]: `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
