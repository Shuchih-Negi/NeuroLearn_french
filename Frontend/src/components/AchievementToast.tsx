import { useEffect } from "react";
import { usePlayer } from "../store/playerStore";

/** Global achievement unlock toasts (mount once in App). */
export default function AchievementToast() {
  const toasts = usePlayer((s) => s.toasts);
  const dismissToast = usePlayer((s) => s.dismissToast);
  const current = toasts[0];

  useEffect(() => {
    if (!current) return;
    const t = window.setTimeout(dismissToast, 4200);
    return () => window.clearTimeout(t);
  }, [current, dismissToast]);

  if (!current) return null;

  return (
    <div className="fixed top-20 right-4 z-[70] pointer-events-none" aria-live="polite">
      <div className="achv-toast flex items-center gap-3 rounded-2xl border-2 border-[rgba(250,204,21,0.65)] bg-[rgba(10,20,44,0.96)] px-5 py-4 shadow-2xl">
        <span aria-hidden="true" className="text-3xl">{current.icon}</span>
        <div>
          <div className="text-[11px] tracking-widest text-[rgb(250,204,21)] font-bold">
            ACHIEVEMENT UNLOCKED
          </div>
          <div className="font-bold text-slate-100">{current.title}</div>
        </div>
      </div>
    </div>
  );
}
