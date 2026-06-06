import { motion } from "motion/react";
import type { KnockoutResult } from "../lib/PicksContext";
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

export function MatchPicker({ match, onPick, mode }: Props) {
  const homeWin = match.winner === "home";
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
            {ROUND_LABEL[match.round]} · ×{match.multiplier}
          </span>
          {match.penalties && (
            <span className="text-[10px] display tracking-widest text-[var(--stamp-red)] border border-[var(--stamp-red)] px-1 rounded">
              PENS
            </span>
          )}
        </div>
        {mode === "locked" && match.autoPredicted && (
          <span className="text-[10px] mono uppercase text-muted-foreground">
            ML pick
          </span>
        )}
        {match.userOverride && (
          <span className="text-[10px] display tracking-widest text-[var(--foil-magenta)]">
            YOURS
          </span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4">
        <div className="flex justify-center min-w-0">
          <TeamSticker
            team={match.home}
            size="sm"
            selected={mode !== "preview" && homeWin}
            dim={mode !== "preview" && !homeWin}
            onClick={mode === "live" ? () => onPick?.("home") : undefined}
          />
        </div>
        <div className="text-center px-1">
          {mode === "preview" ? (
            <div className="display text-2xl text-muted-foreground">vs</div>
          ) : (
            <div className="mono text-3xl sm:text-4xl tabular-nums leading-none">
              <span className={homeWin ? "" : "opacity-40"}>
                {match.homeGoals}
              </span>
              <span className="text-muted-foreground mx-1">–</span>
              <span className={!homeWin ? "" : "opacity-40"}>
                {match.awayGoals}
              </span>
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
            selected={mode !== "preview" && !homeWin}
            dim={mode !== "preview" && homeWin}
            onClick={mode === "live" ? () => onPick?.("away") : undefined}
          />
        </div>
      </div>

      {mode === "live" && (
        <div className="mt-3 text-center text-[10px] mono uppercase tracking-wider text-muted-foreground">
          Tap a team to crown them
        </div>
      )}
    </motion.div>
  );
}
