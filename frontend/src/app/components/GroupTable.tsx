import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { GroupMatch, TeamStanding } from "../lib/types";
import { TeamBadge } from "./TeamBadge";
import { MatchCard } from "./MatchCard";

interface Props {
  group: string;
  standings: TeamStanding[];
  matches: GroupMatch[];
}

function statusFor(s: TeamStanding) {
  if (s.qualified)
    return {
      label: "Qualified",
      color: "var(--wc-pitch)",
      bg: "color-mix(in oklab, var(--wc-pitch) 14%, transparent)",
    };
  if (s.best_third_pool)
    return {
      label: "Best 3rd",
      color: "var(--wc-amber)",
      bg: "color-mix(in oklab, var(--wc-amber) 14%, transparent)",
    };
  return {
    label: "Out",
    color: "var(--muted-foreground)",
    bg: "color-mix(in oklab, var(--muted-foreground) 12%, transparent)",
  };
}

export function GroupTable({ group, standings, matches }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-sm"
            style={{
              fontFamily: "var(--font-display)",
              background:
                "linear-gradient(135deg, var(--wc-blue), var(--wc-magenta))",
              color: "white",
            }}
          >
            Group {group}
          </span>
          <span className="text-xs text-muted-foreground">6 matches</span>
        </div>
      </div>
      <table className="w-full">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="text-left font-normal px-4 py-2 w-8">#</th>
            <th className="text-left font-normal py-2">Team</th>
            <th className="text-right font-normal py-2 pr-2">Elo</th>
            <th className="text-right font-normal px-4 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => {
            const st = statusFor(s);
            return (
              <tr key={s.team} className="border-t border-border/60">
                <td className="px-4 py-2 text-muted-foreground tabular-nums">
                  {s.pos}
                </td>
                <td className="py-2">
                  <TeamBadge name={s.team} iso={s.iso} size={24} />
                </td>
                <td className="text-right py-2 pr-2 tabular-nums text-muted-foreground">
                  {s.elo}
                </td>
                <td className="text-right px-4 py-2">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[11px]"
                    style={{ color: st.color, background: st.bg }}
                  >
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-t border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <span>{open ? "Hide" : "Show"} match predictions</span>
        <ChevronDown
          className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="grid gap-2 px-4 pb-4">
              {matches.map((m) => (
                <div key={m.match_id} className="space-y-1">
                  <MatchCard
                    home={m.home}
                    away={m.away}
                    homeIso={m.home_iso}
                    awayIso={m.away_iso}
                    homeGoals={m.home_goals}
                    awayGoals={m.away_goals}
                    winner={m.winner}
                    meta={`${m.date} · ${m.venue}`}
                    compact
                  />
                  <div className="text-[11px] text-muted-foreground px-1 flex gap-3">
                    <span>{m.corners} corners</span>
                    <span>{m.yellows} yellows</span>
                    {m.reds > 0 && <span>{m.reds} red</span>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
