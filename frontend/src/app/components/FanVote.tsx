import { useMemo, useState } from "react";
import { Check, Trophy, Vote as VoteIcon } from "lucide-react";
import { TEAMS } from "../lib/data";
import { useVotes } from "../lib/VotesContext";

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
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  const canVote = t1 && t2 && t1 !== t2 && !busy;

  async function onSubmit() {
    if (!canVote) {
      setErr(t1 && t1 === t2 ? "Pick two different teams." : "Choose two teams first.");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      await submit(t1, t2);
      setDone(true);
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
    <section className="rounded-[14px] border-2 border-foreground/15 bg-card p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-1">
        <VoteIcon className="size-4" style={{ color: "var(--foil-magenta)" }} />
        <h2 className="display tracking-wide">FAN VOTE — WHO LIFTS THE CUP?</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Pick the <strong>two teams</strong> you think will reach the top. See how your call stacks up
        against everyone else. Come back and vote as often as you like.
      </p>

      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
        <TeamSelect label="Pick #1" value={t1} onChange={setT1} teams={teams} exclude={t2} />
        <TeamSelect label="Pick #2" value={t2} onChange={setT2} teams={teams} exclude={t1} />
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canVote}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground text-background display uppercase tracking-wider px-5 py-2.5 disabled:opacity-40 hover:enabled:translate-y-[-2px] hover:enabled:shadow-[3px_5px_0_var(--stamp-red)] transition-all"
        >
          {done ? <Check className="size-4" /> : <Trophy className="size-4" />}
          {busy ? "Saving..." : done ? "Voted — vote again?" : "Cast vote"}
        </button>
      </div>
      {err && <div className="mt-2 text-xs" style={{ color: "var(--stamp-red)" }}>{err}</div>}

      {/* Live board */}
      <div className="mt-6">
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
                />
                <span className="w-28 sm:w-40 truncate text-sm">{b.team}</span>
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
        className="mt-1 w-full rounded-md border-2 border-foreground/20 bg-background px-3 py-2 text-sm focus:border-foreground outline-none"
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
