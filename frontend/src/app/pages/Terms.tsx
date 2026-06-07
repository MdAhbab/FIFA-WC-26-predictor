import { useSEO } from "../lib/useSEO";
import { CONTACT_EMAIL, SITE_DOMAIN } from "../lib/site";

export default function Terms() {
  useSEO({
    title: "Terms & Conditions · FIFA Worldcup Predictor",
    description:
      "Terms and conditions for using the FIFA Worldcup Predictor website.",
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
        <Section title="1. Acceptance of these terms">
          <p>
            By accessing or using FIFA Worldcup Predictor (&ldquo;the Site&rdquo;) at{" "}
            <span className="text-foreground">{SITE_DOMAIN}</span> you agree to be bound by these
            Terms &amp; Conditions and by our Privacy Policy and Disclaimer, which are incorporated
            by reference. If you do not agree, please stop using the Site. These Terms apply to all
            visitors and users.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>
            The Site is intended for users who are at least 13 years old (or the minimum age of
            digital consent in your jurisdiction). By using the Site you confirm that you meet this
            requirement and that your use complies with all laws applicable to you.
          </p>
        </Section>

        <Section title="3. Not affiliated with FIFA">
          <p>
            The Site is an independent fan project. It is not produced, endorsed, sponsored or
            approved by FIFA, the 2026 FIFA World Cup organising committee, any participating
            football association, or any broadcaster or sponsor. All trademarks, team names, crests
            and tournament names are the property of their respective owners and are used here for
            descriptive and editorial purposes only.
          </p>
        </Section>

        <Section title="4. Entertainment only — no betting advice">
          <p>
            All predictions, scorelines, probabilities, simulations and bracket outcomes on the
            Site are produced by a machine-learning model trained on publicly available
            international match data and run through Monte-Carlo simulation. They are provided for
            entertainment and curiosity only. They are{" "}
            <strong className="text-foreground">not</strong> betting tips, financial advice,
            investment guidance, or any form of recommendation. You are solely responsible for any
            decisions you make on the basis of content on the Site.
          </p>
        </Section>

        <Section title="5. The fan vote and user contributions">
          <p>
            The Site lets you submit anonymous fan-vote selections. By submitting, you grant us a
            non-exclusive, royalty-free licence to display your selection in aggregate, anonymised
            form. You must not submit content that is unlawful, abusive or that infringes the rights
            of others, and you must not attempt to manipulate, automate or distort the aggregate
            vote.
          </p>
        </Section>

        <Section title="6. Intellectual property">
          <p>
            The Site&rsquo;s original design, text, code and model outputs are owned by the Site
            operators or their licensors and are protected by applicable laws. You may view and
            share the Site for personal, non-commercial use. You may not reproduce, redistribute or
            create derivative works from the Site&rsquo;s content for commercial purposes without
            our prior written permission.
          </p>
        </Section>

        <Section title="7. No warranties">
          <p>
            The Site is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without warranty
            of any kind, express or implied, including but not limited to fitness for a particular
            purpose, accuracy, completeness or uninterrupted availability. Football is unpredictable
            and the model is wrong sometimes. That is part of the fun.
          </p>
        </Section>

        <Section title="8. Limitation of liability">
          <p>
            To the maximum extent permitted by law, the operators of the Site shall not be liable
            for any direct, indirect, incidental, special, consequential or exemplary damages
            arising out of or in connection with your use of, or inability to use, the Site —
            including, without limitation, any losses incurred from gambling on outcomes shown.
            Nothing in these Terms excludes liability that cannot lawfully be excluded.
          </p>
        </Section>

        <Section title="9. Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>scrape, mirror or republish the Site&rsquo;s content commercially without permission;</li>
            <li>circumvent, disable or interfere with any security, rate-limit or technical protection;</li>
            <li>use automated means to place a load on the Site that degrades it for others;</li>
            <li>use the Site for any unlawful, fraudulent or harmful purpose;</li>
            <li>present Site content as official FIFA, team or broadcaster communication.</li>
          </ul>
        </Section>

        <Section title="10. Third-party content & ads">
          <p>
            The Site embeds advertising and may link to third-party websites and services. We do not
            control those services and accept no responsibility for their content, accuracy, products
            or privacy practices. Any dealings with third parties are solely between you and them.
          </p>
        </Section>

        <Section title="11. Availability and changes to the Site">
          <p>
            We may modify, suspend or discontinue any part of the Site at any time without notice. We
            are not liable if all or part of the Site is unavailable at any time or for any period.
          </p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>
            We may update these Terms at any time. The &ldquo;last updated&rdquo; date above will
            change when we do. Your continued use of the Site after a change constitutes acceptance
            of the revised Terms.
          </p>
        </Section>

        <Section title="13. Governing law">
          <p>
            These Terms shall be governed by and construed in accordance with the laws of your
            country of habitual residence, without giving effect to its conflict-of-laws rules.
            Nothing in these Terms affects your statutory rights as a consumer.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these Terms can be sent to{" "}
            <a className="underline text-foreground" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            .
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
