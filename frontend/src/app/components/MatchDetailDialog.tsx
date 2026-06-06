import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Loader2, Newspaper, X, ExternalLink } from "lucide-react";
import { api } from "../lib/api";
import type { MatchDetail } from "../lib/types";

export interface MatchRef {
  home: string;
  away: string;
  homeIso?: string;
  awayIso?: string;
  round?: string;
  date?: string;
  venue?: string;
}

interface Props {
  match: MatchRef | null;
  onClose: () => void;
}

/** Click-through match detail: win probabilities, probable XIs, head-to-head and related news. */
export function MatchDetailDialog({ match, onClose }: Props) {
  const [data, setData] = useState<MatchDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!match) return;
    let alive = true;
    setStatus("loading");
    setData(null);
    api
      .match(match.home, match.away)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setStatus("ready");
      })
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [match]);

  // Escape to close + lock background scroll while open.
  useEffect(() => {
    if (!match) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [match, onClose]);

  return (
    <AnimatePresence>
      {match && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${match.home} vs ${match.away}`}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="relative w-full max-w-2xl my-auto rounded-[18px] border-2 border-foreground bg-card shadow-[6px_8px_0_-2px_var(--foreground)]"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 rounded-md border-2 border-foreground/20 bg-background p-1.5 hover:bg-muted"
            >
              <X className="size-4" />
            </button>

            {/* Header */}
            <div className="relative px-5 pt-5 pb-4 border-b-2 border-foreground/10">
              <div className="display text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
                {match.round || "Match insight"}
                {match.date ? ` · ${match.date}` : ""}
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <TeamHead name={match.home} iso={match.homeIso || data?.home.iso} />
                <div className="text-center">
                  {status === "ready" && data ? (
                    <div className="mono text-3xl tabular-nums leading-none">
                      {data.predicted.homeGoals}
                      <span className="text-muted-foreground mx-1">–</span>
                      {data.predicted.awayGoals}
                    </div>
                  ) : (
                    <div className="display text-2xl text-muted-foreground">vs</div>
                  )}
                  <div className="text-[9px] mono uppercase tracking-wider text-muted-foreground mt-1">
                    model pick
                  </div>
                </div>
                <TeamHead name={match.away} iso={match.awayIso || data?.away.iso} reverse />
              </div>
              {match.venue && (
                <div className="mt-2 text-center mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {match.venue}
                </div>
              )}
            </div>

            <div className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
              {status === "loading" && (
                <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" /> Loading match insight…
                </div>
              )}
              {status === "error" && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Could not load this match right now.
                </div>
              )}
              {status === "ready" && data && (
                <>
                  <WinProbabilities data={data} home={match.home} away={match.away} />
                  {data.hasNews && <RelatedNews data={data} />}
                  <Lineups data={data} home={match.home} away={match.away} />
                  <HeadToHead data={data} home={match.home} away={match.away} />
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TeamHead({ name, iso, reverse }: { name: string; iso?: string; reverse?: boolean }) {
  return (
    <div
      className={`flex items-center gap-2 min-w-0 ${reverse ? "flex-row-reverse text-right" : ""}`}
    >
      {iso && (
        <img
          src={`https://flagcdn.com/w80/${iso}.png`}
          alt=""
          width={36}
          height={24}
          className="rounded-[2px] shadow-[0_0_0_1px_rgba(24,18,14,0.18)] shrink-0"
        />
      )}
      <span className="display text-base sm:text-lg tracking-wide truncate">{name}</span>
    </div>
  );
}

function WinProbabilities({
  data,
  home,
  away,
}: {
  data: MatchDetail;
  home: string;
  away: string;
}) {
  const { home: ph, draw: pd, away: pa } = data.probabilities;
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  return (
    <section>
      <SectionTitle>Win probability</SectionTitle>
      <div className="flex h-7 w-full overflow-hidden rounded-md border-2 border-foreground/20 text-[10px] display">
        <Bar value={ph} color="var(--foil-blue, #2b6cb0)" label={pct(ph)} />
        <Bar value={pd} color="var(--muted-foreground)" label={pct(pd)} muted />
        <Bar value={pa} color="var(--stamp-red)" label={pct(pa)} />
      </div>
      <div className="mt-1.5 flex justify-between mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{home} win</span>
        <span>Draw</span>
        <span>{away} win</span>
      </div>
    </section>
  );
}

function Bar({
  value,
  color,
  label,
  muted,
}: {
  value: number;
  color: string;
  label: string;
  muted?: boolean;
}) {
  if (value <= 0) return null;
  return (
    <div
      className="flex items-center justify-center text-background"
      style={{
        width: `${Math.max(value * 100, 8)}%`,
        background: color,
        color: muted ? "var(--background)" : undefined,
      }}
      title={label}
    >
      {value > 0.08 ? label : ""}
    </div>
  );
}

function RelatedNews({ data }: { data: MatchDetail }) {
  return (
    <section>
      <SectionTitle>
        <Newspaper className="size-3.5 inline-block mr-1 -mt-0.5" /> Related news
      </SectionTitle>
      <ul className="space-y-2">
        {data.news.map((n) => (
          <li key={n.id}>
            <a
              href={n.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md border border-foreground/10 bg-background/60 px-3 py-2 hover:border-foreground/30 transition-colors"
            >
              <div className="text-sm font-medium flex items-start gap-1">
                <span className="flex-1">{n.title}</span>
                <ExternalLink className="size-3 mt-1 shrink-0 text-muted-foreground" />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{n.summary}</div>
              <div className="mono text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                {n.source}
                {n.date ? ` · ${n.date}` : ""}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Lineups({
  data,
  home,
  away,
}: {
  data: MatchDetail;
  home: string;
  away: string;
}) {
  return (
    <section>
      <SectionTitle>Probable line-ups</SectionTitle>
      <div className="grid grid-cols-2 gap-4">
        <LineupCol team={home} lineup={data.lineups.home} />
        <LineupCol team={away} lineup={data.lineups.away} />
      </div>
    </section>
  );
}

function LineupCol({
  team,
  lineup,
}: {
  team: string;
  lineup: MatchDetail["lineups"]["home"];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="display text-sm tracking-wide truncate">{team}</span>
        <span className="mono text-[10px] text-muted-foreground">{lineup.formation}</span>
      </div>
      <ul className="space-y-0.5">
        {lineup.players.map((p, i) => (
          <li
            key={`${p.name}-${i}`}
            className="flex items-center gap-2 text-xs rounded px-1.5 py-0.5 odd:bg-background/50"
          >
            <span className="mono text-[9px] w-7 text-muted-foreground">{p.position}</span>
            <span className={`flex-1 truncate ${p.name === "—" ? "text-muted-foreground" : ""}`}>
              {p.name}
            </span>
            <span className="mono text-[10px] text-muted-foreground tabular-nums">
              {p.rating || ""}
            </span>
          </li>
        ))}
      </ul>
      {lineup.partial && (
        <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground mt-1">
          Limited squad data
        </div>
      )}
    </div>
  );
}

function HeadToHead({
  data,
  home,
  away,
}: {
  data: MatchDetail;
  home: string;
  away: string;
}) {
  const h = data.h2h;
  return (
    <section>
      <SectionTitle>Head-to-head</SectionTitle>
      {h.played === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recorded meetings between {home} and {away} in the dataset.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <Stat n={h.home_wins} label={`${home} wins`} />
            <Stat n={h.draws} label="Draws" />
            <Stat n={h.away_wins} label={`${away} wins`} />
          </div>
          <div className="space-y-1">
            {h.recent.map((m, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs rounded-md border border-foreground/10 bg-background/60 px-2 py-1"
              >
                <span className="text-muted-foreground mono">{m.date}</span>
                <span className="tabular-nums">
                  {home} {m.home_goals}
                  <span className="text-muted-foreground mx-1">–</span>
                  {m.away_goals} {away}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-md border border-foreground/10 bg-background/60 py-2">
      <div className="display text-2xl">{n}</div>
      <div className="mono text-[9px] uppercase tracking-wider text-muted-foreground truncate px-1">
        {label}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-2">
      {children}
    </h3>
  );
}
