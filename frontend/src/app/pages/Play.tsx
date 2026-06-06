import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useSEO } from "../lib/useSEO";
import { usePicks } from "../lib/PicksContext";
import type { Stage } from "../lib/types";
import { GROUP_LETTERS } from "../lib/data";
import { GroupRanker } from "../components/GroupRanker";
import { MatchPicker } from "../components/MatchPicker";
import { StageStepper } from "../components/StageStepper";
import { TeamSticker } from "../components/TeamSticker";
import { AdSlot } from "../components/AdSlot";

const NEXT_STAGE: Record<Stage, Stage> = {
  intro: "groups",
  groups: "r32",
  r32: "r16",
  r16: "qf",
  qf: "results",
  results: "results",
};

export default function Play() {
  useSEO({
    title: "Play · FIFA World Cup '26 Predictor",
    description:
      "Pick the 2026 FIFA World Cup yourself: rank the groups, choose the knockouts, hand it over to the ML for the final stretch.",
  });
  const { state, gotoStage } = usePicks();

  useEffect(() => {
    if (state.stage === "intro") gotoStage("groups");
  }, [state.stage, gotoStage]);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-12">
      <StageStepper />
      <AnimatePresence mode="wait">
        <motion.div
          key={state.stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {state.stage === "groups" && <GroupsStage />}
          {state.stage === "r32" && (
            <KnockoutStage round="R32" title="Round of 32" />
          )}
          {state.stage === "r16" && (
            <KnockoutStage round="R16" title="Round of 16" />
          )}
          {state.stage === "qf" && (
            <KnockoutStage round="QF" title="Quarter-finals" />
          )}
          {state.stage === "results" && <ResultsStage />}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

// ---------- Groups stage ----------
function GroupsStage() {
  const { markComplete, gotoStage, autoFillAll, resetPicks } = usePicks();
  return (
    <section>
      <StageHeader
        eyebrow="Stage 1 of 5"
        title="Rank the 12 groups"
        body="The ML has already ranked each pool. Reorder with the arrows when you disagree — top 2 advance; the 8 strongest 3rd-placers join them."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUP_LETTERS.map((g, i) => (
          <div key={g}>
            <GroupRanker group={g} />
            {i === 5 && (
              <div className="md:col-span-2 lg:col-span-3">
                <AdSlot variant="leaderboard" />
              </div>
            )}
          </div>
        ))}
      </div>
      <StageFooter
        onContinue={() => {
          markComplete("groups");
          gotoStage("r32");
        }}
        onAutoFill={() => {
          autoFillAll();
        }}
        onReset={resetPicks}
        continueLabel="Lock groups → R32"
      />
    </section>
  );
}

// ---------- Knockout stage ----------
function KnockoutStage({
  round,
  title,
}: {
  round: "R32" | "R16" | "QF";
  title: string;
}) {
  const { bracket, setKoWinner, markComplete, gotoStage, autoFillAll, state } =
    usePicks();
  const matches =
    round === "R32" ? bracket.r32 : round === "R16" ? bracket.r16 : bracket.qf;

  const made = matches.filter((m) => state.knockoutPicks[m.matchId]).length;
  const stageId: Stage = round === "R32" ? "r32" : round === "R16" ? "r16" : "qf";

  return (
    <section>
      <StageHeader
        eyebrow={`Stage ${round === "R32" ? 2 : round === "R16" ? 3 : 4} of 5`}
        title={title}
        body={`Tap a team to crown them. Untouched matches use the ML's pick — ${made}/${matches.length} on the card so far.`}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matches.map((m, i) => (
          <div key={m.matchId}>
            <MatchPicker
              match={m}
              mode="live"
              onPick={(side) => setKoWinner(m.matchId, side)}
            />
            {round === "R32" && i === 5 && (
              <div className="sm:col-span-2 lg:col-span-3">
                <AdSlot variant="in-article" />
              </div>
            )}
          </div>
        ))}
      </div>
      <StageFooter
        onContinue={() => {
          markComplete(stageId);
          gotoStage(NEXT_STAGE[stageId]);
        }}
        onAutoFill={autoFillAll}
        continueLabel={
          round === "QF"
            ? "Hand it to the ML → Sim"
            : `Continue → ${
                NEXT_STAGE[stageId] === "r16"
                  ? "R16"
                  : NEXT_STAGE[stageId] === "qf"
                  ? "QF"
                  : "Sim"
              }`
        }
      />
    </section>
  );
}

// ---------- Results stage ----------
function ResultsStage() {
  const { bracket, resetPicks } = usePicks();
  const champion = bracket.champion;
  return (
    <section>
      <StageHeader
        eyebrow="Stage 5 of 5"
        title="The model takes it home"
        body="With your bracket locked through the quarters, the ML simulates the semis and final."
      />

      {/* Champion ticket */}
      <div className="mx-auto max-w-md ticket bg-card border-2 border-foreground p-6 text-center relative my-6">
        <div className="halftone absolute inset-0 text-foreground pointer-events-none opacity-25" />
        <div className="relative">
          <Trophy
            className="size-8 mx-auto mb-1"
            style={{ color: "var(--foil-gold)" }}
          />
          <div className="display tracking-[0.3em] text-[11px] text-muted-foreground">
            CHAMPION
          </div>
          {champion && (
            <>
              <img
                src={`https://flagcdn.com/w320/${champion.iso}.png`}
                alt={champion.name}
                className="mx-auto mt-3 rounded-sm border-2 border-foreground/20"
                style={{ width: 200, height: 140, objectFit: "cover" }}
              />
              <div className="mt-3 display text-4xl tracking-tight">
                {champion.name.toUpperCase()}
              </div>
            </>
          )}
        </div>
        <span
          className="absolute -top-3 -right-3 stamp"
          style={{ color: "var(--stamp-red)" }}
        >
          ML CALL
        </span>
      </div>

      {/* SF + Final */}
      <div className="grid md:grid-cols-3 gap-3 mb-8">
        {bracket.sf.map((m) => (
          <MatchPicker key={m.matchId} match={m} mode="locked" />
        ))}
        {bracket.final && (
          <div className="md:col-span-1 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 stamp z-10" style={{color: "var(--foil-magenta)"}}>FINAL</div>
            <MatchPicker match={bracket.final} mode="locked" />
          </div>
        )}
      </div>

      <AdSlot variant="leaderboard" />

      {/* Your bracket trail */}
      <section className="mt-8 rounded-[14px] border-2 border-foreground/15 bg-card p-5">
        <h2 className="display tracking-wide mb-3">Your bracket, in stickers</h2>
        <div className="space-y-3">
          <Trail label="Your final 4" teams={bracket.qf.map((m) => m.winnerTeam)} />
          <Trail
            label="Last 8"
            teams={bracket.r16.map((m) => m.winnerTeam)}
          />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resetPicks}
          className="inline-flex items-center gap-2 rounded-md border-2 border-foreground display uppercase tracking-wider px-4 py-2 hover:bg-muted transition-colors"
        >
          <RotateCcw className="size-4" /> Start over
        </button>
      </div>
    </section>
  );
}

function Trail({
  label,
  teams,
}: {
  label: string;
  teams: { name: string; iso: string; elo: number; group: string }[];
}) {
  return (
    <div>
      <div className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {teams.map((t, i) => (
          <TeamSticker
            key={`${t.name}-${i}`}
            team={t}
            size="sm"
            rotation={((i % 3) - 1) * 1.2}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Shared bits ----------
function StageHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header className="mb-6">
      <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
        {eyebrow}
      </div>
      <h1 className="mt-1">{title.toUpperCase()}</h1>
      <p className="mt-2 text-muted-foreground max-w-2xl">{body}</p>
    </header>
  );
}

function StageFooter({
  onContinue,
  onAutoFill,
  onReset,
  continueLabel,
}: {
  onContinue: () => void;
  onAutoFill?: () => void;
  onReset?: () => void;
  continueLabel: string;
}) {
  return (
    <div className="sticky bottom-3 mt-8 z-30">
      <div className="rounded-[14px] border-2 border-foreground bg-background/95 backdrop-blur-md px-4 py-3 flex flex-wrap items-center gap-3 shadow-[0_8px_0_-4px_var(--foreground)]">
        <span className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
          Ready?
        </span>
        {onAutoFill && (
          <button
            type="button"
            onClick={onAutoFill}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground display uppercase tracking-wider px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Sparkles className="size-3.5" />
            Auto-fill rest
          </button>
        )}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground/40 display uppercase tracking-wider px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-foreground text-background display uppercase tracking-wider px-4 py-2 hover:translate-y-[-2px] hover:shadow-[3px_5px_0_var(--stamp-red)] transition-all"
        >
          {continueLabel} <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
