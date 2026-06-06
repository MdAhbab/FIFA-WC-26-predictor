import { useSEO } from "../lib/useSEO";

export default function Privacy() {
  useSEO({
    title: "Privacy Policy · FIFA World Cup '26 Predictor",
    description:
      "How the FIFA World Cup '26 Predictor handles your data, cookies and third-party services.",
  });

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 pb-12">
      <header className="mb-8">
        <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
          The fine print
        </div>
        <h1 className="mt-1">PRIVACY POLICY</h1>
        <p className="mono text-[11px] uppercase tracking-wider text-muted-foreground mt-2">
          Last updated · {new Date().toLocaleDateString("en-GB", { year: "numeric", month: "long" })}
        </p>
      </header>

      <article className="space-y-6 text-muted-foreground leading-relaxed">
        <Section title="Who we are">
          <p>
            FIFA World Cup '26 Predictor (&ldquo;the Site&rdquo;) is a hobby
            content project that publishes machine-learning predictions for the
            2026 FIFA World Cup. The Site is not affiliated with, endorsed by or
            connected to FIFA.
          </p>
        </Section>

        <Section title="What we collect">
          <p>
            The Site is a static front-end and does not run user accounts. We do
            not collect names, email addresses or any directly identifying
            information from you. Two limited categories of data are processed
            on your device:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-foreground">Your bracket picks.</strong>{" "}
              When you reorder groups or crown a knockout winner on the Play
              page, those choices are stored in your browser&rsquo;s
              <code className="mono mx-1">localStorage</code> so the bracket
              survives a refresh. They never leave your device.
            </li>
            <li>
              <strong className="text-foreground">Theme preference.</strong> A
              single light/dark flag is also stored in
              <code className="mono mx-1">localStorage</code>.
            </li>
          </ul>
        </Section>

        <Section title="Cookies & third parties">
          <p>
            The Site does not set first-party tracking cookies. Pages may load
            advertising and analytics scripts from third parties (for example
            Google AdSense or a similar ad network). Those services may set
            their own cookies and use your IP address and basic device
            information to measure impressions and serve relevant ads.
          </p>
          <p>
            Their behaviour is governed by their own privacy policies, not
            ours. You can opt out of personalised advertising at{" "}
            <a
              className="underline"
              href="https://adssettings.google.com"
              target="_blank"
              rel="noreferrer"
            >
              adssettings.google.com
            </a>
            .
          </p>
        </Section>

        <Section title="Clearing your data">
          <p>
            You can wipe everything the Site has stored at any time by clearing
            site data for this domain in your browser settings, or by clicking
            the &ldquo;Start over&rdquo; / &ldquo;Reset&rdquo; buttons on the
            Play page (which clears your bracket from
            <code className="mono mx-1">localStorage</code>).
          </p>
        </Section>

        <Section title="Children">
          <p>
            The Site is not directed to children under 13 and we do not
            knowingly collect data from them.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy can be raised via the contact link in
            the site footer. Because we hold no personal information about you,
            most data-subject requests are satisfied by clearing your browser
            data.
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
