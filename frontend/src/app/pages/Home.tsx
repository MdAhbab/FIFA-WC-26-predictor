import { Link } from "react-router";
import { motion } from "motion/react";
import { ArrowRight, Trophy } from "lucide-react";
import { useMemo } from "react";
import { useSEO } from "../lib/useSEO";
import { getMLBracket, teamChampionProbabilities } from "../lib/PicksContext";
import { TeamSticker } from "../components/TeamSticker";
import { AdSlot } from "../components/AdSlot";
import { FanVote } from "../components/FanVote";

export default function Home() {
  useSEO({
    title: "FIFA World Cup '26 Predictor — Pick groups, plan knockouts, let the ML finish",
    description:
      "A gamified, ML-powered predictor for the 2026 FIFA World Cup. Pick your groups, plan the knockouts, let the model finish the job.",
  });

  const ml = useMemo(() => getMLBracket(), []);
  const topProbs = useMemo(() => teamChampionProbabilities().slice(0, 6), []);
  const finalMatch = ml.final;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-12">
      {/* Cover masthead */}
      <section className="relative overflow-hidden rounded-[18px] border-2 border-foreground/85 bg-card">
        <div
          className="halftone absolute inset-0 text-foreground pointer-events-none"
          aria-hidden
        />
        <div className="relative grid lg:grid-cols-[1.3fr_1fr] gap-8 px-5 sm:px-10 py-10 sm:py-14">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <span className="stamp" style={{ color: "var(--stamp-red)" }}>
                Issue 01 · Summer '26
              </span>
              <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                USA · Canada · Mexico
              </span>
            </div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="leading-[0.92]"
            >
              <span className="block">FIFA WORLD CUP</span>
              <span className="foil-text block">'26 PREDICTOR</span>
            </motion.h1>

            <p className="max-w-md text-muted-foreground">
              You, the manager, draw up every group, swap winners in the
              knockouts, and our Elo + Poisson model finishes the bracket.
              104 matches. 48 teams. One trophy.
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <Link
                to="/play"
                className="inline-flex items-center gap-2 rounded-md bg-foreground text-background display tracking-wider uppercase px-5 py-3 hover:translate-y-[-2px] hover:shadow-[3px_5px_0_var(--stamp-red)] transition-all"
              >
                Start the album <ArrowRight className="size-4" />
              </Link>
              <Link
                to="/predictions"
                className="inline-flex items-center gap-2 rounded-md border-2 border-foreground display tracking-wider uppercase px-5 py-3 hover:bg-muted transition-colors"
              >
                See the ML's pick
              </Link>
            </div>
          </div>

          {/* ML champion sticker */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
            animate={{ opacity: 1, scale: 1, rotate: -2 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="relative mx-auto w-full max-w-sm"
          >
            <div className="relative ticket bg-card border-2 border-foreground p-5 text-center">
              <div className="halftone absolute inset-0 opacity-30 text-foreground pointer-events-none" />
              <div className="relative">
                <Trophy
                  className="size-7 mx-auto mb-1"
                  style={{ color: "var(--foil-gold)" }}
                />
                <div className="display tracking-[0.3em] text-[11px] text-muted-foreground">
                  THE MODEL SAYS
                </div>
                {ml.champion && (
                  <>
                    <img
                      src={`https://flagcdn.com/w320/${ml.champion.iso}.png`}
                      alt={ml.champion.name}
                      className="mx-auto mt-3 rounded-sm border-2 border-foreground/20"
                      style={{ width: 160, height: 110, objectFit: "cover" }}
                    />
                    <div className="mt-3 display text-3xl tracking-tight">
                      {ml.champion.name.toUpperCase()}
                    </div>
                    <div className="text-xs mono uppercase tracking-widest text-muted-foreground">
                      Lifts the cup at {finalMatch?.venue}
                    </div>
                  </>
                )}
              </div>
              <span
                className="absolute -top-3 -left-3 stamp"
                style={{ color: "var(--stamp-red)" }}
              >
                PREDICTED
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-10 grid sm:grid-cols-3 gap-4">
        {[
          {
            n: "01",
            t: "Rank the pools",
            d: "Reorder every 4-team group. Top 2 + 8 best-thirds advance.",
          },
          {
            n: "02",
            t: "Pick the knockouts",
            d: "Tap a sticker to crown the winner — R32 through Quarters.",
          },
          {
            n: "03",
            t: "Let the model finish",
            d: "ML auto-plays the Semis and Final. Champion revealed.",
          },
        ].map((step) => (
          <div
            key={step.n}
            className="rounded-[14px] border-2 border-foreground/15 bg-card p-5"
          >
            <div
              className="display text-5xl leading-none"
              style={{ color: "var(--foil-magenta)" }}
            >
              {step.n}
            </div>
            <div className="display text-xl mt-2 tracking-wide">{step.t}</div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {step.d}
            </p>
          </div>
        ))}
      </section>

      <AdSlot variant="leaderboard" />

      {/* Fan vote — pick 2 teams to win, see everyone's calls */}
      <section className="mt-4">
        <FanVote />
      </section>

      {/* Title race teaser */}
      <section className="mt-4 rounded-[14px] border-2 border-foreground/15 bg-card p-5 sm:p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="display tracking-wide">FAVOURITES BOARD</h2>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Champion · prior probability
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {topProbs.map((p, i) => (
            <div
              key={p.team.name}
              className="flex items-center gap-3 rounded-md border border-foreground/10 bg-background/60 px-3 py-2"
            >
              <span className="display text-2xl w-7 text-center text-muted-foreground">
                {i + 1}
              </span>
              <img
                src={`https://flagcdn.com/w40/${p.team.iso}.png`}
                alt=""
                width={28}
                height={20}
                className="rounded-[2px] shadow-[0_0_0_1px_rgba(24,18,14,0.18)] shrink-0"
              />
              <span className="flex-1 truncate text-sm">{p.team.name}</span>
              <span className="mono text-sm tabular-nums">
                {(p.prob * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </section>

      <AdSlot variant="rectangle" />
    </main>
  );
}
