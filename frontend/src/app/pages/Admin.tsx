import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck, LogOut, Trophy, Users, Trash2, Zap,
  CheckCircle, AlertTriangle, Lock, ChevronDown
} from "lucide-react";

// ---- types ----
type Session = { username: string; token: string };
type Toast = { id: number; type: "ok" | "err"; msg: string };
type GroupFixture = { match_id: number; group: string; home_team: string; away_team: string; date_utc: string; venue: string };
type KnockoutFixture = { match_id: number; round: string; slot_home: string; slot_away: string; date_utc: string };
type OfficialResult = { match_id: number; stage: string; home_team: string; away_team: string; home_goals: number; away_goals: number; locked: boolean };

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
                placeholder="ahbab"
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

function GroupResultsPanel({ token, ok, err }: { token: string; ok: (m: string) => void; err: (m: string) => void }) {
  const [fixtures, setFixtures] = useState<GroupFixture[]>([]);
  const [results, setResults] = useState<Record<number, OfficialResult>>({});
  const [selectedGroup, setSelectedGroup] = useState("A");
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Load group fixtures from our bootstrap data
    fetch("/api/bootstrap").then(r => r.json()).then(d => {
      // Extract matches from groups data
      const all: GroupFixture[] = [];
      if (d.groups) {
        for (const g of Object.values(d.groups) as Array<{group: string; matches: any[]}>) {
          for (const m of g.matches || []) {
            all.push({ match_id: parseInt(String(m.matchId).replace("G","")) || 0, group: g.group, home_team: (m as unknown as {home: {name: string}}).home?.name || "", away_team: (m as unknown as {away: {name: string}}).away?.name || "", date_utc: (m as unknown as {date: string}).date || "", venue: (m as unknown as {venue: string}).venue || "" });
          }
        }
      }
      all.sort((a,b) => a.match_id - b.match_id);
      setFixtures(all);
      // Load existing results
      fetch("/api/results").then(r => r.json()).then(rd => {
        const map: Record<number, OfficialResult> = {};
        for (const r of rd.results || []) map[r.match_id] = r;
        setResults(map);
      });
    }).catch(() => {});
  }, []);

  const groupFixtures = fixtures.filter(f => f.group === selectedGroup);
  const selected = selectedMatchId !== null ? fixtures.find(f => f.match_id === selectedMatchId) : null;
  const existing = selectedMatchId !== null ? results[selectedMatchId] : null;

  async function submit() {
    if (!selected || selectedMatchId === null) return;
    setBusy(true);
    try {
      await api("POST", "/api/admin/result", {
        match_id: selectedMatchId,
        stage: `Group ${selected.group}`,
        home_team: selected.home_team,
        away_team: selected.away_team,
        home_goals: parseInt(homeGoals) || 0,
        away_goals: parseInt(awayGoals) || 0,
        locked,
      }, token);
      setResults(prev => ({ ...prev, [selectedMatchId]: { match_id: selectedMatchId, stage: `Group ${selected.group}`, home_team: selected.home_team, away_team: selected.away_team, home_goals: parseInt(homeGoals)||0, away_goals: parseInt(awayGoals)||0, locked } }));
      ok(`✓ ${selected.home_team} ${homeGoals}–${awayGoals} ${selected.away_team}`);
    } catch (e) {
      err(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function selectMatch(id: number) {
    setSelectedMatchId(id);
    const ex = results[id];
    if (ex) { setHomeGoals(String(ex.home_goals)); setAwayGoals(String(ex.away_goals)); setLocked(ex.locked); }
    else { setHomeGoals(""); setAwayGoals(""); setLocked(true); }
  }

  return (
    <Panel icon={<Trophy className="size-5" />} title="Group Stage Results" accent="var(--foil-gold)">
      {/* Group tabs */}
      <div className="flex flex-wrap gap-1">
        {GROUP_LETTERS.map(g => (
          <button key={g} onClick={() => { setSelectedGroup(g); setSelectedMatchId(null); }}
            className={`display text-xs tracking-wider px-2.5 py-1 rounded border-2 transition-colors ${selectedGroup === g ? "bg-foreground text-background border-foreground" : "border-foreground/20 hover:bg-muted"}`}>
            {g}
          </button>
        ))}
      </div>

      {/* Match list for selected group */}
      <div className="space-y-1.5">
        {groupFixtures.length === 0 && <p className="text-sm text-muted-foreground">No fixtures loaded.</p>}
        {groupFixtures.map(f => {
          const res = results[f.match_id];
          const isSelected = selectedMatchId === f.match_id;
          return (
            <button key={f.match_id} onClick={() => selectMatch(f.match_id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md border-2 text-sm transition-all text-left ${isSelected ? "border-foreground bg-muted" : "border-foreground/10 hover:border-foreground/30"}`}>
              <span className="font-medium">{f.home_team} <span className="text-muted-foreground">vs</span> {f.away_team}</span>
              {res ? (
                <span className="display text-sm font-bold" style={{ color: "var(--pitch)" }}>{res.home_goals}–{res.away_goals}{res.locked ? " 🔒" : ""}</span>
              ) : (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">pending</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Score entry for selected match */}
      {selected && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pt-2 border-t-2 border-foreground/10 space-y-3">
          <div className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
            Enter result: {selected.home_team} vs {selected.away_team}
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
            <span className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">Mark as official (locked)</span>
          </label>
          <Btn variant="primary" icon={<Trophy className="size-4" />} disabled={busy} onClick={submit} className="w-full">
            {busy ? "Saving…" : "Submit Result"}
          </Btn>
        </motion.div>
      )}
    </Panel>
  );
}

// ============================================================
// Knockout Results Panel
// ============================================================
const KO_ROUNDS = ["Round of 32", "Round of 16", "Quarter-finals", "Semi-finals", "Final"];

function KnockoutResultsPanel({ token, ok, err }: { token: string; ok: (m: string) => void; err: (m: string) => void }) {
  const [selectedRound, setSelectedRound] = useState("Round of 32");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");
  const [winnerTeam, setWinnerTeam] = useState("");
  const [matchId, setMatchId] = useState("");
  const [locked, setLocked] = useState(true);
  const [busy, setBusy] = useState(false);

  const isDraw = homeGoals !== "" && awayGoals !== "" && parseInt(homeGoals) === parseInt(awayGoals);

  async function submit() {
    setBusy(true);
    try {
      if (isDraw && !winnerTeam) {
        throw new Error("Please select the penalty shootout winner.");
      }
      await api("POST", "/api/admin/result", {
        match_id: parseInt(matchId) || 0,
        stage: selectedRound,
        home_team: homeTeam,
        away_team: awayTeam,
        home_goals: parseInt(homeGoals) || 0,
        away_goals: parseInt(awayGoals) || 0,
        locked,
        winner_team: isDraw ? winnerTeam : null,
      }, token);
      ok(`✓ ${homeTeam} ${homeGoals}–${awayGoals} ${awayTeam} (${selectedRound})${isDraw ? ` (Shootout: ${winnerTeam})` : ""}`);
    } catch (e) {
      err(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel icon={<Zap className="size-5" />} title="Knockout Results" accent="var(--foil-blue)">
      {/* Round tabs */}
      <div className="flex flex-wrap gap-1">
        {KO_ROUNDS.map(r => (
          <button key={r} onClick={() => setSelectedRound(r)}
            className={`display text-[10px] tracking-wider px-2.5 py-1 rounded border-2 transition-colors ${selectedRound === r ? "bg-foreground text-background border-foreground" : "border-foreground/20 hover:bg-muted"}`}>
            {r === "Round of 32" ? "R32" : r === "Round of 16" ? "R16" : r === "Quarter-finals" ? "QF" : r === "Semi-finals" ? "SF" : "FINAL"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Match ID">
          <Input type="number" value={matchId} onChange={e => setMatchId(e.target.value)} placeholder="e.g. 73" />
        </Field>
        <div className="flex items-end">
          <span className="text-xs text-muted-foreground">R32: 73–88 · R16: 89–96<br />QF: 97–100 · SF: 101–102<br />Final: 104</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Home Team">
          <Input type="text" value={homeTeam} onChange={e => setHomeTeam(e.target.value)} placeholder="Spain" />
        </Field>
        <Field label="Home Goals">
          <Input type="number" min="0" value={homeGoals} onChange={e => setHomeGoals(e.target.value)} placeholder="2" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Away Team">
          <Input type="text" value={awayTeam} onChange={e => setAwayTeam(e.target.value)} placeholder="Argentina" />
        </Field>
        <Field label="Away Goals">
          <Input type="number" min="0" value={awayGoals} onChange={e => setAwayGoals(e.target.value)} placeholder="1" />
        </Field>
      </div>

      {isDraw && (
        <Field label="Penalty Shootout Winner">
          <Select value={winnerTeam} onChange={e => setWinnerTeam(e.target.value)}>
            <option value="">-- Select Shootout Winner --</option>
            {homeTeam && <option value={homeTeam}>{homeTeam}</option>}
            {awayTeam && <option value={awayTeam}>{awayTeam}</option>}
          </Select>
        </Field>
      )}

      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} />
        <span className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">Mark as official (locked)</span>
      </label>
      <Btn variant="primary" icon={<Zap className="size-4" />} disabled={busy} onClick={submit} className="w-full">
        {busy ? "Saving…" : "Submit Knockout Result"}
      </Btn>
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
      <Field label="Finalist Team 1"><Input type="text" value={team1} onChange={e => setTeam1(e.target.value)} placeholder="Spain" /></Field>
      <Field label="Finalist Team 2"><Input type="text" value={team2} onChange={e => setTeam2(e.target.value)} placeholder="France" /></Field>
      <Field label="Champion Pick"><Input type="text" value={champion} onChange={e => setChampion(e.target.value)} placeholder="Spain" /></Field>
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
