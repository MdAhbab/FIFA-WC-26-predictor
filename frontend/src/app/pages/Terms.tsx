import { useSEO } from "../lib/useSEO";

export default function Terms() {
  useSEO({
    title: "Terms & Conditions · FIFA World Cup '26 Predictor",
    description:
      "Terms and conditions for using the FIFA World Cup '26 Predictor website.",
  });

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-12">
      <header className="mb-8">
        <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
          The house rules
        </div>
        <h1 className="mt-1">TERMS &amp; CONDITIONS</h1>
        <p className="mono text-[11px] uppercase tracking-wider text-muted-foreground mt-2">
          Last updated · {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long" })}
        </p>
      </header>

      <article className="space-y-6 text-muted-foreground leading-relaxed">
        <Section title="1. Acceptance">
          <p>
            By visiting FIFA World Cup '26 Predictor (&ldquo;the Site&rdquo;)
            you agree to these Terms. If you do not agree, please stop using
            the Site.
          </p>
        </Section>

        <Section title="2. Not affiliated with FIFA">
          <p>
            The Site is an independent fan project. It is not produced,
            endorsed, sponsored or approved by FIFA, the 2026 FIFA World Cup
            organising committee, any participating football association, or
            any broadcaster or sponsor. All trademarks, team names and
            tournament names are the property of their respective owners and
            are used here for descriptive purposes only.
          </p>
        </Section>

        <Section title="3. Entertainment only — no betting advice">
          <p>
            All predictions, scorelines, probabilities and bracket outcomes on
            the Site are produced by a machine-learning model trained on
            publicly available international match data. They are provided
            for entertainment and curiosity only. They are{" "}
            <strong className="text-foreground">not</strong> betting tips,
            financial advice, investment guidance or any form of recommendation.
            You are solely responsible for any decisions you make on the basis
            of content on the Site.
          </p>
        </Section>

        <Section title="4. No warranties">
          <p>
            The Site is provided &ldquo;as is&rdquo; without warranty of any
            kind, express or implied, including but not limited to fitness for
            a particular purpose, accuracy, completeness or uninterrupted
            availability. Football is loud and the model is wrong sometimes.
            That is part of the joke.
          </p>
        </Section>

        <Section title="5. Limitation of liability">
          <p>
            To the maximum extent permitted by law, the operators of the Site
            shall not be liable for any direct, indirect, incidental, special
            or consequential damages arising out of or in connection with your
            use of the Site, including but not limited to losses incurred from
            gambling on outcomes shown.
          </p>
        </Section>

        <Section title="6. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>scrape, mirror or republish the Site&rsquo;s content commercially without permission;</li>
            <li>circumvent any rate-limit or technical protection on the Site;</li>
            <li>use the Site for any unlawful purpose;</li>
            <li>present Site content as official FIFA or team communication.</li>
          </ul>
        </Section>

        <Section title="7. Third-party content & ads">
          <p>
            The Site embeds advertising and may link to third-party websites.
            We do not control those services and accept no responsibility for
            their content, accuracy or privacy practices.
          </p>
        </Section>

        <Section title="8. Changes">
          <p>
            We may update these Terms at any time. The &ldquo;last
            updated&rdquo; date above will change when we do. Continued use of
            the Site after a change constitutes acceptance of the new Terms.
          </p>
        </Section>

        <Section title="9. Governing law">
          <p>
            These Terms shall be governed by and construed in accordance with
            the laws of your country of habitual residence, without giving
            effect to its conflict-of-laws rules.
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
