import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { useSEO } from "../lib/useSEO";
import { usePicks } from "../lib/PicksContext";
import type { Stage } from "../lib/types";
import { GROUP_LETTERS } from "../lib/data";
import { useState } from "react";
import { GroupRanker } from "../components/GroupRanker";
import { MatchPicker } from "../components/MatchPicker";
import { StageStepper } from "../components/StageStepper";
import { TeamSticker } from "../components/TeamSticker";
import { useVotes } from "../lib/VotesContext";
import { ShareStory } from "../components/ShareStory";
import { ReferralDashboard, FriendsComparison } from "../components/Referral";
import { loadMyVote, saveMyVote } from "../lib/identity";
import { api } from "../lib/api";

const NEXT_STAGE: Record<Stage, Stage> = {
  intro: "groups",
  groups: "r32",
  r32: "r16",
  r16: "qf",
  qf: "results",
  results: "results",
};

export default function Play() {
  useSEO({
    title: "Play · FIFA Worldcup Predictor",
    description:
      "Pick the 2026 FIFA World Cup yourself: rank the groups, choose the knockouts, hand it over to the ML for the final stretch.",
  });
  const { state, gotoStage } = usePicks();

  // Shareable link states
  const [refId, setRefId] = useState<number | null>(null);
  const [sharedData, setSharedData] = useState<any>(null);
  const [myVoteId, setMyVoteId] = useState<number | null>(null);
  const [myUniqueName, setMyUniqueName] = useState<string | null>(null);

  useEffect(() => {
    if (state.stage === "intro") gotoStage("groups");

    // Parse ref parameter
    const ref = new URLSearchParams(window.location.search).get("ref");
    if (ref) {
      const parsedRef = parseInt(ref, 10);
      if (!isNaN(parsedRef)) {
        setRefId(parsedRef);
        api.voteShared(parsedRef)
          .then((data) => setSharedData(data))
          .catch(() => {});
      }
    }

    // Restore a previous vote so the referral hub + results survive a browser refresh and the
    // 12-hour vote lock (the user can always retrieve their referral id and who played under them).
    const mine = loadMyVote();
    if (mine) {
      setMyVoteId(mine.voteId);
      setMyUniqueName(mine.name);
    }
  }, [state.stage, gotoStage]);

  const refreshShared = () => {
    if (refId) {
      api.voteShared(refId)
        .then((data) => setSharedData(data))
        .catch(() => {});
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-12">
      {/* Referral Banner */}
      {sharedData && (
        <div className="mb-6 rounded-[10px] border-2 border-foreground bg-foreground text-background p-3.5 flex flex-wrap items-center justify-between shadow-[3px_3px_0_var(--foil-gold)]">
          <div className="flex items-center gap-2">
            <Trophy className="size-4" style={{ color: "var(--foil-gold)" }} />
            <span className="display text-[11px] tracking-wider uppercase font-semibold">
              Comparing your picks with {sharedData.referrer.name}'s bracket!
            </span>
          </div>
          <div className="text-[10px] mono uppercase text-background/70 font-bold">
            Their champion: {sharedData.referrer.champion}
          </div>
        </div>
      )}

      <StageStepper />
      <AnimatePresence mode="wait">
        <motion.div
          key={state.stage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
        >
          {state.stage === "groups" && <GroupsStage />}
          {state.stage === "r32" && (
            <KnockoutStage round="R32" title="Round of 32" />
          )}
          {state.stage === "r16" && (
            <KnockoutStage round="R16" title="Round of 16" />
          )}
          {state.stage === "qf" && (
            <KnockoutStage round="QF" title="Quarter-finals" />
          )}
          {state.stage === "results" && (
            <ResultsStage
              refId={refId}
              sharedData={sharedData}
              myVoteId={myVoteId}
              myUniqueName={myUniqueName}
              setMyVoteId={setMyVoteId}
              setMyUniqueName={setMyUniqueName}
              refreshShared={refreshShared}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}

// ---------- Groups stage ----------
function GroupsStage() {
  const { markComplete, gotoStage, autoFillAll, resetPicks } = usePicks();
  return (
    <section>
      <StageHeader
        eyebrow="Stage 1 of 5"
        title="Rank the 12 groups"
        body="The ML has already ranked each pool. Reorder with the arrows when you disagree — top 2 advance; the 8 strongest 3rd-placers join them. Once a group's matches are all official, its order locks to the real result."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {GROUP_LETTERS.map((g) => (
          <div key={g}>
            <GroupRanker group={g} />
          </div>
        ))}
      </div>
      <StageFooter
        onContinue={() => {
          markComplete("groups");
          gotoStage("r32");
        }}
        onAutoFill={() => {
          autoFillAll();
        }}
        onReset={resetPicks}
        continueLabel="Lock groups → R32"
      />
    </section>
  );
}

// ---------- Knockout stage ----------
function KnockoutStage({
  round,
  title,
}: {
  round: "R32" | "R16" | "QF";
  title: string;
}) {
  const { bracket, setKoWinner, markComplete, gotoStage, autoFillAll, state } =
    usePicks();
  const matches =
    round === "R32" ? bracket.r32 : round === "R16" ? bracket.r16 : bracket.qf;

  const made = matches.filter((m) => state.knockoutPicks[m.matchId]).length;
  const stageId: Stage = round === "R32" ? "r32" : round === "R16" ? "r16" : "qf";

  return (
    <section>
      <StageHeader
        eyebrow={`Stage ${round === "R32" ? 2 : round === "R16" ? 3 : 4} of 5`}
        title={title}
        body={`Tap a team to crown them. Untouched matches use the ML's pick — ${made}/${matches.length} on the card so far.`}
      />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {matches.map((m) => (
          <div key={m.matchId}>
            {/* An admin-finalised match is locked: players can't change it and it drives the ML pick. */}
            <MatchPicker
              match={m}
              mode={m.official ? "locked" : "live"}
              onPick={m.official ? undefined : (side) => setKoWinner(m.matchId, side)}
            />
          </div>
        ))}
      </div>
      <StageFooter
        onContinue={() => {
          markComplete(stageId);
          gotoStage(NEXT_STAGE[stageId]);
        }}
        onAutoFill={autoFillAll}
        continueLabel={
          round === "QF"
            ? "Hand it to the ML → Sim"
            : `Continue → ${
                NEXT_STAGE[stageId] === "r16"
                  ? "R16"
                  : NEXT_STAGE[stageId] === "qf"
                  ? "QF"
                  : "Sim"
              }`
        }
      />
    </section>
  );
}

// ---------- Results stage ----------
function ResultsStage({
  refId,
  sharedData,
  myVoteId,
  myUniqueName,
  setMyVoteId,
  setMyUniqueName,
  refreshShared,
}: {
  refId: number | null;
  sharedData: any;
  myVoteId: number | null;
  myUniqueName: string | null;
  setMyVoteId: (id: number) => void;
  setMyUniqueName: (name: string) => void;
  refreshShared: () => void;
}) {
  const { bracket, resetPicks } = usePicks();
  const champion = bracket.champion;
  return (
    <section>
      <StageHeader
        eyebrow="Stage 5 of 5"
        title="The model takes it home"
        body="With your bracket locked through the quarters, the ML simulates the semis and final."
      />

      {/* Champion ticket */}
      <div className="mx-auto max-w-md ticket bg-card border-2 border-foreground p-6 text-center relative my-6">
        <div className="halftone absolute inset-0 text-foreground pointer-events-none opacity-25" />
        <div className="relative">
          <Trophy
            className="size-8 mx-auto mb-1"
            style={{ color: "var(--foil-gold)" }}
          />
          <div className="display tracking-[0.3em] text-[11px] text-muted-foreground">
            CHAMPION
          </div>
          {champion && (
            <>
              <img
                src={`https://flagcdn.com/w320/${champion.iso}.png`}
                alt={champion.name}
                className="mx-auto mt-3 rounded-sm border-2 border-foreground/20"
                style={{ width: 200, height: 140, objectFit: "cover" }}
              />
              <div className="mt-3 display text-4xl tracking-tight">
                {champion.name.toUpperCase()}
              </div>
            </>
          )}
        </div>
        <span
          className="absolute -top-3 -right-3 stamp"
          style={{ color: "var(--stamp-red)" }}
        >
          ML CALL
        </span>
      </div>

      {/* SF + Final */}
      <div className="grid md:grid-cols-3 gap-3 mb-8">
        {bracket.sf.map((m) => (
          <MatchPicker key={m.matchId} match={m} mode="locked" />
        ))}
        {bracket.final && (
          <div className="md:col-span-1 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 stamp z-10" style={{color: "var(--foil-magenta)"}}>FINAL</div>
            <MatchPicker match={bracket.final} mode="locked" />
          </div>
        )}
      </div>

      {!myVoteId ? (
        <ResultsVote
          refId={refId}
          setMyVoteId={setMyVoteId}
          setMyUniqueName={setMyUniqueName}
          refreshShared={refreshShared}
        />
      ) : (
        <>
        <section className="mt-6 rounded-[14px] border-2 border-foreground bg-card p-5 text-center shadow-[4px_4px_0_var(--foil-blue)]">
          <h2 className="display tracking-wide font-bold" style={{ color: "var(--pitch)" }}>🎉 Champion Locked In!</h2>
          <p className="text-sm mt-1">
            You played as <strong>{myUniqueName}</strong>
            {champion && <> · your champion is <strong>{champion.name}</strong></>}.
          </p>
        </section>
        <ReferralDashboard voteId={myVoteId} myName={myUniqueName ?? "A fan"} />
        {champion && (
          <ShareStory
            userName={myUniqueName ?? "A fan"}
            championName={champion.name}
            championIso={champion.iso}
            championElo={bracket.championElo}
            voteId={myVoteId}
          />
        )}
        </>
      )}

      {sharedData && refId !== myVoteId && (
        <section className="mt-8 rounded-[14px] border-2 border-foreground bg-card p-5">
          <h2 className="display tracking-wide mb-1">
            Comparing top-4 picks with {sharedData.referrer.name}'s bracket
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {sharedData.referrer.name}'s champion: {sharedData.referrer.champion}. Similarity counts how
            many of your top-4 teams match theirs.
          </p>
          <FriendsComparison data={sharedData} youName={myUniqueName ?? undefined} />
        </section>
      )}

      {/* Your bracket trail */}
      <section className="mt-8 rounded-[14px] border-2 border-foreground/15 bg-card p-5">
        <h2 className="display tracking-wide mb-3">Your bracket, in stickers</h2>
        <div className="space-y-3">
          <Trail label="Your final 4" teams={bracket.qf.map((m) => m.winnerTeam)} />
          <Trail
            label="Last 8"
            teams={bracket.r16.map((m) => m.winnerTeam)}
          />
        </div>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={resetPicks}
          className="inline-flex items-center gap-2 rounded-md border-2 border-foreground display uppercase tracking-wider px-4 py-2 hover:bg-muted transition-colors"
        >
          <RotateCcw className="size-4" /> Start over
        </button>
      </div>
    </section>
  );
}

function ResultsVote({
  refId,
  setMyVoteId,
  setMyUniqueName,
  refreshShared,
}: {
  refId: number | null;
  setMyVoteId: (id: number) => void;
  setMyUniqueName: (name: string) => void;
  refreshShared: () => void;
}) {
  const { bracket, state } = usePicks();
  const { submit } = useVotes();
  const [voterName, setVoterName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const fin = bracket.final;
  const champ = bracket.champion;
  if (!fin || !champ) return null;
  const t1 = fin.home.name;
  const t2 = fin.away.name;
  // The bracket's final four (semi-finalists) are the user's top-4 picks, stored so the referral
  // comparison can show full top lists, not just the champion.
  const top4 = bracket.qf.map((m) => m.winnerTeam.name);

  async function go() {
    if (!voterName.trim()) {
      setErr("Please enter your name to submit your vote.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      // A finished bracket casts ONE champion vote (the team it crowns). The finalists + top-4 ride
      // along in the payload for the referral comparison, but only the champion lands on the board.
      const res = await submit(champ!.name, undefined, champ!.name, voterName, refId || undefined, {
        groupOrder: state.groupOrder,
        knockoutPicks: state.knockoutPicks,
        champion: champ!.name,
        finalists: [t1, t2],
        top4,
        source: "play",
      });
      setMyVoteId(res.vote_id);
      setMyUniqueName(res.name);
      saveMyVote({ voteId: res.vote_id, name: res.name });
      refreshShared();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not submit your vote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-[14px] border-2 border-foreground bg-card p-5 text-center shadow-[4px_4px_0_var(--foil-magenta)]">
      <h2 className="display tracking-wide font-bold">Lock your champion into the Fan Vote</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">
        Your bracket crowns <strong>{champ.name}</strong> (final: {t1} vs {t2}). Submit to add your
        champion to the people's board and see how the crowd is calling it.
      </p>

      <div className="max-w-sm mx-auto mb-4 text-left">
        <label htmlFor="voter-name" className="display text-[10px] tracking-[0.2em] uppercase text-muted-foreground block mb-1.5 font-semibold">
          Your Name
        </label>
        <input
          id="voter-name"
          type="text"
          value={voterName}
          onChange={(e) => setVoterName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-md border-2 border-foreground/20 bg-background px-3 py-2 text-sm focus:outline-none focus:border-foreground transition-colors font-medium"
          maxLength={30}
          required
        />
        <p className="mt-1.5 text-[9px] text-muted-foreground leading-normal italic">
          🔒 Your name is saved only for this session/share-link and will be deleted from the database after the competition.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={go}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-md bg-foreground text-background display uppercase tracking-wider px-4 py-2 disabled:opacity-50 hover:enabled:translate-y-[-2px] hover:enabled:shadow-[3px_5px_0_var(--stamp-red)] transition-all font-bold"
        >
          {busy ? "Saving…" : "Submit my champion"}
        </button>
        <a
          href="/"
          className="inline-flex items-center gap-2 rounded-md border-2 border-foreground display uppercase tracking-wider px-4 py-2 hover:bg-muted transition-colors font-bold"
        >
          See the board
        </a>
      </div>
      {err && (
        <div className="mt-3 text-xs" style={{ color: "var(--stamp-red)" }}>
          {err}
        </div>
      )}
    </section>
  );
}

function Trail({
  label,
  teams,
}: {
  label: string;
  teams: { name: string; iso: string; elo: number; group: string }[];
}) {
  return (
    <div>
      <div className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground mb-1.5">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {teams.map((t, i) => (
          <TeamSticker
            key={`${t.name}-${i}`}
            team={t}
            size="sm"
            rotation={((i % 3) - 1) * 1.2}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Shared bits ----------
function StageHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <header className="mb-6">
      <div className="display text-[11px] tracking-[0.3em] uppercase text-muted-foreground">
        {eyebrow}
      </div>
      <h1 className="mt-1">{title.toUpperCase()}</h1>
      <p className="mt-2 text-muted-foreground max-w-2xl">{body}</p>
    </header>
  );
}

function StageFooter({
  onContinue,
  onAutoFill,
  onReset,
  continueLabel,
}: {
  onContinue: () => void;
  onAutoFill?: () => void;
  onReset?: () => void;
  continueLabel: string;
}) {
  return (
    <div className="sticky bottom-3 mt-8 z-30">
      <div className="rounded-[14px] border-2 border-foreground bg-background/95 backdrop-blur-md px-4 py-3 flex flex-wrap items-center gap-3 shadow-[0_8px_0_-4px_var(--foreground)]">
        <span className="display text-[11px] tracking-[0.2em] uppercase text-muted-foreground">
          Ready?
        </span>
        {onAutoFill && (
          <button
            type="button"
            onClick={onAutoFill}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground display uppercase tracking-wider px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <Sparkles className="size-3.5" />
            Auto-fill rest
          </button>
        )}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-md border-2 border-foreground/40 display uppercase tracking-wider px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-foreground text-background display uppercase tracking-wider px-4 py-2 hover:translate-y-[-2px] hover:shadow-[3px_5px_0_var(--stamp-red)] transition-all"
        >
          {continueLabel} <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
