import { Link } from "react-router-dom";

export interface NavLinkDef {
  label: string;
  to: string;
}

export default function PixelNavbar({
  brand = "NeuroLearn",
  title,
  subtitle,
  links = [],
  rightSlot,
}: {
  brand?: string;
  title?: string | null;
  subtitle?: string;
  links?: NavLinkDef[];
  rightSlot?: React.ReactNode;
}) {
  const isGameMode = title != null;
  const hasLinks = links.length > 0;

  return (
    <div className="sticky top-0 z-50">
      <div className="backdrop-blur-md border-b border-white/[0.06] bg-[rgba(15,23,42,0.82)]">
        <div className="max-w-6xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
          {/* Left */}
          <div className="min-w-0 shrink-0">
            {isGameMode ? (
              <div
                className="text-base font-semibold text-slate-100 truncate max-w-[200px] md:max-w-sm"
                title={subtitle}
              >
                {subtitle}
              </div>
            ) : (
              <Link to="/" className="text-lg font-semibold text-white tracking-tight hover:text-[rgb(94,234,212)] transition">
                {brand} <span aria-hidden="true">⚔️</span>
              </Link>
            )}
          </div>

          {/* Center: nav links (desktop) */}
          {!isGameMode && hasLinks && (
            <nav className="hidden md:flex items-center gap-6" aria-label="Primary">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="text-sm font-medium text-slate-300 hover:text-white transition"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          )}

          {/* Right */}
          <div className="flex items-center gap-2 shrink-0">{rightSlot}</div>
        </div>
      </div>

      {/* Mobile nav row */}
      {!isGameMode && hasLinks && (
        <nav
          className="md:hidden flex items-center gap-4 px-5 py-2 border-b border-white/[0.06] bg-[rgba(15,23,42,0.9)] overflow-x-auto"
          aria-label="Mobile"
        >
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="text-xs text-slate-300 whitespace-nowrap">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
