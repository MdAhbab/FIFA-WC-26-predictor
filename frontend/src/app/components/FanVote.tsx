import { useMemo, useState, useEffect } from "react";
import { Check, Trophy, Vote as VoteIcon, Copy } from "lucide-react";
import { TEAMS } from "../lib/data";
import { useVotes } from "../lib/VotesContext";
import { ShareStory } from "./ShareStory";
import { shortRefUrl } from "../lib/share";

const ISO_BY_NAME: Record<string, string> = {};

export function FanVote() {
  const { votes, submit } = useVotes();
  const teams = useMemo(
    () => [...TEAMS].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );
  for (const t of teams) ISO_BY_NAME[t.name] = t.iso;

  const [t1, setT1] = useState("");
  const [t2, setT2] = useState("");
  const [voterName, setVoterName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [myVoteId, setMyVoteId] = useState<number | null>(null);
  const [myUniqueName, setMyUniqueName] = useState<string | null>(null);
  const [refId, setRefId] = useState<number | null>(null);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      const parsedRef = parseInt(ref, 10);
      if (!isNaN(parsedRef)) {
        setRefId(parsedRef);
      }
    }
  }, []);

  const canVote = t1 && t2 && t1 !== t2 && voterName.trim() && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canVote) {
      if (!voterName.trim()) {
        setErr("Please enter your name to submit your vote.");
      } else if (t1 && t1 === t2) {
        setErr("Pick two different teams.");
      } else {
        setErr("Choose both teams first.");
      }
      return;
    }
    setErr("");
    setBusy(true);
    try {
      // Pick #1 (t1) is the champion, t1 and t2 are the finalists
      const res = await submit(t1, t2, t1, voterName, refId || undefined);
      setMyVoteId(res.vote_id);
      setMyUniqueName(res.name);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit your vote.");
    } finally {
      setBusy(false);
    }
  }

  const total = votes?.total ?? 0;
  const board = votes?.top ?? [];
  const maxCount = board.length ? Math.max(...board.map((b) => b.count)) : 1;

  return (
    <section className="rounded-[14px] border-2 border-foreground/15 bg-card p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <VoteIcon className="size-4" style={{ color: "var(--foil-magenta)" }} />
        <h2 className="display tracking-wide">FAN VOTE — WHO LIFTS THE CUP?</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Pick the <strong>champion</strong> (lifts the cup) and your <strong>second opinion</strong> (finalist). See how your call stacks up.
      </p>

      {!myVoteId ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid sm:grid-cols-[1.2fr_1fr_1fr] gap-3 items-end">
            <div>
              <label htmlFor="fan-voter-name" className="display text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-1 font-semibold">
                Your Name
              </label>
              <input
                id="fan-voter-name"
                type="text"
                value={voterName}
                onChange={(e) => setVoterName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-md border-2 border-foreground/20 bg-background px-3 py-2 text-sm focus:border-foreground outline-none transition-colors"
                maxLength={30}
                required
              />
            </div>
            <TeamSelect label="Pick #1 (Champion)" value={t1} onChange={setT1} teams={teams} exclude={t2} />
            <TeamSelect label="Pick #2 (Second Opinion)" value={t2} onChange={setT2} teams={teams} exclude={t1} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[9px] text-muted-foreground leading-normal italic max-w-md">
              🔒 Your name is saved only for this session/share-link and will be deleted from the database after the competition.
            </p>
            <button
              type="submit"
              disabled={!canVote}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground text-background display uppercase tracking-wider px-5 py-2.5 disabled:opacity-40 hover:enabled:translate-y-[-2px] hover:enabled:shadow-[3px_5px_0_var(--stamp-red)] transition-all font-bold cursor-pointer"
            >
              <Trophy className="size-4" />
              {busy ? "Saving..." : "Cast vote"}
            </button>
          </div>
          {err && <div className="text-xs mt-1" style={{ color: "var(--stamp-red)" }}>{err}</div>}
        </form>
      ) : (
        <div className="rounded-lg border-2 border-foreground bg-background/50 p-4 text-center space-y-3 shadow-inner">
          <h3 className="display text-base font-bold text-[var(--pitch)]">🎉 Finalists Registered!</h3>
          <p className="text-sm">
            You voted as <strong>{myUniqueName}</strong> (Champ: {t1}, Second Opinion: {t2}).
          </p>
          <div className="max-w-md mx-auto text-left">
            <label className="display text-[9px] tracking-[0.2em] uppercase text-muted-foreground block mb-1">
              Your Shareable Referral Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shortRefUrl(myVoteId)}
                className="flex-1 rounded-md border-2 border-foreground/20 bg-background px-3 py-2 text-xs focus:outline-none"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shortRefUrl(myVoteId));
                  alert("Link copied to clipboard!");
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground text-background display uppercase tracking-wider px-3 py-1.5 text-xs hover:bg-muted font-bold cursor-pointer"
              >
                <Copy className="size-3" />
                Copy
              </button>
            </div>
          </div>
          {t1 && myVoteId && (
            <ShareStory
              userName={myUniqueName ?? "A fan"}
              championName={t1}
              championIso={ISO_BY_NAME[t1] ?? ""}
              championElo={null}
              voteId={myVoteId}
            />
          )}
        </div>
      )}

      {/* Live board */}
      <div className="mt-6 pt-5 border-t border-foreground/10">
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="display text-sm tracking-wide text-muted-foreground">
            THE PEOPLE'S BRACKET
          </h3>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {total} vote{total === 1 ? "" : "s"} cast
          </span>
        </div>
        {board.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No votes yet — be the first to call it.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {board.map((b, i) => (
              <li key={b.team} className="flex items-center gap-3">
                <span className="display text-sm w-5 text-center text-muted-foreground">
                  {i + 1}
                </span>
                <img
                  src={`https://flagcdn.com/w40/${ISO_BY_NAME[b.team] || ""}.png`}
                  alt=""
                  width={26}
                  height={18}
                  className="rounded-[2px] shadow-[0_0_0_1px_rgba(24,18,14,0.18)] shrink-0"
                  style={{ objectFit: "cover" }}
                />
                <span className="w-28 sm:w-40 truncate text-sm font-medium">{b.team}</span>
                <div className="flex-1 h-3 rounded-full bg-background/70 border border-foreground/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(4, (b.count / maxCount) * 100)}%`,
                      background:
                        "linear-gradient(90deg, var(--foil-blue), var(--foil-magenta))",
                    }}
                  />
                </div>
                <span className="mono text-xs tabular-nums w-12 text-right">
                  {b.pct ?? 0}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function TeamSelect({
  label,
  value,
  onChange,
  teams,
  exclude,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  teams: { name: string; iso: string }[];
  exclude?: string;
}) {
  return (
    <label className="block">
      <span className="display text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border-2 border-foreground/20 bg-background px-3 py-2 text-sm focus:border-foreground outline-none transition-colors"
      >
        <option value="">Select a team…</option>
        {teams.map((t) => (
          <option key={t.name} value={t.name} disabled={t.name === exclude}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}
