import { useEffect, useState } from "react";
import { Loader2, Sparkles, Users, X } from "lucide-react";
import { usePicks } from "../lib/PicksContext";
import { TEAMS } from "../lib/data";
import { api } from "../lib/api";
import type { PoolPlayer } from "../lib/types";

const MAX_BIAS_TEAMS = 5;

export function StrengthPanel() {
  const { state, setBias, setSquad, applyStrength, applying } = usePicks();
  const teams = [...TEAMS].sort((a, b) => a.name.localeCompare(b.name));

  const biasedTeams = Object.keys(state.bias);
  const [addTeam, setAddTeam] = useState("");

  // squad editor
  const [squadTeam, setSquadTeam] = useState(teams[0]?.name ?? "");
  const [pool, setPool] = useState<PoolPlayer[]>([]);
  const [loadingPool, setLoadingPool] = useState(false);

  useEffect(() => {
    if (!squadTeam) return;
    let alive = true;
    setLoadingPool(true);
    api
      .players(squadTeam)
      .then((d) => alive && setPool(d.players))
      .catch(() => alive && setPool([]))
      .finally(() => alive && setLoadingPool(false));
    return () => {
      alive = false;
    };
  }, [squadTeam]);

  const selected = state.squads[squadTeam] ?? [];
  const selectedIds = new Set(selected.map((p) => p.player_id));

  function togglePlayer(p: PoolPlayer) {
    const cur = state.squads[squadTeam] ?? [];
    const exists = cur.some((x) => x.player_id === p.player_id);
    setSquad(
      squadTeam,
      exists ? cur.filter((x) => x.player_id !== p.player_id) : [...cur, p],
    );
  }

  const byPos: Record<string, PoolPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of pool) (byPos[p.position] ?? byPos.MID).push(p);

  const dirty =
    Object.keys(state.bias).length > 0 || Object.keys(state.squads).length > 0;

  return (
    <details className="mb-6 rounded-[14px] border-2 border-foreground/15 bg-card overflow-hidden">
      <summary className="cursor-pointer list-none px-5 py-3 flex items-center gap-2 select-none">
        <Sparkles className="size-4" style={{ color: "var(--foil-magenta)" }} />
        <span className="display tracking-wide">Tune the model (optional)</span>
        <span className="ml-auto mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          bias + squads
        </span>
      </summary>

      <div className="px-5 pb-5 space-y-6 border-t-2 border-foreground/10 pt-4">
        {/* Bias */}
        <div>
          <h3 className="display text-sm tracking-wide mb-1">Team bias</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Nudge up to {MAX_BIAS_TEAMS} teams you rate higher than the model does. +1 is a whisper,
            +5 a firm lean. (It is subtle on purpose.)
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            {biasedTeams.map((t) => (
              <div
                key={t}
                className="flex items-center gap-2 rounded-md border-2 border-foreground/20 bg-background px-2 py-1.5"
              >
                <span className="text-sm">{t}</span>
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setBias(t, lvl)}
                      className={`size-5 rounded text-[10px] display ${
                        state.bias[t] >= lvl
                          ? "bg-foreground text-background"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setBias(t, 0)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${t}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {biasedTeams.length < MAX_BIAS_TEAMS && (
              <select
                value={addTeam}
                onChange={(e) => {
                  if (e.target.value) {
                    setBias(e.target.value, 3);
                    setAddTeam("");
                  }
                }}
                className="rounded-md border-2 border-foreground/20 bg-background px-2 py-1.5 text-sm"
              >
                <option value="">+ add team…</option>
                {teams
                  .filter((t) => !state.bias[t.name])
                  .map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>

        {/* Squad selector */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="size-4" />
            <h3 className="display text-sm tracking-wide">Pick a squad</h3>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Choose the players you would call up for a team. Pick a few; the rest of the squad is
            auto-filled by position. A stronger squad lifts that team; benching stars weakens it.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <select
              value={squadTeam}
              onChange={(e) => setSquadTeam(e.target.value)}
              className="rounded-md border-2 border-foreground/20 bg-background px-2 py-1.5 text-sm"
            >
              {teams.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {selected.length} picked{selected.length ? " · rest autofilled" : ""}
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => setSquad(squadTeam, [])}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                clear
              </button>
            )}
          </div>

          {loadingPool ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> loading players…
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(["GK", "DEF", "MID", "FWD"] as const).map((pos) => (
                <div key={pos}>
                  <div className="display text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
                    {pos}
                  </div>
                  <ul className="space-y-1">
                    {byPos[pos].slice(0, 10).map((p) => (
                      <li key={p.player_id}>
                        <label className="flex items-center gap-2 text-sm cursor-pointer rounded px-1 py-0.5 hover:bg-muted">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.player_id)}
                            onChange={() => togglePlayer(p)}
                          />
                          <span className="flex-1 truncate">{p.name}</span>
                          <span className="mono text-[10px] text-muted-foreground tabular-nums">
                            {p.rating}
                          </span>
                        </label>
                      </li>
                    ))}
                    {byPos[pos].length === 0 && (
                      <li className="text-xs text-muted-foreground">no data</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={applyStrength}
            disabled={applying || !dirty}
            className="inline-flex items-center gap-2 rounded-md bg-foreground text-background display uppercase tracking-wider px-4 py-2 disabled:opacity-40 hover:enabled:translate-y-[-2px] hover:enabled:shadow-[3px_5px_0_var(--stamp-red)] transition-all"
          >
            {applying ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {applying ? "Recomputing…" : "Apply to predictions"}
          </button>
          <span className="text-xs text-muted-foreground">
            Re-runs the real model with your tweaks. Resets your knockout picks.
          </span>
        </div>
      </div>
    </details>
  );
}
