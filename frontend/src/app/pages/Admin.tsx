import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck, LogOut, Trophy, Users, Trash2, Zap,
  CheckCircle, AlertTriangle, Lock, ChevronDown, CalendarDays
} from "lucide-react";
import { getMLBracket, type KnockoutResult } from "../lib/PicksContext";
import { bootstrap } from "../lib/data";

// ---- types ----
type Session = { username: string; token: string };
type Toast = { id: number; type: "ok" | "err"; msg: string };
type GroupFixture = { match_id: number; group: string; home_team: string; away_team: string; date_utc: string; venue: string };
// A result row as returned by /api/results (server shape: hg/ag/home/away).
type ResultRow = { match_id: number; stage: string; home: string; away: string; hg: number; ag: number; locked: boolean; winner_team?: string | null };
// One knockout fixture resolved from the live bracket (teams follow the model + any official results).
type KoMatch = { match_id: number; round: KnockoutResult["round"]; stage: string; home: string; away: string; date: string };

// ---- tiny API helper ----
async function api(method: string, path: string, body?: unknown, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["x-admin-token"] = token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) { const t = await res.text(); throw new Error(t || `HTTP ${res.status}`); }
  return res.json();
}

// ============================================================
// Login Screen
// ============================================================
function LoginScreen({ onLogin }: { onLogin: (s: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = (await api("POST", "/api/admin/login", { username, password })) as { ok: boolean; token: string; username: string };
      onLogin({ username: data.username, token: data.token });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl border-2 border-foreground bg-foreground text-background mb-4 shadow-[4px_4px_0_var(--stamp-red)]">
            <ShieldCheck className="size-8" />
          </div>
          <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">FIFA World Cup '26</div>
          <h1 className="mt-1 text-4xl">ADMIN ACCESS</h1>
        </div>

        <form onSubmit={submit} className="rounded-[14px] border-2 border-foreground bg-card p-6 shadow-[5px_5px_0_var(--foil-blue)]">
          <div className="space-y-4">
            <div>
              <label htmlFor="admin-user" className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground block mb-1.5">Username</label>
              <input
                id="admin-user"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border-2 border-foreground/30 bg-background px-3 py-2.5 focus:outline-none focus:border-foreground transition-colors"
                placeholder="admin"
              />
            </div>
            <div>
              <label htmlFor="admin-pass" className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground block mb-1.5">Password</label>
              <input
                id="admin-pass"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border-2 border-foreground/30 bg-background px-3 py-2.5 focus:outline-none focus:border-foreground transition-colors"
                placeholder="••••••••"
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="mt-4 flex items-center gap-2 text-sm rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2" style={{ color: "var(--stamp-red)" }}>
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button id="admin-login-btn" type="submit" disabled={busy}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-md bg-foreground text-background display uppercase tracking-wider px-4 py-3 hover:translate-y-[-2px] hover:shadow-[3px_5px_0_var(--stamp-red)] disabled:opacity-50 transition-all">
            <Lock className="size-4" />
            {busy ? "Authenticating…" : "Sign In"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted-foreground">Authorised personnel only.</p>
      </motion.div>
    </div>
  );
}

// ============================================================
// Toast
// ============================================================
let _toastId = 0;
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  function add(type: Toast["type"], msg: string) {
    const id = ++_toastId;
    setToasts((t) => [...t, { id, type, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }
  return { toasts, ok: (m: string) => add("ok", m), err: (m: string) => add("err", m) };
}
function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-md border-2 text-sm font-medium shadow-md ${t.type === "ok" ? "bg-card border-foreground" : "bg-card border-destructive text-destructive"}`}>
            {t.type === "ok" ? <CheckCircle className="size-4 shrink-0" style={{ color: "var(--pitch)" }} /> : <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--stamp-red)" }} />}
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================================
// Shared design primitives
// ============================================================
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="display text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="w-full rounded-md border-2 border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors" />;
}
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className="w-full appearance-none rounded-md border-2 border-foreground/20 bg-background px-3 py-2 pr-8 text-sm focus:outline-none focus:border-foreground transition-colors" />
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-4 pointer-events-none text-muted-foreground" />
    </div>
  );
}
function Panel({ icon, title, accent, children }: { icon: React.ReactNode; title: string; accent: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-[14px] border-2 border-foreground bg-card overflow-hidden"
      style={{ boxShadow: `5px 5px 0 ${accent}` }}>
      <div className="flex items-center gap-3 px-5 py-3 border-b-2 border-foreground" style={{ background: `color-mix(in oklab, ${accent} 12%, transparent)` }}>
        <span className="text-foreground">{icon}</span>
        <h2 className="display text-lg tracking-wide">{title.toUpperCase()}</h2>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </motion.div>
  );
}
function Btn({ variant = "primary", icon, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "ghost"; icon?: React.ReactNode }) {
  const cls = { primary: "bg-foreground text-background hover:translate-y-[-2px] hover:shadow-[3px_5px_0_var(--foil-blue)]", danger: "bg-destructive text-destructive-foreground hover:translate-y-[-2px] hover:shadow-[3px_5px_0_var(--stamp-red)]", ghost: "border-2 border-foreground/40 text-foreground hover:bg-muted" }[variant];
  return <button {...rest} className={`inline-flex items-center justify-center gap-2 rounded-md display uppercase tracking-wider px-4 py-2 text-sm transition-all disabled:opacity-40 ${cls}`}>{icon}{children}</button>;
}

// ============================================================
// Group Fixtures Panel
// ============================================================
const GROUP_LETTERS = ["A","B","C","D","E","F","G","H","I","J","K","L"];

// Bottom-right action bar shared by both result panels: a Submit button, an overwrite warning that
// must be confirmed when a published result already exists, and an Unpublish for fixing bad data.
function ActionBar({ existing, confirmOverwrite, busy, onSubmit, onUnpublish, onCancelConfirm, submitIcon }:
  { existing: boolean; confirmOverwrite: boolean; busy: boolean; onSubmit: () => void; onUnpublish: () => void; onCancelConfirm: () => void; submitIcon: React.ReactNode }) {
  return (
    <div className="pt-1 space-y-2">
      <AnimatePresence>
        {confirmOverwrite && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 text-xs rounded-md border-2 px-3 py-2"
            style={{ borderColor: "var(--mustard)", background: "color-mix(in oklab, var(--mustard) 12%, transparent)" }}>
            <AlertTriangle className="size-4 shrink-0" style={{ color: "var(--mustard)" }} />
            <span>A result is already published for this match. Submitting overwrites it.</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex items-center justify-end gap-2">
        {existing && (
          <Btn variant="ghost" icon={<Trash2 className="size-4" />} disabled={busy} onClick={onUnpublish}>Unpublish</Btn>
        )}
        {confirmOverwrite && (
          <Btn variant="ghost" disabled={busy} onClick={onCancelConfirm}>Cancel</Btn>
        )}
        <Btn variant="primary" icon={submitIcon} disabled={busy} onClick={onSubmit}>
          {busy ? "Saving…" : confirmOverwrite ? "Confirm overwrite" : existing ? "Update result" : "Submit result"}
        </Btn>
      </div>
    </div>
  );
}

function loadResultsInto(
  setResults: (m: Record<number, ResultRow>) => void,
  setSchedule?: (m: Record<number, string>) => void,
) {
  return fetch("/api/results").then(r => r.json()).then(rd => {
    const map: Record<number, ResultRow> = {};
    for (const r of (rd.results || []) as ResultRow[]) map[r.match_id] = r;
    setResults(map);
    if (setSchedule) {
      const s: Record<number, string> = {};
      for (const x of (rd.schedule || []) as { match_id: number; date_utc: string }[]) s[x.match_id] = x.date_utc;
      setSchedule(s);
    }
  });
}

// Admin-editable match date (app only). Persists to the schedule store; the app overlays it over the
// fixture / cosmetic date. Independent of the result, so dates can be set before a match is played.
function ScheduleRow({ matchId, current, fallback, token, ok, err, onSaved }:
  { matchId: number; current?: string; fallback?: string; token: string; ok: (m: string) => void; err: (m: string) => void; onSaved: () => Promise<void> | void }) {
  const [d, setD] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setD((current || fallback || "").slice(0, 10)); }, [matchId, current, fallback]);
  async function save() {
    if (!d) { err("Pick a date first."); return; }
    setBusy(true);
    try { await api("POST", "/api/admin/schedule", { match_id: matchId, date_utc: d }, token); ok(`Date set for #${matchId} → ${d}`); await onSaved(); }
    catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  async function reset() {
    setBusy(true);
    try { await api("DELETE", `/api/admin/schedule/${matchId}`, undefined, token); ok(`Date reset for #${matchId}`); await onSaved(); }
    catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="rounded-md border-2 border-foreground/15 p-3 space-y-2">
      <div className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground flex items-center gap-1.5">
        <CalendarDays className="size-3.5" /> Reschedule (app only){current && <span style={{ color: "var(--foil-gold)" }}>· edited</span>}
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end">
        <Field label="Match date"><Input type="date" value={d} onChange={e => setD(e.target.value)} /></Field>
        <Btn variant="ghost" disabled={busy} onClick={save}>{busy ? "…" : "Save date"}</Btn>
        {current && <Btn variant="ghost" disabled={busy} onClick={reset}>Reset</Btn>}
      </div>
    </div>
  );
}

function GroupResultsPanel({ token, ok, err }: { token: string; ok: (m: string) => void; err: (m: string) => void }) {
  const [fixtures, setFixtures] = useState<GroupFixture[]>([]);
  const [results, setResults] = useState<Record<number, ResultRow>>({});
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<Record<number, string>>({});
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  useEffect(() => {
    fetch("/api/bootstrap").then(r => r.json()).then(d => {
      const all: GroupFixture[] = [];
      if (d.groups) {
        for (const g of Object.values(d.groups) as Array<{ group: string; matches: any[] }>) {
          for (const m of g.matches || []) {
            all.push({ match_id: parseInt(String(m.matchId).replace("G", "")) || 0, group: g.group, home_team: m.home?.name || "", away_team: m.away?.name || "", date_utc: m.date || "", venue: m.venue || "" });
          }
        }
      }
      all.sort((a, b) => a.match_id - b.match_id);
      setFixtures(all);
      loadResultsInto(setResults, setSchedule);
    }).catch(() => {});
  }, []);

  const groupFixtures = fixtures.filter(f => f.group === selectedGroup);
  const selected = selectedMatchId !== null ? fixtures.find(f => f.match_id === selectedMatchId) : null;
  const existing = selectedMatchId !== null ? results[selectedMatchId] : null;

  function selectMatch(id: number) {
    setSelectedMatchId(id);
    setConfirmOverwrite(false);
    const ex = results[id];
    if (ex) { setHomeGoals(String(ex.hg)); setAwayGoals(String(ex.ag)); setLocked(ex.locked); }
    else { setHomeGoals(""); setAwayGoals(""); setLocked(true); }
  }

  async function doSubmit() {
    if (!selected || selectedMatchId === null) return;
    setBusy(true);
    try {
      await api("POST", "/api/admin/result", {
        match_id: selectedMatchId, stage: `Group ${selected.group}`,
        home_team: selected.home_team, away_team: selected.away_team,
        home_goals: parseInt(homeGoals) || 0, away_goals: parseInt(awayGoals) || 0, locked,
      }, token);
      ok(`✓ ${selected.home_team} ${parseInt(homeGoals) || 0}–${parseInt(awayGoals) || 0} ${selected.away_team}`);
      await loadResultsInto(setResults, setSchedule);
      setConfirmOverwrite(false);
    } catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function unpublish() {
    if (selectedMatchId === null) return;
    setBusy(true);
    try {
      await api("DELETE", `/api/admin/result/${selectedMatchId}`, undefined, token);
      ok(`Removed result for match #${selectedMatchId}`);
      await loadResultsInto(setResults, setSchedule);
      setHomeGoals(""); setAwayGoals(""); setConfirmOverwrite(false);
    } catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Panel icon={<Trophy className="size-5" />} title="Group Stage Results" accent="var(--foil-gold)">
      <div className="flex flex-wrap gap-1">
        {GROUP_LETTERS.map(g => (
          <button key={g} onClick={() => { setSelectedGroup(g); setSelectedMatchId(null); }}
            className={`display text-xs tracking-wider px-2.5 py-1 rounded border-2 transition-colors ${selectedGroup === g ? "bg-foreground text-background border-foreground" : "border-foreground/20 hover:bg-muted"}`}>
            {g}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {groupFixtures.length === 0 && <p className="text-sm text-muted-foreground">No fixtures loaded.</p>}
        {groupFixtures.map(f => {
          const res = results[f.match_id];
          const isSelected = selectedMatchId === f.match_id;
          return (
            <button key={f.match_id} onClick={() => selectMatch(f.match_id)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border-2 text-sm transition-all text-left ${isSelected ? "border-foreground bg-muted" : "border-foreground/10 hover:border-foreground/30"}`}>
              <span className="min-w-0 truncate"><span className="mono text-[10px] text-muted-foreground mr-1.5">#{f.match_id}</span>{f.home_team} <span className="text-muted-foreground">vs</span> {f.away_team}</span>
              {res ? (
                <span className="display text-sm font-bold shrink-0" style={{ color: "var(--pitch)" }}>{res.hg}–{res.ag}{res.locked ? " 🔒" : ""}</span>
              ) : (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">pending</span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pt-2 border-t-2 border-foreground/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">Result · #{selectedMatchId}</div>
            {existing && <span className="text-[10px] display tracking-wider" style={{ color: "var(--foil-gold)" }}>EDITING PUBLISHED</span>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${selected.home_team} Goals`}>
              <Input type="number" min="0" max="20" value={homeGoals} onChange={e => setHomeGoals(e.target.value)} placeholder="0" />
            </Field>
            <Field label={`${selected.away_team} Goals`}>
              <Input type="number" min="0" max="20" value={awayGoals} onChange={e => setAwayGoals(e.target.value)} placeholder="0" />
            </Field>
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} />
            <span className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">Mark as official · locks for players</span>
          </label>
          <ScheduleRow matchId={selectedMatchId!} current={schedule[selectedMatchId!]} fallback={selected.date_utc}
            token={token} ok={ok} err={err} onSaved={() => loadResultsInto(setResults, setSchedule)} />
          <ActionBar existing={!!existing} confirmOverwrite={confirmOverwrite} busy={busy}
            onSubmit={() => { if (existing && !confirmOverwrite) setConfirmOverwrite(true); else doSubmit(); }}
            onUnpublish={unpublish} onCancelConfirm={() => setConfirmOverwrite(false)} submitIcon={<Trophy className="size-4" />} />
        </motion.div>
      )}
    </Panel>
  );
}

// ============================================================
// Knockout Results Panel — match-id driven, teams pulled from the live bracket
// ============================================================
const KO_ROUND_TABS: { key: KnockoutResult["round"]; label: string }[] = [
  { key: "R32", label: "R32" }, { key: "R16", label: "R16" }, { key: "QF", label: "QF" },
  { key: "SF", label: "SF" }, { key: "Final", label: "FINAL" },
];
const KO_STAGE_NAME: Record<KnockoutResult["round"], string> = {
  R32: "Round of 32", R16: "Round of 16", QF: "Quarter-finals", SF: "Semi-finals", Final: "Final",
};
function koCompId(idStr: string): number {
  const n = parseInt(idStr.replace("K", ""), 10);
  return n === 31 ? 104 : 72 + n;
}
function buildKoMatches(): KoMatch[] {
  let b;
  try { b = getMLBracket(); } catch { return []; }
  const rows: KoMatch[] = [];
  const add = (arr: KnockoutResult[]) => arr.forEach(m => rows.push({
    match_id: koCompId(m.matchId), round: m.round, stage: KO_STAGE_NAME[m.round],
    home: m.home.name, away: m.away.name, date: m.date,
  }));
  add(b.r32); add(b.r16); add(b.qf); add(b.sf);
  if (b.final) add([b.final]);
  return rows;
}

function KnockoutResultsPanel({ token, ok, err }: { token: string; ok: (m: string) => void; err: (m: string) => void }) {
  const [matches, setMatches] = useState<KoMatch[]>([]);
  const [results, setResults] = useState<Record<number, ResultRow>>({});
  const [selectedRound, setSelectedRound] = useState<KnockoutResult["round"]>("R32");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [schedule, setSchedule] = useState<Record<number, string>>({});
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");
  const [winnerTeam, setWinnerTeam] = useState("");
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);

  useEffect(() => { setMatches(buildKoMatches()); loadResultsInto(setResults, setSchedule).catch(() => {}); }, []);

  const roundMatches = matches.filter(m => m.round === selectedRound);
  const selected = selectedId !== null ? matches.find(m => m.match_id === selectedId) : null;
  const existing = selectedId !== null ? results[selectedId] : null;
  const isDraw = homeGoals !== "" && awayGoals !== "" && parseInt(homeGoals) === parseInt(awayGoals);

  function selectMatch(m: KoMatch) {
    setSelectedId(m.match_id);
    setSelectedRound(m.round);
    setConfirmOverwrite(false);
    const ex = results[m.match_id];
    if (ex) {
      setHomeTeam(ex.home); setAwayTeam(ex.away);
      setHomeGoals(String(ex.hg)); setAwayGoals(String(ex.ag));
      setWinnerTeam(ex.winner_team || ""); setLocked(ex.locked);
    } else {
      setHomeTeam(m.home); setAwayTeam(m.away);
      setHomeGoals(""); setAwayGoals(""); setWinnerTeam(""); setLocked(true);
    }
  }

  async function doSubmit() {
    if (selectedId === null) return;
    if (isDraw && !winnerTeam) { err("Select the penalty shootout winner."); return; }
    setBusy(true);
    try {
      await api("POST", "/api/admin/result", {
        match_id: selectedId, stage: selected?.stage || KO_STAGE_NAME[selectedRound],
        home_team: homeTeam, away_team: awayTeam,
        home_goals: parseInt(homeGoals) || 0, away_goals: parseInt(awayGoals) || 0,
        locked, winner_team: isDraw ? winnerTeam : null,
      }, token);
      ok(`✓ ${homeTeam} ${parseInt(homeGoals) || 0}–${parseInt(awayGoals) || 0} ${awayTeam}${isDraw ? ` · pens: ${winnerTeam}` : ""}`);
      // Refresh the server-applied bracket so deeper-round matchups reflect this result.
      await bootstrap().catch(() => {});
      setMatches(buildKoMatches());
      await loadResultsInto(setResults, setSchedule);
      setConfirmOverwrite(false);
    } catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function unpublish() {
    if (selectedId === null) return;
    setBusy(true);
    try {
      await api("DELETE", `/api/admin/result/${selectedId}`, undefined, token);
      ok(`Removed result for #${selectedId}`);
      await bootstrap().catch(() => {});
      setMatches(buildKoMatches());
      await loadResultsInto(setResults, setSchedule);
      if (selected) { setHomeTeam(selected.home); setAwayTeam(selected.away); }
      setHomeGoals(""); setAwayGoals(""); setWinnerTeam(""); setConfirmOverwrite(false);
    } catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <Panel icon={<Zap className="size-5" />} title="Knockout Results" accent="var(--foil-blue)">
      <div className="flex flex-wrap gap-1">
        {KO_ROUND_TABS.map(t => (
          <button key={t.key} onClick={() => { setSelectedRound(t.key); setSelectedId(null); }}
            className={`display text-[10px] tracking-wider px-2.5 py-1 rounded border-2 transition-colors ${selectedRound === t.key ? "bg-foreground text-background border-foreground" : "border-foreground/20 hover:bg-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        {roundMatches.length === 0 && <p className="text-sm text-muted-foreground">No matches resolved for this round yet.</p>}
        {roundMatches.map(m => {
          const res = results[m.match_id];
          const isSelected = selectedId === m.match_id;
          return (
            <button key={m.match_id} onClick={() => selectMatch(m)}
              className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border-2 text-sm text-left transition-all ${isSelected ? "border-foreground bg-muted" : "border-foreground/10 hover:border-foreground/30"}`}>
              <span className="min-w-0 truncate"><span className="mono text-[10px] text-muted-foreground mr-1.5">#{m.match_id}</span>{m.home} <span className="text-muted-foreground">vs</span> {m.away}</span>
              {res ? (
                <span className="display text-sm font-bold shrink-0" style={{ color: "var(--pitch)" }}>{res.hg}–{res.ag}{res.winner_team ? " (P)" : ""}{res.locked ? " 🔒" : ""}</span>
              ) : (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">pending</span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pt-2 border-t-2 border-foreground/10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground truncate">{selected.stage} · #{selected.match_id} · {selected.date}</div>
            {existing && <span className="text-[10px] display tracking-wider shrink-0" style={{ color: "var(--foil-gold)" }}>EDITING PUBLISHED</span>}
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1.5">Teams come from the bracket — edit only if a different side actually advanced.</p>

          <div className="grid grid-cols-[1fr_5rem] gap-3 items-end">
            <Field label="Home team"><Input type="text" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} /></Field>
            <Field label="Goals"><Input type="number" min="0" max="20" value={homeGoals} onChange={e => setHomeGoals(e.target.value)} placeholder="0" /></Field>
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-3 items-end">
            <Field label="Away team"><Input type="text" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} /></Field>
            <Field label="Goals"><Input type="number" min="0" max="20" value={awayGoals} onChange={e => setAwayGoals(e.target.value)} placeholder="0" /></Field>
          </div>

          {isDraw && (
            <div className="rounded-md border-2 p-3 space-y-2" style={{ borderColor: "color-mix(in oklab, var(--stamp-red) 45%, transparent)", background: "color-mix(in oklab, var(--stamp-red) 8%, transparent)" }}>
              <div className="flex items-center gap-1.5 text-[11px] display tracking-wider uppercase" style={{ color: "var(--stamp-red)" }}>
                <Zap className="size-3.5" /> Level score — decided on penalties
              </div>
              <Field label="Penalty shootout winner">
                <Select value={winnerTeam} onChange={e => setWinnerTeam(e.target.value)}>
                  <option value="">— select winner —</option>
                  {homeTeam && <option value={homeTeam}>{homeTeam}</option>}
                  {awayTeam && <option value={awayTeam}>{awayTeam}</option>}
                </Select>
              </Field>
            </div>
          )}

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} />
            <span className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">Mark as official · locks for players</span>
          </label>
          <ScheduleRow matchId={selected.match_id} current={schedule[selected.match_id]} fallback={selected.date}
            token={token} ok={ok} err={err}
            onSaved={async () => { await bootstrap().catch(() => {}); setMatches(buildKoMatches()); await loadResultsInto(setResults, setSchedule); }} />
          <ActionBar existing={!!existing} confirmOverwrite={confirmOverwrite} busy={busy}
            onSubmit={() => { if (existing && !confirmOverwrite) setConfirmOverwrite(true); else doSubmit(); }}
            onUnpublish={unpublish} onCancelConfirm={() => setConfirmOverwrite(false)} submitIcon={<Zap className="size-4" />} />
        </motion.div>
      )}
    </Panel>
  );
}

// ============================================================
// Vote Control Panel
// ============================================================
function VotePanel({ token, ok, err }: { token: string; ok: (m: string) => void; err: (m: string) => void }) {
  const [team1, setTeam1] = useState("");
  const [team2, setTeam2] = useState("");
  const [champion, setChampion] = useState("");
  const [count, setCount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [clearing, setClearing] = useState(false);

  async function inject() {
    setBusy(true);
    try {
      await api("POST", `/api/admin/vote_inject?count=${count}`, { team1, team2, champion }, token);
      ok(`Injected ${count} votes for ${team1} vs ${team2} (champ: ${champion})`);
    } catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  async function clear() {
    if (!confirm("Nuke all fan votes? Cannot be undone.")) return;
    setClearing(true);
    try {
      const data = (await api("DELETE", "/api/admin/votes/clear", undefined, token)) as { deleted: number };
      ok(`Cleared ${data.deleted} votes.`);
    } catch (e) { err(e instanceof Error ? e.message : "Failed"); }
    finally { setClearing(false); }
  }

  return (
    <Panel icon={<Users className="size-5" />} title="Fan Vote Control" accent="var(--foil-magenta)">
      <Field label="Finalist Team 1"><Input type="text" value={team1} onChange={e => setTeam1(e.target.value)} placeholder="Country name" /></Field>
      <Field label="Finalist Team 2"><Input type="text" value={team2} onChange={e => setTeam2(e.target.value)} placeholder="Country name" /></Field>
      <Field label="Champion Pick"><Input type="text" value={champion} onChange={e => setChampion(e.target.value)} placeholder="Country name" /></Field>
      <Field label="Inject Count (spam factor 😈)"><Input type="number" min="1" max="9999" value={count} onChange={e => setCount(e.target.value)} /></Field>
      <div className="flex gap-3 pt-1">
        <Btn variant="primary" icon={<Users className="size-4" />} disabled={busy} onClick={inject} className="flex-1">{busy ? "Injecting…" : "Inject Votes"}</Btn>
        <Btn variant="danger" icon={<Trash2 className="size-4" />} disabled={clearing} onClick={clear} className="flex-1">{clearing ? "Clearing…" : "Clear All"}</Btn>
      </div>
    </Panel>
  );
}

// ============================================================
// Dashboard
// ============================================================
function Dashboard({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { toasts, ok, err } = useToasts();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-16">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex items-center justify-between">
        <div>
          <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">Authorised Access</div>
          <h1 className="mt-1">ADMIN DASHBOARD</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="stamp" style={{ color: "var(--stamp-red)" }}>RESTRICTED</span>
          <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground/40 display uppercase tracking-wider px-3 py-1.5 text-sm hover:bg-muted transition-colors">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </motion.header>

      <div className="grid lg:grid-cols-2 gap-6">
        <GroupResultsPanel token={session.token} ok={ok} err={err} />
        <div className="flex flex-col gap-6">
          <KnockoutResultsPanel token={session.token} ok={ok} err={err} />
          <VotePanel token={session.token} ok={ok} err={err} />
        </div>
      </div>

      <ToastStack toasts={toasts} />
    </div>
  );
}

// ============================================================
// Root
// ============================================================
export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  return (
    <AnimatePresence mode="wait">
      {session ? (
        <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <Dashboard session={session} onLogout={() => setSession(null)} />
        </motion.div>
      ) : (
        <motion.div key="login" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <LoginScreen onLogin={setSession} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
