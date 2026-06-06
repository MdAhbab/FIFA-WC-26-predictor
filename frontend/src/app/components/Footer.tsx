import { Link } from "react-router";
import logoUrl from "../../../Logo-Predictor.png";
import { CONTACT_EMAIL } from "../lib/site";

export function Footer() {
  return (
    <>
      <footer className="mt-16 border-t-2 border-foreground/15">
      <div className="halftone h-2" aria-hidden />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-6 sm:gap-8 items-start">
        <img
          src={logoUrl}
          alt="FIFA World Cup '26 Predictor"
          className="h-20 sm:h-24 w-auto object-contain shrink-0"
        />

        <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <div className="display text-base sm:text-lg tracking-wide">
              FIFA WORLD CUP 26 PREDICTOR
            </div>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              A pocket guide to the 2026 FIFA World Cup, written by an
              indecisive computer. AI-generated for entertainment only — not
              betting advice.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <Link to="/privacy" className="underline hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link to="/terms" className="underline hover:text-foreground transition-colors">
                Terms
              </Link>
              <Link to="/disclaimer" className="underline hover:text-foreground transition-colors">
                Disclaimer
              </Link>
              <Link to="/methodology" className="underline hover:text-foreground transition-colors">
                Methodology
              </Link>
            </nav>
            <div className="text-xs text-muted-foreground">
              Contact:{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="underline hover:text-foreground transition-colors break-all"
              >
                {CONTACT_EMAIL}
              </a>
            </div>
            <span className="stamp self-start" style={{ color: "var(--stamp-red)" }}>
              © {new Date().getFullYear()} · ISSUE 01
            </span>
          </div>
        </div>
      </div>
    </footer>
    {/* Discreet admin link — not indexed, not in nav */}
    <div className="text-center pb-3">
      <Link
        to="/admin"
        className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground transition-colors"
        tabIndex={-1}
        aria-hidden
      >
        ·
      </Link>
    </div>
    </>
  );
}
