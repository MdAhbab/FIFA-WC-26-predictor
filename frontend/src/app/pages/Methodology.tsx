import { useSEO } from "../lib/useSEO";
import { AdSlot } from "../components/AdSlot";

export default function Methodology() {
  useSEO({
    title: "Methodology · FIFA World Cup '26 Predictor",
    description:
      "How the FIFA World Cup '26 Predictor engine works: 2022–2026 international data, Elo, Poisson goal model, and Monte-Carlo simulations.",
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
            ~3,800 senior international matches played between 2022 and 2026
          </strong>{" "}
          — friendlies, Nations Leagues, continental finals, qualifiers and the
          2022 World Cup itself. We deliberately kept the training window short
          and recent so the model reflects the squads, tactics and form on the
          pitch right now, not who looked good a decade ago.
        </p>

        <Section title="Features the model sees">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              Pre-match Elo rating for each side, updated after every fixture
              the model has seen.
            </li>
            <li>
              Rolling weighted form (goals for and against over the previous 10
              matches, exponentially decayed).
            </li>
            <li>
              FIFA world ranking points and confederation strength priors.
            </li>
            <li>
              Venue effects — home advantage, neutrality, altitude where it
              matters.
            </li>
            <li>
              Squad availability flags for the squad named on the deadline.
            </li>
          </ul>
        </Section>

        <Section title="Goal model">
          <p>
            Expected goals come from a{" "}
            <strong className="text-foreground">
              gradient-boosted Poisson regressor
            </strong>{" "}
            (a histogram gradient-boosting model with a Poisson objective) trained in long format —
            one row per team per match. Those expected goals are turned into a full scoreline
            distribution with a{" "}
            <strong className="text-foreground">Dixon–Coles</strong> adjustment that corrects the
            low-score correlation real football shows, so we get the probability of every plausible
            scoreline, not just a winner.
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
            draws are decided on penalties, weighted slightly toward the higher
            Elo with noise.
          </p>
        </Section>

        <Section title="The title race">
          <p>
            The champion / finalist / semi-finalist probabilities you see on the cover come from{" "}
            <strong className="text-foreground">thousands of Monte-Carlo simulations</strong> of the
            entire 104-match tournament. Each run samples real scorelines from the goal model, plays
            the groups, allocates the eight best third-placed teams, and resolves every knockout tie
            (with penalties for draws). This matters: a single strongest team still has to survive
            seven knockout rounds, so simulating the bracket keeps the favourite&rsquo;s odds
            realistic instead of letting one team run away with the board.
          </p>
        </Section>

        <Section title="Learning from live results">
          <p>
            As official results are finalised during the tournament, each one feeds back into the
            model with a single, lightweight{" "}
            <strong className="text-foreground">Elo update</strong> for both teams. Completed
            fixtures are locked to their real scores, and every remaining probability is
            recomputed — so the predictions sharpen continuously as the tournament unfolds, without
            an expensive retrain.
          </p>
        </Section>

        <AdSlot variant="in-article" />

        <Section title="Where your picks come in">
          <p>
            On the Play page, every match is{" "}
            <strong className="text-foreground">pre-filled</strong> with the
            ML's call. Every change you make — a swapped group ranking, a
            different R16 winner — re-derives the rest of the bracket
            downstream from the same model. So you're always playing against
            the machine's view, not on top of empty data.
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
