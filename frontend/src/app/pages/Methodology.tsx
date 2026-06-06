import { useSEO } from "../lib/useSEO";
import { AdSlot } from "../components/AdSlot";

export default function Methodology() {
  useSEO({
    title: "Methodology · FIFA World Cup '26 Predictor",
    description:
      "How the FIFA World Cup '26 Predictor engine works: 2014–2026 international data, tanh-compressed Elo, Poisson goal model, tournament-form bias, and pre-computed championship probabilities.",
  });

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-12">
      <header className="mb-8">
        <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
          The method
        </div>
        <h1 className="mt-1">HOW THE MACHINE PICKS</h1>
      </header>

      <article className="space-y-7 text-muted-foreground leading-relaxed">
        <p>
          The FIFA World Cup '26 Predictor was trained on{" "}
          <strong className="text-foreground">
            ~12,000 senior international matches played between 2014 and 2026
          </strong>{" "}
          — friendlies, Nations Leagues, continental championships, qualifiers,
          and the 2018, 2022 World Cups. The extended window captures the
          full modern era of international football while keeping the model
          grounded in current squads and tactics.
        </p>

        <Section title="Features the model sees">
          <p className="mb-3">
            A key design decision was keeping the feature set{" "}
            <strong className="text-foreground">tight and non-redundant</strong>.
            Each signal is compressed through a{" "}
            <strong className="text-foreground">tanh function</strong> before
            being fed to the model, which prevents extreme Elo gaps (e.g. Spain
            vs. a minnow) from dominating predictions and causing overfitting.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-foreground">elo_diff_c</strong> — tanh-compressed
              Elo rating difference between the two teams (single, non-redundant signal).
            </li>
            <li>
              <strong className="text-foreground">fifa_diff_c</strong> — tanh-compressed
              FIFA ranking points difference.
            </li>
            <li>
              <strong className="text-foreground">form_diff_c</strong> — tanh-compressed
              recent form difference (goals for/against over the last 10 matches,
              exponentially decayed).
            </li>
            <li>
              <strong className="text-foreground">own_attack / opp_defence</strong> — raw
              attacking output and defensive solidity for each side.
            </li>
            <li>
              <strong className="text-foreground">att_def_c</strong> — combined
              attack-vs-defence interaction signal.
            </li>
            <li>
              <strong className="text-foreground">is_home / neutral / is_world_cup</strong> —
              venue and competition-type flags.
            </li>
          </ul>
        </Section>

        <Section title="Goal model">
          <p>
            Expected goals are produced by a{" "}
            <strong className="text-foreground">
              Histogram Gradient-Boosted Poisson regressor
            </strong>{" "}
            — shallow trees (max depth 3), moderate L2 regularisation, trained
            in long format (one row per team per match). The Poisson objective
            naturally models football's count-based scoring. Expected goals
            are then turned into a full scoreline matrix using a{" "}
            <strong className="text-foreground">Dixon–Coles</strong> correction
            that accounts for the real-world correlation seen in low-scoring
            results (0–0, 1–0, 0–1, 1–1).
          </p>
        </Section>

        <Section title="Tournament-form bias">
          <p>
            Once group stage results are resolved, teams carry a{" "}
            <strong className="text-foreground">World Cup form boost</strong>{" "}
            into the knockout rounds. Group winners receive a{" "}
            <strong className="text-foreground">+30 Elo</strong> bonus and
            runners-up receive{" "}
            <strong className="text-foreground">+15 Elo</strong>, reflecting
            the momentum that in-tournament performance gives a squad. The
            lambda (expected goals) matrix for knockouts is rebuilt from these
            adjusted ratings, so a surprise group winner will genuinely punch
            above their base Elo in the Round of 32.
          </p>
        </Section>

        <Section title="Choosing one scoreline">
          <p>
            For each fixture we report the{" "}
            <strong className="text-foreground">
              expected-value-optimal scoreline
            </strong>{" "}
            — the result that minimises Brier-score across the joint
            distribution, rather than the single most likely cell. Knockout
            draws are resolved through an after-extra-time matrix; penalty
            shootout probability is weighted by Elo with realistic noise.
          </p>
        </Section>

        <Section title="The title race">
          <p>
            The champion / finalist / semi-finalist probabilities on the cover
            are sourced from{" "}
            <strong className="text-foreground">pre-computed market data</strong>{" "}
            seeded by thousands of Monte-Carlo simulations of the full 104-match
            tournament. Each simulation samples scorelines from the goal model,
            plays the groups, picks the eight best third-placed qualifiers,
            and resolves every knockout match (including penalties). Pre-computing
            these probabilities means the site loads instantly with no VM overhead
            per visitor, while still reflecting a statistically grounded title race.
          </p>
        </Section>

        <Section title="Learning from live results">
          <p>
            As official match results are confirmed during the tournament, each
            one feeds back through a lightweight{" "}
            <strong className="text-foreground">incremental Elo update</strong>{" "}
            for both teams. The model state is replayed from scratch on every
            result change — making updates idempotent and drift-free. Completed
            fixtures are locked to their real scores, all remaining predictions
            are recomputed, and the prediction cache is invalidated — so
            forecasts sharpen continuously as the tournament unfolds, with no
            expensive model retrain.
          </p>
        </Section>

        <AdSlot variant="in-article" />

        <Section title="Where your picks come in">
          <p>
            On the Play page, every match is{" "}
            <strong className="text-foreground">pre-filled</strong> with the
            ML's call. Every change you make — a swapped group ranking, a
            different R32 winner — re-derives the rest of the bracket
            downstream using the same model. If you crown a surprise group
            winner, they carry the tournament-form Elo boost into their
            knockout matches. You're always playing against the machine's
            view, not on top of empty data.
          </p>
        </Section>

        <Section title="A note on accuracy">
          <p>
            International football is loud. Even a strong model gets the
            outright winner roughly once every three or four tournaments. Treat
            the single results on this site as the model's best guess from a
            wide distribution, not a forecast of certainty.
          </p>
        </Section>

        <Section title="Disclaimer">
          <p>
            This is a content site about an ML hobby project. Predictions are{" "}
            <strong className="text-foreground">
              for entertainment only
            </strong>{" "}
            and must not be used as betting advice.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-foreground mb-2">{title.toUpperCase()}</h2>
      {children}
    </section>
  );
}
