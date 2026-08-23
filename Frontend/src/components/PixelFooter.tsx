import { Link } from "react-router-dom";

export default function PixelFooter() {
  return (
    <footer
      id="footer"
      className="mt-16 border-t border-[rgba(51,65,85,0.4)] bg-[rgba(15,23,42,0.5)]"
    >
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div className="max-w-md">
            <div className="font-semibold text-slate-100 text-lg">NeuroLearn</div>
            <p className="mt-2 text-sm text-slate-300/90 leading-relaxed">
              Story-based French quests with real-time attention adaptation and AI-generated exercises.
            </p>
            <p className="mt-2 text-xs text-slate-400/80">
              Open source • Research-backed • Built for learning with focus
            </p>
          </div>
          <nav className="flex flex-col gap-1.5 text-sm" aria-label="Footer">
            <Link to="/" className="text-slate-300/80 hover:text-[rgb(94,234,212)] transition">Home</Link>
            <Link to="/dashboard" className="text-slate-300/80 hover:text-[rgb(94,234,212)] transition">Dashboard</Link>
            <Link to="/research" className="text-slate-300/80 hover:text-[rgb(94,234,212)] transition">Research Mode</Link>
          </nav>
        </div>
        <div className="mt-8 pt-6 border-t border-[rgba(51,65,85,0.3)] text-center text-xs text-slate-400/80">
          © {new Date().getFullYear()} NeuroLearn 🇫🇷
        </div>
      </div>
    </footer>
  );
}
