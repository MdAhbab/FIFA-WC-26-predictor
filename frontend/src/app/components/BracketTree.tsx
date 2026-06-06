import type { KnockoutMatch } from "../lib/types";
import { TeamBadge } from "./TeamBadge";

interface Props {
  matches: KnockoutMatch[];
  champion: { team: string; iso: string };
}

const ROUNDS = ["R32", "R16", "QF", "SF", "Final"] as const;
const ROUND_LABEL: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  Final: "Final",
};

function MatchNode({ m }: { m: KnockoutMatch }) {
  const homeWin = m.winner === "home";
  return (
    <div className="rounded-xl border border-border bg-card/80 px-3 py-2 w-[220px] backdrop-blur-sm hover:border-[var(--wc-blue)]/40 transition-colors">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex justify-between">
        <span>×{m.multiplier}</span>
        {m.penalties && (
          <span className="text-[var(--wc-amber)]">pens</span>
        )}
      </div>
      <div className="space-y-1">
        <Row
          name={m.home}
          iso={m.home_iso}
          goals={m.home_goals}
          win={homeWin}
        />
        <Row
          name={m.away}
          iso={m.away_iso}
          goals={m.away_goals}
          win={!homeWin}
        />
      </div>
    </div>
  );
}

function Row({
  name,
  iso,
  goals,
  win,
}: {
  name: string;
  iso: string;
  goals: number;
  win: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-md px-1.5 py-1 ${
        win ? "bg-[var(--wc-pitch)]/12" : ""
      }`}
    >
      <TeamBadge
        name={name}
        iso={iso}
        size={20}
        className={`text-sm min-w-0 ${win ? "" : "opacity-60"}`}
      />
      <span
        className={`tabular-nums text-sm ${
          win ? "text-[var(--wc-pitch)]" : "text-muted-foreground"
        }`}
      >
        {goals}
      </span>
    </div>
  );
}

export function BracketTree({ matches, champion }: Props) {
  const byRound = (r: string) => matches.filter((m) => m.round === r);

  return (
    <div className="w-full">
      {/* Mobile: vertical round-by-round list */}
      <div className="lg:hidden space-y-8">
        {ROUNDS.map((r) => (
          <div key={r}>
            <h3
              className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {ROUND_LABEL[r]}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {byRound(r).map((m) => (
                <MatchNode key={m.match_id} m={m} />
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-2xl border border-[var(--wc-gold)]/40 bg-gradient-to-br from-[var(--wc-blue)]/15 via-[var(--wc-magenta)]/10 to-[var(--wc-gold)]/15 px-4 py-5 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--wc-gold)] mb-2">
            Predicted Champion
          </div>
          <TeamBadge
            name={champion.team}
            iso={champion.iso}
            size={56}
            className="text-2xl font-semibold justify-center"
          />
        </div>
      </div>

      {/* Desktop: converging tree */}
      <div className="hidden lg:grid grid-cols-[1fr_1fr_1fr_1fr_auto_1fr_1fr_1fr_1fr] gap-4 items-stretch">
        {[0, 1, 2, 3].map((leftIdx) => (
          <BracketColumn
            key={`L${leftIdx}`}
            label={leftIdx === 0 ? ROUND_LABEL.R32 : ""}
            matches={byRound(ROUNDS[leftIdx]).slice(
              0,
              byRound(ROUNDS[leftIdx]).length / 2,
            )}
            roundIdx={leftIdx}
          />
        ))}
        <div className="flex items-center justify-center min-w-[220px]">
          <div className="rounded-2xl border border-[var(--wc-gold)]/40 bg-gradient-to-br from-[var(--wc-blue)]/15 via-[var(--wc-magenta)]/15 to-[var(--wc-gold)]/20 px-4 py-5 text-center w-full">
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--wc-gold)] mb-2">
              Final
            </div>
            {byRound("Final").map((m) => (
              <MatchNode key={m.match_id} m={m} />
            ))}
            <div className="mt-3 pt-3 border-t border-border/40">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
                Champion
              </div>
              <TeamBadge
                name={champion.team}
                iso={champion.iso}
                size={40}
                className="justify-center"
              />
            </div>
          </div>
        </div>
        {[3, 2, 1, 0].map((rightIdx) => (
          <BracketColumn
            key={`R${rightIdx}`}
            label={rightIdx === 0 ? ROUND_LABEL.R32 : ""}
            matches={byRound(ROUNDS[rightIdx]).slice(
              byRound(ROUNDS[rightIdx]).length / 2,
            )}
            roundIdx={rightIdx}
          />
        ))}
      </div>
    </div>
  );
}

function BracketColumn({
  matches,
  label,
}: {
  matches: KnockoutMatch[];
  label: string;
  roundIdx: number;
}) {
  return (
    <div className="flex flex-col">
      {label && (
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
          {label}
        </h3>
      )}
      <div className="flex-1 flex flex-col justify-around gap-2">
        {matches.map((m) => (
          <MatchNode key={m.match_id} m={m} />
        ))}
      </div>
    </div>
  );
}
