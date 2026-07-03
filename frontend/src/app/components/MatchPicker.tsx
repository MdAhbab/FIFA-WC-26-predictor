import { motion } from "motion/react";
import type { KnockoutResult } from "../lib/PicksContext";
import { usePicks } from "../lib/PicksContext";
import { TeamSticker } from "./TeamSticker";

interface Props {
  match: KnockoutResult;
  onPick?: (side: "home" | "away") => void;
  /** "live" if user can pick, "locked" for ML-only stages, "preview" for upcoming */
  mode: "live" | "locked" | "preview";
}

const ROUND_LABEL: Record<string, string> = {
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  Final: "FINAL",
};

// Rounds where goal adjustment is allowed (R32, R16, QF)
const GOAL_EDITABLE_ROUNDS = new Set(["R32", "R16", "QF"]);

function getNumericMatchId(idStr: string): number {
  const num = parseInt(idStr.replace("K", ""), 10);
  if (num === 31) return 104;
  return 72 + num;
}

export function MatchPicker({ match, onPick, mode }: Props) {
  const homeWin = match.winner === "home";
  const { setKoGoals, setKoWinner, state } = usePicks();
  const goalsEditable = mode === "live" && GOAL_EDITABLE_ROUNDS.has(match.round);
  const userGoals = state.knockoutGoals?.[match.matchId];
  // makeKO already folds these overrides into the match, so match.{home,away}Goals are authoritative.
  const displayHomeGoals = match.homeGoals;
  const displayAwayGoals = match.awayGoals;
  // A knockout cannot end level: a level scoreline means it was decided on penalties. This stays
  // coherent even when the user nudges the goals to a draw with the steppers — `match.winnerTeam`
  // (the ML advancer, or the side the user crowned) goes through on the shootout.
  const isLevel = displayHomeGoals === displayAwayGoals;
  const showPens = mode !== "preview" && isLevel;

  function adjustGoal(side: "home" | "away", delta: number) {
    const curr = userGoals ?? { home: match.homeGoals, away: match.awayGoals };
    const next = { ...curr, [side]: Math.max(0, Math.min(20, curr[side] + delta)) };
    setKoGoals(match.matchId, next);
    // Keep the crowned team in sync with the scoreline: a decisive edit auto-switches the winner to
    // the higher-scoring side; a level edit leaves the current pick to advance on penalties.
    if (next.home !== next.away) {
      setKoWinner(match.matchId, next.home > next.away ? "home" : "away");
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative rounded-[14px] border-2 border-foreground/15 bg-card p-3 sm:p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="display text-[11px] tracking-[0.2em] text-muted-foreground">
            {ROUND_LABEL[match.round]} · #{getNumericMatchId(match.matchId)}
          </span>
          {showPens && (
            <span className="text-[10px] display tracking-widest text-[var(--stamp-red)] border border-[var(--stamp-red)] px-1 rounded">
              PENS
            </span>
          )}
        </div>
        {match.official ? (
          <span className="text-[10px] display tracking-widest px-1 rounded border"
            style={{ color: "var(--stamp-red)", borderColor: "var(--stamp-red)" }}>
            FINAL · OFFICIAL
          </span>
        ) : mode === "locked" && match.autoPredicted && (
          <span className="text-[10px] mono uppercase text-muted-foreground">
            ML pick
          </span>
        )}
        {match.userOverride && (
          <span className="text-[10px] display tracking-widest text-[var(--foil-magenta)]">
            YOURS
          </span>
        )}
        {userGoals && !match.official && (
          <span className="text-[10px] display tracking-widest text-[var(--foil-gold)]">
            SCORED
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_5.5rem_1fr] items-center gap-2 sm:gap-3">
        <div className="flex justify-center min-w-0">
          <TeamSticker
            team={match.home}
            size="sm"
            eloOverride={match.homeElo}
            selected={mode !== "preview" && homeWin}
            dim={mode !== "preview" && !homeWin}
            onClick={mode === "live" ? () => onPick?.("home") : undefined}
          />
        </div>
        {/* Fixed-width centre column so a penalty caption never squeezes the team cards out of shape. */}
        <div className="text-center px-0.5 w-[5.5rem] mx-auto">
          {mode === "preview" ? (
            <div className="display text-2xl text-muted-foreground">vs</div>
          ) : (
            <div className="mono text-3xl sm:text-4xl tabular-nums leading-none">
              <span className={isLevel || homeWin ? "" : "opacity-40"}>
                {displayHomeGoals}
              </span>
              <span className="text-muted-foreground mx-1">–</span>
              <span className={isLevel || !homeWin ? "" : "opacity-40"}>
                {displayAwayGoals}
              </span>
            </div>
          )}
          {showPens && (
            <div className="text-[9px] mono uppercase tracking-wider text-[var(--stamp-red)] mt-1 leading-tight break-words">
              {match.winnerTeam.name} win on pens
            </div>
          )}
          <div className="text-[9px] mono uppercase tracking-wider text-muted-foreground mt-1">
            {match.date}
          </div>
        </div>
        <div className="flex justify-center min-w-0">
          <TeamSticker
            team={match.away}
            size="sm"
            eloOverride={match.awayElo}
            selected={mode !== "preview" && !homeWin}
            dim={mode !== "preview" && homeWin}
            onClick={mode === "live" ? () => onPick?.("away") : undefined}
          />
        </div>
      </div>

      {/* Goal adjustment steppers — shown on R32/R16/QF in live mode */}
      {goalsEditable && (
        <div className="mt-3 flex items-center justify-center gap-4 select-none">
          {/* Home goals */}
          <div className="flex items-center gap-1.5">
            <button
              aria-label="Decrease home goals"
              onClick={() => adjustGoal("home", -1)}
              className="size-6 rounded border border-foreground/20 text-xs flex items-center justify-center hover:bg-muted transition-colors"
            >−</button>
            <span className="mono text-xs tabular-nums w-4 text-center">{displayHomeGoals}</span>
            <button
              aria-label="Increase home goals"
              onClick={() => adjustGoal("home", 1)}
              className="size-6 rounded border border-foreground/20 text-xs flex items-center justify-center hover:bg-muted transition-colors"
            >+</button>
          </div>

          <span className="text-[9px] mono uppercase tracking-widest text-muted-foreground">
            adjust goals
            <span className="block text-[8px] mt-0.5" style={{ color: "var(--foil-gold)" }}>
              +3 Elo/goal boost
            </span>
          </span>

          {/* Away goals */}
          <div className="flex items-center gap-1.5">
            <button
              aria-label="Decrease away goals"
              onClick={() => adjustGoal("away", -1)}
              className="size-6 rounded border border-foreground/20 text-xs flex items-center justify-center hover:bg-muted transition-colors"
            >−</button>
            <span className="mono text-xs tabular-nums w-4 text-center">{displayAwayGoals}</span>
            <button
              aria-label="Increase away goals"
              onClick={() => adjustGoal("away", 1)}
              className="size-6 rounded border border-foreground/20 text-xs flex items-center justify-center hover:bg-muted transition-colors"
            >+</button>
          </div>
        </div>
      )}

      {mode === "live" && !goalsEditable && (
        <div className="mt-3 text-center text-[10px] mono uppercase tracking-wider text-muted-foreground">
          Tap a team to crown them
        </div>
      )}
    </motion.div>
  );
}
