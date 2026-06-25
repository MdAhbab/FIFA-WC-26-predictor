import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronDown, Trophy } from "lucide-react";
import { getMLBracket } from "../lib/PicksContext";
import { GROUP_LETTERS } from "../lib/data";
import type { KnockoutResult } from "../lib/PicksContext";
import { TeamBadge } from "../components/TeamBadge";
import { MatchDetailDialog, type MatchRef } from "../components/MatchDetailDialog";
import { useSEO } from "../lib/useSEO";

export default function Predictions() {
  useSEO({
    title: "The Model's Pick · FIFA Worldcup Predictor",
    description:
      "What the ML model actually predicts for the 2026 FIFA World Cup — every group, every knockout, every score.",
  });
  const ml = useMemo(() => getMLBracket(), []);
  const [selected, setSelected] = useState<MatchRef | null>(null);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-12">
      <header className="mb-8">
        <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
          The model's verdict
        </div>
        <h1 className="mt-1">EVERY MATCH, PRE-CALLED</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          What our Poisson + Elo model thinks happens — independent of any user
          picks. Want to argue with it? <a href="/play" className="underline">Play the album yourself</a>.
        </p>
      </header>

      {/* Champion */}
      {ml.champion && ml.final && (
        <section className="mb-10 rounded-[18px] border-2 border-foreground bg-card p-5 sm:p-6 relative overflow-hidden">
          <div className="halftone absolute inset-0 text-foreground opacity-25 pointer-events-none" />
          <div className="relative grid md:grid-cols-[auto_1fr] gap-6 items-center">
            <div className="ticket bg-background border-2 border-foreground p-4 text-center">
              <Trophy
                className="size-7 mx-auto mb-1"
                style={{ color: "var(--foil-gold)" }}
              />
              <div className="display text-[10px] tracking-[0.3em] text-muted-foreground">
                CHAMPION
              </div>
              <img
                src={`https://flagcdn.com/w320/${ml.champion.iso}.png`}
                alt={ml.champion.name}
                width={140}
                height={95}
                className="mt-2 mx-auto rounded-sm border border-foreground/20"
              />
              <div className="display text-2xl mt-2">
                {ml.champion.name.toUpperCase()}
              </div>
            </div>
            <div>
              <div className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
                The final
              </div>
              <div className="display text-3xl mb-2">
                {ml.final.home.name} {ml.final.homeGoals}
                <span className="text-muted-foreground"> – </span>
                {ml.final.awayGoals} {ml.final.away.name}
              </div>
              <div className="mono text-xs uppercase tracking-wider text-muted-foreground">
                {ml.final.date} · {ml.final.venue}{" "}
                {ml.final.homeGoals === ml.final.awayGoals &&
                  `· ${ml.final.winnerTeam.name} won on penalties`}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Groups */}
      <section className="mb-10">
        <h2 className="display tracking-wide mb-4">GROUP STAGE</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {GROUP_LETTERS.map((g) => (
            <div key={g}>
              <GroupCard letter={g} ml={ml} onOpenMatch={setSelected} />
            </div>
          ))}
        </div>
      </section>

      {/* Bracket lists */}
      <section>
        <h2 className="display tracking-wide mb-4">KNOCKOUTS</h2>
        <KnockoutColumn title="Round of 32" matches={ml.r32} onOpenMatch={setSelected} />
        <KnockoutColumn title="Round of 16" matches={ml.r16} onOpenMatch={setSelected} />
        <KnockoutColumn title="Quarter-finals" matches={ml.qf} onOpenMatch={setSelected} />
        <KnockoutColumn title="Semi-finals" matches={ml.sf} onOpenMatch={setSelected} />
        {ml.final && (
          <KnockoutColumn title="Final" matches={[ml.final]} onOpenMatch={setSelected} />
        )}
      </section>

      <MatchDetailDialog match={selected} onClose={() => setSelected(null)} />
    </main>
  );
}

function GroupCard({
  letter,
  ml,
  onOpenMatch,
}: {
  letter: string;
  ml: ReturnType<typeof getMLBracket>;
  onOpenMatch: (m: MatchRef) => void;
}) {
  const [open, setOpen] = useState(false);
  const standings = ml.effectiveStandings[letter];
  const matches = ml.groups[letter].matches;
  return (
    <div className="rounded-[14px] border-2 border-foreground/15 bg-card overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-3 pb-1">
        <span
          className="display text-3xl"
          style={{
            background:
              "linear-gradient(120deg, var(--foil-blue), var(--foil-magenta), var(--foil-gold))",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {letter}
        </span>
        <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Group {letter}
        </span>
      </div>
      <ul className="px-3 pb-3 space-y-1">
        {standings.map((s, idx) => {
          const isTop2 = idx < 2;
          const isThird = idx === 2;
          const advancing = ml.bestThirds.has(s.team.name);
          const color = isTop2
            ? "var(--pitch)"
            : isThird && advancing
            ? "var(--mustard)"
            : "var(--muted-foreground)";
          return (
            <li
              key={s.team.name}
              className="flex items-center gap-2 rounded-md border border-foreground/10 bg-background/60 px-2 py-1.5"
            >
              <span
                className="display text-lg w-5 text-center"
                style={{ color }}
              >
                {idx + 1}
              </span>
              <TeamBadge name={s.team.name} iso={s.team.iso} size={22} />
              <span className="ml-auto mono text-[10px] tabular-nums text-muted-foreground">
                <span style={{ color: "var(--foil-blue)" }}>{s.team.elo}</span> elo · {s.pts}p · {s.gf}-{s.ga}
              </span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 border-t-2 border-foreground/10 text-xs display uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        {open ? "Hide" : "Show"} fixtures
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5 pt-2">
              {matches.map((m) => (
                <li key={m.matchId}>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenMatch({
                        home: m.home.name,
                        away: m.away.name,
                        homeIso: m.home.iso,
                        awayIso: m.away.iso,
                        round: `Group ${letter}`,
                        date: m.date,
                        venue: m.venue,
                        matchId: competitionMatchId(m.matchId),
                      })
                    }
                    className="relative w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm rounded-md border border-foreground/10 bg-background/60 px-2 py-1.5 hover:border-foreground/30 transition-colors text-left"
                  >
                    <span className="absolute right-1.5 top-0.5 mono text-[8px] text-muted-foreground/70">
                      #{competitionMatchId(m.matchId)}
                    </span>
                    <TeamBadge name={m.home.name} iso={m.home.iso} size={20} />
                    <span className="mono tabular-nums text-center flex items-center gap-1 justify-center">
                      {m.official && (
                        <span
                          className="text-[8px] display tracking-wider px-1 rounded"
                          style={{ color: "var(--stamp-red)", border: "1px solid var(--stamp-red)" }}
                        >
                          FT
                        </span>
                      )}
                      {m.homeGoals}–{m.awayGoals}
                    </span>
                    <TeamBadge
                      name={m.away.name}
                      iso={m.away.iso}
                      size={20}
                      reverse
                    />
                  </button>
                </li>
              ))}
            </div>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

// Competition match id (1-104) from the bracket's internal id: groups are "G{n}", knockouts "K{n}"
// (R32 73-88, R16 89-96, QF 97-100, SF 101-102, Final 104).
function competitionMatchId(idStr: string): number {
  if (idStr.startsWith("G")) return parseInt(idStr.slice(1), 10);
  const n = parseInt(idStr.replace("K", ""), 10);
  return n === 31 ? 104 : 72 + n;
}

function KnockoutColumn({
  title,
  matches,
  onOpenMatch,
}: {
  title: string;
  matches: KnockoutResult[];
  onOpenMatch: (m: MatchRef) => void;
}) {
  return (
    <div className="mb-8">
      <h3 className="display tracking-wide text-muted-foreground mb-3">
        {title.toUpperCase()}
      </h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {matches.map((m) => {
          const homeWin = m.winner === "home";
          // Level KO scoreline => decided on penalties (the advancing team's badge stays highlighted).
          const isLevel = m.homeGoals === m.awayGoals;
          return (
            <button
              type="button"
              key={m.matchId}
              onClick={() =>
                onOpenMatch({
                  home: m.home.name,
                  away: m.away.name,
                  homeIso: m.home.iso,
                  awayIso: m.away.iso,
                  round: title,
                  date: m.date,
                  venue: m.venue,
                  matchId: competitionMatchId(m.matchId),
                })
              }
              className="text-left w-full rounded-md border border-foreground/15 bg-card px-3 py-2 hover:border-foreground/40 transition-colors"
            >
              <div className="flex items-center justify-end text-[10px] mono uppercase tracking-wider text-muted-foreground mb-1">
                <span className="flex items-center gap-1.5">
                  {isLevel && (
                    <span style={{ color: "var(--stamp-red)" }}>
                      pens · {m.winnerTeam.name}
                    </span>
                  )}
                  <span className="rounded border border-foreground/20 px-1">
                    #{competitionMatchId(m.matchId)}
                  </span>
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
                <TeamBadge
                  name={m.home.name}
                  iso={m.home.iso}
                  size={20}
                  className={homeWin ? "" : "opacity-50"}
                />
                <span className="mono tabular-nums text-center">
                  <span className={isLevel || homeWin ? "" : "opacity-50"}>
                    {m.homeGoals}
                  </span>
                  <span className="text-muted-foreground"> – </span>
                  <span className={isLevel || !homeWin ? "" : "opacity-50"}>
                    {m.awayGoals}
                  </span>
                </span>
                <TeamBadge
                  name={m.away.name}
                  iso={m.away.iso}
                  size={20}
                  reverse
                  className={homeWin ? "opacity-50" : ""}
                />
              </div>
              {/* Live Elo — climbs with each round survived (group bonus + goal + stage boosts). */}
              <div className="mt-1 flex items-center justify-between text-[9px] mono tabular-nums text-muted-foreground/80">
                <span>ELO {m.homeElo}</span>
                <span>ELO {m.awayElo}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
