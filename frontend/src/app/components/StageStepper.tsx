import { Check } from "lucide-react";
import type { Stage } from "../lib/types";
import { usePicks } from "../lib/PicksContext";

const STEPS: { id: Stage; label: string; sub: string }[] = [
  { id: "groups", label: "Groups", sub: "Rank 12 pools" },
  { id: "r32", label: "R32", sub: "16 matches" },
  { id: "r16", label: "R16", sub: "8 matches" },
  { id: "qf", label: "Quarters", sub: "4 matches" },
  { id: "results", label: "Sim", sub: "ML finishes the job" },
];

const STAGE_ORDER: Stage[] = ["intro", "groups", "r32", "r16", "qf", "results"];

export function StageStepper() {
  const { state, gotoStage } = usePicks();
  const currentIdx = STAGE_ORDER.indexOf(state.stage);

  return (
    <nav
      aria-label="Predictor progress"
      className="rounded-[12px] border-2 border-foreground/15 bg-card p-2 mb-6 overflow-x-auto"
    >
      <ol className="flex gap-1 min-w-max">
        {STEPS.map((step, i) => {
          const idx = STAGE_ORDER.indexOf(step.id);
          const isActive = step.id === state.stage;
          const isDone = currentIdx > idx || state.completed[step.id];
          return (
            <li key={step.id} className="flex-1 min-w-[110px]">
              <button
                type="button"
                onClick={() => gotoStage(step.id)}
                className={`w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-foreground text-background"
                    : isDone
                    ? "text-foreground hover:bg-muted"
                    : "text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <span
                  className={`size-6 shrink-0 inline-flex items-center justify-center rounded-full display text-sm ${
                    isActive
                      ? "bg-background text-foreground"
                      : isDone
                      ? "bg-[var(--pitch)] text-background"
                      : "border-2 border-current"
                  }`}
                >
                  {isDone && !isActive ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="display block leading-none text-sm tracking-wide">
                    {step.label.toUpperCase()}
                  </span>
                  <span className="block text-[10px] mono uppercase tracking-wider opacity-70 truncate">
                    {step.sub}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
