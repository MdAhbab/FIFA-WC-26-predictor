import { useEffect, useState } from "react";
import { Copy, Link2, Users } from "lucide-react";
import { api } from "../lib/api";
import { shortRefUrl } from "../lib/share";
import type { SharedVoteData, SharedVoter } from "../lib/types";

function topPicks(v: SharedVoter | null | undefined): string {
  if (!v) return "—";
  const list = v.top4 && v.top4.length ? v.top4 : [v.team1, v.team2].filter(Boolean);
  return list.length ? list.join(", ") : "—";
}

function SimBadge({ count }: { count?: number }) {
  const c = count ?? 0;
  const cls =
    c >= 3
      ? "bg-[color-mix(in_oklab,var(--foil-gold)_15%,transparent)] text-amber-700 dark:text-amber-300"
      : c >= 1
      ? "bg-[color-mix(in_oklab,var(--foil-blue)_15%,transparent)] text-blue-700 dark:text-blue-300"
      : "bg-muted text-muted-foreground";
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${cls}`}>
      {c >= 1 ? `${c} shared ${c >= 3 ? "🌟" : "🤝"}` : "0 shared ❄️"}
    </span>
  );
}

/**
 * The shared-bracket comparison table. Lists the host, whoever referred the host, and everyone who
 * played under the host's link — each with their full top-4 picks, champion and how many top-4 teams
 * they share with the host. Reused both when you arrive via someone's link and on your own hub.
 */
export function FriendsComparison({
  data,
  hostLabel = "Host",
  youName,
}: {
  data: SharedVoteData;
  hostLabel?: string;
  youName?: string;
}) {
  const { referrer, friends, parent } = data;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b-2 border-foreground/20 text-muted-foreground font-semibold display uppercase tracking-wider">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Top 4 picks</th>
            <th className="py-2 pr-4">Champion</th>
            <th className="py-2 text-right">Similarity</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/10 mono">
          <tr className="font-semibold text-foreground/80 bg-muted/40">
            <td className="py-2.5 pr-4 font-bold">
              {referrer.name} ({hostLabel})
            </td>
            <td className="py-2.5 pr-4">{topPicks(referrer)}</td>
            <td className="py-2.5 pr-4">{referrer.champion || "—"}</td>
            <td className="py-2.5 text-right font-bold text-[var(--foil-gold)]">Host</td>
          </tr>
          {parent && (
            <tr className="italic text-foreground/75 bg-muted/10">
              <td className="py-2.5 pr-4 font-semibold">{parent.name} (Referrer)</td>
              <td className="py-2.5 pr-4">{topPicks(parent)}</td>
              <td className="py-2.5 pr-4">{parent.champion || "—"}</td>
              <td className="py-2.5 text-right">
                <SimBadge count={parent.match_count} />
              </td>
            </tr>
          )}
          {friends.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-4 text-center text-muted-foreground italic">
                No one has played on this link yet. Share it to compare top-4 picks!
              </td>
            </tr>
          ) : (
            friends.map((f) => {
              const isMe = youName && f.name === youName;
              return (
                <tr key={f.id} className={isMe ? "bg-muted/20 font-semibold" : ""}>
                  <td className="py-2.5 pr-4 flex items-center gap-1 font-semibold">
                    {f.name}{" "}
                    {isMe && (
                      <span className="stamp text-[8px]" style={{ color: "var(--stamp-red)" }}>
                        YOU
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">{topPicks(f)}</td>
                  <td className="py-2.5 pr-4">{f.champion || "—"}</td>
                  <td className="py-2.5 text-right">
                    <SimBadge count={f.match_count} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Your personal referral hub. Persists across refresh / the 12-hour vote lock (the vote id comes from
 * localStorage): copy your link, see your own top-4, and see everyone who played under your code with
 * their top-4 picks and how many they share with you.
 */
export function ReferralDashboard({ voteId, myName }: { voteId: number; myName: string }) {
  const [data, setData] = useState<SharedVoteData | null>(null);
  const [copied, setCopied] = useState(false);
  const shortUrl = shortRefUrl(voteId);

  useEffect(() => {
    let alive = true;
    api
      .voteShared(voteId)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [voteId]);

  function copy() {
    navigator.clipboard?.writeText(shortUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      },
      () => {},
    );
  }

  return (
    <section className="mt-6 rounded-[14px] border-2 border-foreground bg-card p-5 shadow-[4px_4px_0_var(--foil-blue)]">
      <div className="flex items-center gap-2 mb-1">
        <Link2 className="size-4" style={{ color: "var(--foil-blue)" }} />
        <h2 className="display tracking-wide font-bold">YOUR REFERRAL HUB</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        You played as <strong>{myName}</strong>
        {data?.referrer?.champion && (
          <>
            {" "}· your champion is <strong>{data.referrer.champion}</strong>
          </>
        )}
        . This link and list stay here even after you refresh or your vote locks.
      </p>

      <div className="max-w-md text-left mb-4">
        <label className="display text-[9px] tracking-[0.2em] uppercase text-muted-foreground block mb-1">
          Your shareable referral link
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            readOnly
            value={shortUrl}
            className="flex-1 rounded-md border-2 border-foreground/20 bg-background px-3 py-2 text-xs focus:outline-none"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background display uppercase tracking-wider px-3 py-1.5 text-xs hover:bg-muted font-bold"
          >
            <Copy className="size-3" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {data?.referrer && (
        <p className="text-xs text-muted-foreground mb-3">
          Your top 4: <span className="mono text-foreground">{topPicks(data.referrer)}</span>
        </p>
      )}

      <div className="flex items-center gap-2 mb-2">
        <Users className="size-4 text-muted-foreground" />
        <h3 className="display text-sm tracking-wide text-muted-foreground">
          WHO PLAYED WITH YOUR CODE
        </h3>
      </div>
      {data ? (
        <FriendsComparison data={data} hostLabel="You" youName={myName} />
      ) : (
        <p className="text-sm text-muted-foreground">Loading your referrals…</p>
      )}
    </section>
  );
}
