import { useSEO } from "../lib/useSEO";

export default function Disclaimer() {
  useSEO({
    title: "Disclaimer · FIFA World Cup '26 Predictor",
    description:
      "Disclaimer for the FIFA World Cup '26 Predictor — entertainment-only ML predictions, not betting advice.",
  });

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-12">
      <header className="mb-8">
        <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
          Read this first
        </div>
        <h1 className="mt-1">DISCLAIMER</h1>
        <p className="mono text-[11px] uppercase tracking-wider text-muted-foreground mt-2">
          Last updated · {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long" })}
        </p>
      </header>

      <div
        className="rounded-[14px] border-2 border-foreground/30 bg-card p-5 mb-8"
        style={{ background: "color-mix(in oklab, var(--stamp-red) 8%, var(--card))" }}
      >
        <span className="stamp" style={{ color: "var(--stamp-red)" }}>
          Entertainment only
        </span>
        <p className="mt-3 text-foreground leading-relaxed">
          Every scoreline, bracket and probability on this site is the output
          of a machine-learning model. Treat them as a fun reference point —
          not as a forecast, not as financial advice, and{" "}
          <strong>absolutely not as betting tips</strong>.
        </p>
      </div>

      <article className="space-y-6 text-muted-foreground leading-relaxed">
        <Section title="No affiliation with FIFA">
          <p>
            FIFA World Cup '26 Predictor is an independent, fan-made content
            project. It is not produced, endorsed, sponsored or otherwise
            connected to FIFA, the 2026 FIFA World Cup organising committee,
            any participating football federation, or any official broadcaster
            or sponsor. The terms &ldquo;FIFA&rdquo;, &ldquo;World Cup&rdquo;
            and all team names and crests remain the property of their
            respective owners.
          </p>
        </Section>

        <Section title="Accuracy">
          <p>
            The model behind the Site is trained on publicly available
            international match data. Football is highly variable: even the
            strongest model gets the outright winner correct only roughly once
            every three or four tournaments. Predictions can and will be
            wrong. We make no warranty, express or implied, regarding the
            accuracy, completeness or timeliness of any content on the Site.
          </p>
        </Section>

        <Section title="No betting advice">
          <p>
            Nothing on this site constitutes a recommendation to place,
            increase, decrease or refrain from any wager. If you choose to
            gamble, do so responsibly, only with funds you can afford to lose,
            and only where it is legal for you to do so. If gambling is
            affecting your life, please seek help from a service such as
            BeGambleAware, GamCare, or the helpline available in your
            jurisdiction.
          </p>
        </Section>

        <Section title="Use at your own risk">
          <p>
            Any action you take based on information presented on this Site is
            strictly at your own risk. The operators of the Site will not be
            liable for any losses or damages arising from your use of or
            reliance on the content shown here.
          </p>
        </Section>

        <Section title="External links">
          <p>
            The Site may contain links to third-party websites. We do not
            control or endorse those sites and are not responsible for their
            content or policies.
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-foreground mb-2">{title.toUpperCase()}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
