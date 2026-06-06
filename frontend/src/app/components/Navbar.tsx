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
            alt="FIFA World Cup '26 Predictor"
            className="h-14 sm:h-16 w-auto object-contain shrink-0 group-hover:-translate-y-0.5 group-hover:rotate-[-3deg] transition-transform"
          />
          <span className="flex flex-col leading-none min-w-0">
            <span className="display text-base sm:text-xl tracking-[0.02em] truncate">
              FIFA WORLD CUP '26
            </span>
            <span className="mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground truncate">
              Predictor · ML matchday album
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
                `display tracking-[0.05em] uppercase px-3 py-1.5 rounded-sm text-sm transition-colors ${
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
              `display tracking-[0.05em] uppercase whitespace-nowrap px-3 py-1.5 rounded-sm text-sm ${
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
