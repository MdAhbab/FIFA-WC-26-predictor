import { useSEO } from "../lib/useSEO";
import { CONTACT_EMAIL, SITE_DOMAIN } from "../lib/site";

export default function Privacy() {
  useSEO({
    title: "Privacy Policy · FIFA Worldcup Predictor",
    description:
      "How the FIFA Worldcup Predictor handles your data, cookies, sessions and third-party services.",
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
            FIFA Worldcup Predictor (&ldquo;the Site&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo;) is an independent hobby project that publishes
            machine-learning predictions for the 2026 FIFA World Cup at{" "}
            <span className="text-foreground">{SITE_DOMAIN}</span>. The Site is not
            affiliated with, endorsed by, or connected to FIFA or any participating
            football association. This policy explains what limited data we process,
            why, and the choices you have. We are the data controller for the small
            amount of data described below.
          </p>
        </Section>

        <Section title="Summary">
          <ul className="list-disc pl-5 space-y-1.5">
            <li>We do not ask for, or require, an account, name or email to use the Site.</li>
            <li>Your bracket picks and theme preference live only in your browser.</li>
            <li>We use one anonymous session cookie so predictions you tweak stay responsive.</li>
            <li>The fan vote stores an anonymous tally only — never anything that identifies you.</li>
            <li>Advertising and analytics, when enabled, are provided by third parties under their own policies.</li>
          </ul>
        </Section>

        <Section title="What we collect and why">
          <p>We process the following limited categories of data:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <strong className="text-foreground">Your bracket picks.</strong> When you
              reorder groups or crown a knockout winner on the Play page, those choices
              are stored in your browser&rsquo;s
              <code className="mono mx-1">localStorage</code> so the bracket survives a
              refresh. They never leave your device.
            </li>
            <li>
              <strong className="text-foreground">Theme preference.</strong> A single
              light/dark flag is stored in
              <code className="mono mx-1">localStorage</code>.
            </li>
            <li>
              <strong className="text-foreground">An anonymous session.</strong> We set a
              first-party cookie (<code className="mono mx-1">wcsid</code>) holding a random,
              opaque identifier. It lets the server cache the predictions you are tweaking so
              the experience stays fast, and it expires automatically after 20 minutes of
              inactivity. It contains no personal information and is not used to track you
              across other websites.
            </li>
            <li>
              <strong className="text-foreground">Fan-vote submissions.</strong> If you
              submit a vote, we store the teams you picked, an optional champion choice, and a
              timestamp, so we can show the aggregated &ldquo;people&rsquo;s bracket&rdquo;.
              No name, email, account or precise identifier is attached to a vote.
            </li>
            <li>
              <strong className="text-foreground">Server logs.</strong> Like any website, our
              host may briefly process technical request data (such as IP address and browser
              type) to deliver pages and protect against abuse. These are not used to build a
              profile of you.
            </li>
          </ul>
        </Section>

        <Section title="Legal bases">
          <p>
            Where data-protection law (such as the GDPR) applies, we rely on our{" "}
            <em>legitimate interests</em> in operating a fast, secure website and showing an
            aggregate fan vote, and on your <em>consent</em> for any non-essential advertising
            or analytics cookies, which you can withdraw at any time through your browser or the
            ad provider&rsquo;s settings.
          </p>
        </Section>

        <Section title="Cookies & third parties">
          <p>
            The only essential cookie we set is the anonymous session cookie described above.
            Pages may also load advertising and analytics scripts from third parties (for example
            Google AdSense or a similar network). Those services may set their own cookies and use
            your IP address and basic device information to measure impressions and serve relevant
            ads. Their behaviour is governed by their own privacy policies, not ours.
          </p>
          <p>
            You can opt out of personalised advertising at{" "}
            <a className="underline" href="https://adssettings.google.com" target="_blank" rel="noreferrer">
              adssettings.google.com
            </a>{" "}
            and learn more at{" "}
            <a className="underline" href="https://www.aboutads.info" target="_blank" rel="noreferrer">
              aboutads.info
            </a>
            .
          </p>
        </Section>

        <Section title="Data retention">
          <p>
            Browser-stored data (picks, theme) remains until you clear it. The session cookie
            expires after 20 minutes of inactivity. Anonymous fan-vote tallies are retained for the
            duration of the tournament to power the aggregate board, then may be archived or deleted.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on where you live, you may have rights to access, correct, delete or restrict
            the processing of your personal data, and to object to processing. Because we hold no
            information that identifies you, most requests are satisfied simply by clearing your
            browser data. If you believe we hold data about you, contact us using the details below
            and we will respond within a reasonable time. You may also lodge a complaint with your
            local data-protection authority.
          </p>
        </Section>

        <Section title="Clearing your data">
          <p>
            You can wipe everything the Site has stored at any time by clearing site data for this
            domain in your browser settings, or by using the &ldquo;Reset&rdquo; / &ldquo;Start
            over&rdquo; controls on the Play page (which clear your bracket from
            <code className="mono mx-1">localStorage</code>). Deleting cookies removes the anonymous
            session immediately.
          </p>
        </Section>

        <Section title="Children">
          <p>
            The Site is not directed to children under 13 (or the minimum age in your jurisdiction)
            and we do not knowingly collect data from them. If you believe a child has provided data,
            contact us and we will delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            We may update this policy from time to time. The &ldquo;last updated&rdquo; date above
            will change when we do, and material changes will be reflected on this page.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy or your data can be sent to{" "}
            <a className="underline text-foreground" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
            . Because we hold no personal information about you, most data-subject requests are
            satisfied by clearing your browser data.
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
