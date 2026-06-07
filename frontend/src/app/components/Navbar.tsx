import { NavLink } from "react-router";
import { ThemeToggle } from "./ThemeToggle";
import logoUrl from "../../../Logo-Predictor.png";

const LINKS = [
  { to: "/", label: "Cover", end: true },
  { to: "/play", label: "Play" },
  { to: "/predictions", label: "ML Pick" },
  { to: "/methodology", label: "Method" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-foreground/15 bg-background/85 backdrop-blur-md">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2 px-3 sm:px-6 h-[72px] sm:h-20">
        <NavLink to="/" className="flex items-center gap-3 group min-w-0">
          <img
            src={logoUrl}
            alt="FIFA Worldcup Predictor"
            className="h-14 sm:h-16 w-auto object-contain shrink-0 group-hover:-translate-y-0.5 group-hover:rotate-[-3deg] transition-transform"
          />
          <span className="flex flex-col leading-none min-w-0">
            <span className="display text-base sm:text-xl tracking-[0.02em] truncate">
              FIFA WORLDCUP
            </span>
            <span className="mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground truncate">
              PREDICTOR
            </span>
          </span>
        </NavLink>

        <nav className="hidden sm:flex items-center gap-1">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                l.to === "/play"
                  ? `display tracking-[0.05em] uppercase px-3.5 py-1.5 rounded-md text-sm transition-all border-2 border-[var(--foil-magenta)] bg-[color-mix(in_oklab,var(--foil-magenta)_10%,transparent)] hover:scale-105 shadow-[0_0_8px_rgba(229,36,122,0.35)] font-bold ${
                      isActive ? "bg-[var(--foil-magenta)] text-white" : "text-[var(--foil-magenta)]"
                    }`
                  : `display tracking-[0.05em] uppercase px-3 py-1.5 rounded-sm text-sm transition-colors ${
                      isActive
                        ? "bg-foreground text-background"
                        : "text-foreground/80 hover:bg-muted"
                    }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <ThemeToggle />
      </div>

      <nav className="sm:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
        {LINKS.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              l.to === "/play"
                ? `display tracking-[0.05em] uppercase whitespace-nowrap px-3.5 py-1.5 rounded-md text-sm border border-[var(--foil-magenta)] bg-[color-mix(in_oklab,var(--foil-magenta)_10%,transparent)] text-[var(--foil-magenta)] font-bold shadow-[0_0_6px_rgba(229,36,122,0.2)] ${
                    isActive ? "bg-[var(--foil-magenta)] text-white" : ""
                  }`
                : `display tracking-[0.05em] uppercase whitespace-nowrap px-3 py-1.5 rounded-sm text-sm ${
                    isActive
                      ? "bg-foreground text-background"
                      : "text-foreground/70"
                  }`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
