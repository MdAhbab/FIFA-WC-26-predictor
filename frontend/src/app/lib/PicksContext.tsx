import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  GROUP_LETTERS,
  TEAMS,
  VENUES,
  getAllGroupForecasts,
  predictMatch,
  teamByName,
} from "./data";
import { triggerKick } from "./KickFx";
import type {
  GroupForecast,
  GroupStanding,
  RawTeam,
  Stage,
} from "./types";

// ---------- State ----------
export interface PicksState {
  groupOrder: Record<string, string[]>; // group letter -> 4 team names (pos1..pos4)
  knockoutPicks: Record<string, "home" | "away">; // matchId -> side
  stage: Stage;
  completed: Record<Stage, boolean>;
}

type Action =
  | { type: "SET_GROUP_ORDER"; group: string; teams: string[] }
  | { type: "SWAP_GROUP"; group: string; from: number; to: number }
  | { type: "SET_KO_WINNER"; matchId: string; side: "home" | "away" }
  | { type: "CLEAR_KO"; matchIds: string[] }
  | { type: "GOTO_STAGE"; stage: Stage }
  | { type: "MARK_COMPLETE"; stage: Stage }
  | { type: "RESET" }
  | { type: "HYDRATE"; state: PicksState };

const STORAGE_KEY = "wc26-picks-v1";

export function createInitialPicksState(): PicksState {
  return defaultState();
}

export function getMLBracket(): DerivedBracket {
  const base = defaultState();
  base.stage = "results";
  return deriveBracket(base);
}

function defaultState(): PicksState {
  const groupOrder: Record<string, string[]> = {};
  const forecasts = getAllGroupForecasts();
  for (const g of GROUP_LETTERS) {
    groupOrder[g] = forecasts[g].standings.map((s) => s.team.name);
  }
  return {
    groupOrder,
    knockoutPicks: {},
    stage: "intro",
    completed: {
      intro: false,
      groups: false,
      r32: false,
      r16: false,
      qf: false,
      results: false,
    },
  };
}

function reducer(state: PicksState, action: Action): PicksState {
  switch (action.type) {
    case "SET_GROUP_ORDER":
      return {
        ...state,
        groupOrder: { ...state.groupOrder, [action.group]: action.teams },
        // group changes invalidate every knockout pick
        knockoutPicks: {},
        completed: {
          ...state.completed,
          r32: false,
          r16: false,
          qf: false,
          results: false,
        },
      };
    case "SWAP_GROUP": {
      const arr = [...state.groupOrder[action.group]];
      [arr[action.from], arr[action.to]] = [arr[action.to], arr[action.from]];
      return {
        ...state,
        groupOrder: { ...state.groupOrder, [action.group]: arr },
        knockoutPicks: {},
        completed: {
          ...state.completed,
          r32: false,
          r16: false,
          qf: false,
          results: false,
        },
      };
    }
    case "SET_KO_WINNER":
      return {
        ...state,
        knockoutPicks: {
          ...state.knockoutPicks,
          [action.matchId]: action.side,
        },
      };
    case "CLEAR_KO": {
      const next = { ...state.knockoutPicks };
      action.matchIds.forEach((id) => delete next[id]);
      return { ...state, knockoutPicks: next };
    }
    case "GOTO_STAGE":
      return { ...state, stage: action.stage };
    case "MARK_COMPLETE":
      return {
        ...state,
        completed: { ...state.completed, [action.stage]: true },
      };
    case "RESET":
      return defaultState();
    case "HYDRATE":
      return action.state;
  }
}

// ---------- Derived bracket ----------
export interface KnockoutResult {
  matchId: string;
  round: "R32" | "R16" | "QF" | "SF" | "Final";
  multiplier: number;
  home: RawTeam;
  away: RawTeam;
  homeGoals: number;
  awayGoals: number;
  winner: "home" | "away";
  winnerTeam: RawTeam;
  penalties: boolean;
  corners: number;
  yellows: number;
  reds: number;
  date: string;
  venue: string;
  /** Whether this result reflects a user override of the ML prediction */
  userOverride: boolean;
  /** Whether this stage is unlocked / auto-predicted */
  autoPredicted: boolean;
}

export interface DerivedBracket {
  groups: Record<string, GroupForecast>;
  effectiveStandings: Record<string, GroupStanding[]>;
  bestThirds: Set<string>; // team names
  qualifiers: { team: RawTeam; tag: string }[]; // 32 teams in slot order
  r32: KnockoutResult[];
  r16: KnockoutResult[];
  qf: KnockoutResult[];
  sf: KnockoutResult[];
  final: KnockoutResult | null;
  champion: RawTeam | null;
}

function applyUserPick(
  matchId: string,
  home: RawTeam,
  away: RawTeam,
  mlWinner: "home" | "away",
  mlHomeGoals: number,
  mlAwayGoals: number,
  userPick: "home" | "away" | undefined,
) {
  const winner = userPick ?? mlWinner;
  let homeGoals = mlHomeGoals;
  let awayGoals = mlAwayGoals;
  if (winner !== mlWinner) {
    // swap scoreline so the chosen side has more goals
    [homeGoals, awayGoals] = [awayGoals, homeGoals];
  }
  return {
    winner,
    homeGoals,
    awayGoals,
    winnerTeam: winner === "home" ? home : away,
    userOverride: userPick !== undefined && userPick !== mlWinner,
  };
}

function dateForKO(offset: number) {
  const d = new Date(2026, 6, 1); // July 1, 2026
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function venueFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return VENUES[h % VENUES.length];
}

function makeKO(
  matchId: string,
  round: KnockoutResult["round"],
  multiplier: number,
  home: RawTeam,
  away: RawTeam,
  picks: Record<string, "home" | "away">,
  dayOffset: number,
  autoPredicted: boolean,
): KnockoutResult {
  const r = predictMatch(home, away, matchId, { allowDraw: false });
  const winner = r.winner as "home" | "away";
  const applied = applyUserPick(
    matchId,
    home,
    away,
    winner,
    r.homeGoals,
    r.awayGoals,
    autoPredicted ? undefined : picks[matchId],
  );
  return {
    matchId,
    round,
    multiplier,
    home,
    away,
    homeGoals: applied.homeGoals,
    awayGoals: applied.awayGoals,
    winner: applied.winner,
    winnerTeam: applied.winnerTeam,
    penalties: r.penalties,
    corners: r.corners,
    yellows: r.yellows,
    reds: r.reds,
    date: dateForKO(dayOffset),
    venue: venueFor(matchId),
    userOverride: applied.userOverride,
    autoPredicted,
  };
}

export function deriveBracket(state: PicksState): DerivedBracket {
  const groups = getAllGroupForecasts();
  const effectiveStandings: Record<string, GroupStanding[]> = {};

  for (const g of GROUP_LETTERS) {
    const order = state.groupOrder[g] ?? groups[g].standings.map((s) => s.team.name);
    const lookup = new Map(
      groups[g].standings.map((s) => [s.team.name, s] as const),
    );
    effectiveStandings[g] = order
      .map((name) => lookup.get(name))
      .filter((s): s is GroupStanding => !!s);
  }

  // Pick 8 best third-placed teams by elo
  const thirds = GROUP_LETTERS.map((g) => ({
    g,
    team: effectiveStandings[g][2].team,
  }));
  thirds.sort((a, b) => b.team.elo - a.team.elo);
  const bestThirds = new Set(thirds.slice(0, 8).map((t) => t.team.name));

  // Build the 32-team field
  const winners: { team: RawTeam; tag: string }[] = GROUP_LETTERS.map((g) => ({
    team: effectiveStandings[g][0].team,
    tag: `1${g}`,
  }));
  const runnersUp: { team: RawTeam; tag: string }[] = GROUP_LETTERS.map((g) => ({
    team: effectiveStandings[g][1].team,
    tag: `2${g}`,
  }));
  const thirdsAdvancing: { team: RawTeam; tag: string }[] = GROUP_LETTERS
    .filter((g) => bestThirds.has(effectiveStandings[g][2].team.name))
    .map((g) => ({
      team: effectiveStandings[g][2].team,
      tag: `3${g}`,
    }));

  const qualifiers: { team: RawTeam; tag: string }[] = [];
  const usedTags = new Set<string>();
  const push = (q: { team: RawTeam; tag: string } | undefined) => {
    if (q && !usedTags.has(q.tag)) {
      qualifiers.push(q);
      usedTags.add(q.tag);
    }
  };
  for (let i = 0; i < 12; i++) {
    push(winners[i]);
    if (i < 4) push(thirdsAdvancing[i]);
    push(runnersUp[i]);
    if (i >= 4 && i < 8) push(thirdsAdvancing[i]);
  }
  for (const q of [...winners, ...runnersUp, ...thirdsAdvancing]) {
    if (qualifiers.length >= 32) break;
    push(q);
  }

  // R32 — auto until user reaches r32 stage. We compute ML defaults always
  // and only honor user picks if the stage is unlocked.
  const r32Unlocked = state.stage !== "intro" && state.stage !== "groups";
  const r32: KnockoutResult[] = [];
  for (let i = 0; i < 16; i++) {
    const a = qualifiers[i * 2];
    const b = qualifiers[i * 2 + 1];
    if (!a || !b) continue;
    r32.push(
      makeKO(
        `K${i + 1}`,
        "R32",
        1,
        a.team,
        b.team,
        state.knockoutPicks,
        i,
        !r32Unlocked,
      ),
    );
  }

  const r16Unlocked = ["r16", "qf", "results"].includes(state.stage);
  const r16: KnockoutResult[] = [];
  for (let i = 0; i < r32.length / 2; i++) {
    const a = r32[i * 2].winnerTeam;
    const b = r32[i * 2 + 1].winnerTeam;
    r16.push(
      makeKO(
        `K${17 + i}`,
        "R16",
        2,
        a,
        b,
        state.knockoutPicks,
        16 + i,
        !r16Unlocked,
      ),
    );
  }

  const qfUnlocked = ["qf", "results"].includes(state.stage);
  const qf: KnockoutResult[] = [];
  for (let i = 0; i < r16.length / 2; i++) {
    const a = r16[i * 2].winnerTeam;
    const b = r16[i * 2 + 1].winnerTeam;
    qf.push(
      makeKO(
        `K${25 + i}`,
        "QF",
        3,
        a,
        b,
        state.knockoutPicks,
        24 + i,
        !qfUnlocked,
      ),
    );
  }

  // SF + Final always ML-only
  const sf: KnockoutResult[] = [];
  for (let i = 0; i < qf.length / 2; i++) {
    const a = qf[i * 2].winnerTeam;
    const b = qf[i * 2 + 1].winnerTeam;
    sf.push(
      makeKO(
        `K${29 + i}`,
        "SF",
        4,
        a,
        b,
        state.knockoutPicks,
        28 + i,
        true,
      ),
    );
  }

  let final: KnockoutResult | null = null;
  if (sf.length === 2) {
    final = makeKO(
      "K31",
      "Final",
      6,
      sf[0].winnerTeam,
      sf[1].winnerTeam,
      state.knockoutPicks,
      31,
      true,
    );
  }

  return {
    groups,
    effectiveStandings,
    bestThirds,
    qualifiers,
    r32, r16, qf, sf, final,
    champion: final ? final.winnerTeam : null,
  };
}

// ---------- Context ----------
interface Ctx {
  state: PicksState;
  bracket: DerivedBracket;
  setGroupOrder: (group: string, teams: string[]) => void;
  swapGroup: (group: string, from: number, to: number) => void;
  setKoWinner: (matchId: string, side: "home" | "away") => void;
  gotoStage: (s: Stage) => void;
  markComplete: (s: Stage) => void;
  resetPicks: () => void;
  autoFillAll: () => void;
}

const PicksCtx = createContext<Ctx | null>(null);

export function PicksProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, defaultState);

  // Hydrate once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PicksState;
        // sanity: every group must have 4 team names that exist
        const ok = Object.entries(parsed.groupOrder).every(
          ([, names]) =>
            names.length === 4 && names.every((n) => !!teamByName(n)),
        );
        if (ok) dispatch({ type: "HYDRATE", state: parsed });
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const bracket = useMemo(() => deriveBracket(state), [state]);

  const setGroupOrder = useCallback(
    (group: string, teams: string[]) => {
      dispatch({ type: "SET_GROUP_ORDER", group, teams });
      triggerKick();
    },
    [],
  );
  const swapGroup = useCallback(
    (group: string, from: number, to: number) => {
      dispatch({ type: "SWAP_GROUP", group, from, to });
      triggerKick();
    },
    [],
  );
  const setKoWinner = useCallback(
    (matchId: string, side: "home" | "away") => {
      dispatch({ type: "SET_KO_WINNER", matchId, side });
      triggerKick();
    },
    [],
  );
  const gotoStage = useCallback((stage: Stage) => {
    dispatch({ type: "GOTO_STAGE", stage });
    triggerKick();
  }, []);
  const markComplete = useCallback(
    (stage: Stage) => dispatch({ type: "MARK_COMPLETE", stage }),
    [],
  );
  const resetPicks = useCallback(() => {
    dispatch({ type: "RESET" });
    triggerKick();
  }, []);

  const autoFillAll = useCallback(() => {
    dispatch({ type: "MARK_COMPLETE", stage: "groups" });
    dispatch({ type: "MARK_COMPLETE", stage: "r32" });
    dispatch({ type: "MARK_COMPLETE", stage: "r16" });
    dispatch({ type: "MARK_COMPLETE", stage: "qf" });
    dispatch({ type: "GOTO_STAGE", stage: "results" });
    // small flurry of kicks
    triggerKick();
    setTimeout(triggerKick, 140);
    setTimeout(triggerKick, 280);
    setTimeout(triggerKick, 420);
  }, []);

  const value: Ctx = {
    state,
    bracket,
    setGroupOrder,
    swapGroup,
    setKoWinner,
    gotoStage,
    markComplete,
    resetPicks,
    autoFillAll,
  };
  return <PicksCtx.Provider value={value}>{children}</PicksCtx.Provider>;
}

export function usePicks() {
  const ctx = useContext(PicksCtx);
  if (!ctx) throw new Error("usePicks must be used inside PicksProvider");
  return ctx;
}

// Convenience: champion probability from ELO softmax over all teams
export function teamChampionProbabilities(): {
  team: RawTeam;
  prob: number;
}[] {
  const elos = TEAMS.map((t) => t.elo);
  const max = Math.max(...elos);
  const exps = elos.map((e) => Math.exp((e - max) / 60));
  const sum = exps.reduce((a, b) => a + b, 0);
  return TEAMS.map((t, i) => ({ team: t, prob: exps[i] / sum })).sort(
    (a, b) => b.prob - a.prob,
  );
}
