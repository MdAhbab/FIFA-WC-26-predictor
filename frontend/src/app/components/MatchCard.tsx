import { TeamBadge } from "./TeamBadge";

interface Props {
  home: string;
  away: string;
  homeIso?: string;
  awayIso?: string;
  homeGoals: number;
  awayGoals: number;
  winner: "home" | "away" | "draw";
  penalties?: boolean;
  meta?: string;
  compact?: boolean;
}

export function MatchCard({
  home,
  away,
  homeIso,
  awayIso,
  homeGoals,
  awayGoals,
  winner,
  penalties,
  meta,
  compact,
}: Props) {
  const homeWin = winner === "home";
  const awayWin = winner === "away";
  return (
    <div
      className={`rounded-2xl border border-border bg-card/60 backdrop-blur-sm ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      {meta && (
        <div className="text-[11px] tracking-wide uppercase text-muted-foreground mb-1.5">
          {meta}
          {penalties && (
            <span className="ml-2 inline-block rounded bg-[var(--wc-amber)]/15 px-1.5 py-px text-[10px] text-[var(--wc-amber)]">
              pens
            </span>
          )}
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div
          className={`flex items-center gap-2 min-w-0 ${
            homeWin ? "" : winner === "draw" ? "" : "opacity-60"
          }`}
        >
          <TeamBadge
            name={home}
            iso={homeIso}
            size={compact ? 20 : 24}
            className="min-w-0"
          />
        </div>
        <div className="tabular-nums text-center px-2">
          <span className={homeWin ? "text-[var(--wc-pitch)]" : ""}>{homeGoals}</span>
          <span className="mx-1 text-muted-foreground">–</span>
          <span className={awayWin ? "text-[var(--wc-pitch)]" : ""}>{awayGoals}</span>
        </div>
        <div
          className={`flex items-center justify-end gap-2 min-w-0 ${
            awayWin ? "" : winner === "draw" ? "" : "opacity-60"
          }`}
        >
          <TeamBadge
            name={away}
            iso={awayIso}
            size={compact ? 20 : 24}
            reverse
            className="min-w-0"
          />
        </div>
      </div>
    </div>
  );
}
