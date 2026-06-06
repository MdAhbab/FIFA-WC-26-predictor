import { ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "motion/react";
import { usePicks } from "../lib/PicksContext";
import { teamByName } from "../lib/data";

interface Props {
  group: string;
}

const POS_LABEL: Record<number, { label: string; color: string }> = {
  0: { label: "QUALIFIED · 1ST", color: "var(--pitch)" },
  1: { label: "QUALIFIED · 2ND", color: "var(--pitch)" },
  2: { label: "3RD · BEST-THIRD POOL", color: "var(--mustard)" },
  3: { label: "ELIMINATED", color: "var(--muted-foreground)" },
};

export function GroupRanker({ group }: Props) {
  const { state, swapGroup, bracket } = usePicks();
  const order = state.groupOrder[group] ?? [];

  return (
    <div className="rounded-[14px] border-2 border-foreground/15 bg-card overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-4 pb-2">
        <div className="flex items-baseline gap-2">
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
            {group}
          </span>
          <span className="text-[10px] mono uppercase tracking-wider text-muted-foreground">
            Group {group}
          </span>
        </div>
        <span className="text-[10px] mono uppercase tracking-wider text-muted-foreground">
          Reorder
        </span>
      </div>

      <ul className="px-3 pb-3 space-y-1.5">
        {order.map((teamName, idx) => {
          const team = teamByName(teamName);
          if (!team) return null;
          const posInfo = POS_LABEL[idx];
          const isBestThird = idx === 2 && bracket.bestThirds.has(teamName);
          return (
            <motion.li
              layout
              key={teamName}
              className="flex items-center gap-2 rounded-md border border-foreground/10 bg-background/60 pl-2 pr-1 py-1.5"
            >
              <span
                className="display text-lg w-5 text-center"
                style={{ color: posInfo.color }}
              >
                {idx + 1}
              </span>
              <img
                src={`https://flagcdn.com/w40/${team.iso}.png`}
                alt=""
                width={26}
                height={18}
                className="rounded-[2px] shadow-[0_0_0_1px_rgba(24,18,14,0.15)] shrink-0"
              />
              <span className="flex-1 truncate text-sm">{team.name}</span>
              {idx === 2 && (
                <span
                  className="text-[9px] display tracking-wider px-1 py-0.5 rounded"
                  style={{
                    color: isBestThird ? "var(--mustard)" : "var(--muted-foreground)",
                    border: `1px solid ${
                      isBestThird ? "var(--mustard)" : "color-mix(in oklab, currentColor 30%, transparent)"
                    }`,
                  }}
                >
                  {isBestThird ? "ADV" : "POOL"}
                </span>
              )}
              <span className="text-[10px] mono text-muted-foreground w-10 text-right">
                {team.elo}
              </span>
              <div className="flex flex-col">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={idx === 0}
                  onClick={() => swapGroup(group, idx, idx - 1)}
                  className="size-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={idx === 3}
                  onClick={() => swapGroup(group, idx, idx + 1)}
                  className="size-5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-25"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>
            </motion.li>
          );
        })}
      </ul>
      <div className="px-4 pb-3 -mt-1">
        <div
          className="text-[9px] display tracking-[0.2em] flex items-center justify-between"
          style={{ color: "var(--muted-foreground)" }}
        >
          <span>1–2 ADVANCE</span>
          <span>3RD: BEST-8 POOL</span>
          <span>4TH OUT</span>
        </div>
      </div>
    </div>
  );
}
