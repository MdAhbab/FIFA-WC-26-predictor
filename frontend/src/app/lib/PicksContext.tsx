import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import {
  GROUP_LETTERS,
  applyStrength as applyStrengthData,
  getAllGroupForecasts,
  getKnockoutTemplate,
  getOfficialResults,
  getScheduleDate,
  getTitleRace,
  predictMatch,
  teamByName,
} from "./data";
import { triggerKick } from "./KickFx";
import type {
  GroupForecast,
  GroupStanding,
  KnockoutSlotTemplate,
  OfficialResult,
  PoolPlayer,
  RawTeam,
  Stage,
} from "./types";

// Competition match id (1-104) from the bracket's internal knockout id "K{n}"
// (R32 73-88, R16 89-96, QF 97-100, SF 101-102, Final 104).
function koCompetitionId(idStr: string): number {
  const n = parseInt(idStr.replace("K", ""), 10);
  return n === 31 ? 104 : 72 + n;
}

// ---------- Live Elo (frontend-only gamification) ----------
// The server's base Elo is never mutated — these boosts are computed entirely in the browser so the
// admin can update scores without forcing a server recompute, and the model's initial ratings stay
// safe. They drive the Elo numbers shown on the knockout cards (which grow as a team advances).
const GROUP_WINNER_BONUS = 10; // group 1st place, applied entering the Round of 32
const GROUP_RUNNER_BONUS = 5; // group 2nd place, applied entering the Round of 32
const GOAL_ELO_BOOST = 3; // per goal scored by the winner of a knockout tie

// Each knockout round survived compounds an Elo boost that favours underdogs:
//   boost = (elo · (1000/elo)²)^(2/3) = (1_000_000 / elo)^(2/3)
// A lower-rated advancer gains MORE than a heavy favourite, so a giant-killer's run keeps it
// competitive deeper into the bracket.
function stageAdvanceBoost(elo: number): number {
  return Math.pow(1_000_000 / Math.max(elo, 1), 2 / 3);
}

// ---------- State ----------
export interface PicksState {
  groupOrder: Record<string, string[]>; // group letter -> 4 team names (pos1..pos4)
  knockoutPicks: Record<string, "home" | "away">; // matchId -> side
  knockoutGoals: Record<string, { home: number; away: number }>; // matchId -> goals
  bias: Record<string, number>; // team -> bias level 1..5
  squads: Record<string, PoolPlayer[]>; // team -> custom selected players
  nonce: number; // bumped after a strength recompute to force re-derive
  stage: Stage;
  completed: Record<Stage, boolean>;
}

type Action =
  | { type: "SET_GROUP_ORDER"; group: string; teams: string[] }
  | { type: "SWAP_GROUP"; group: string; from: number; to: number }
  | { type: "SET_KO_WINNER"; matchId: string; side: "home" | "away" }
  | { type: "SET_KO_GOALS"; matchId: string; home: number; away: number }
  | { type: "CLEAR_KO"; matchIds: string[] }
  | { type: "SET_BIAS"; team: string; level: number }
  | { type: "SET_SQUAD"; team: string; players: PoolPlayer[] }
  | { type: "BUMP" }
  | { type: "GOTO_STAGE"; stage: Stage }
  | { type: "MARK_COMPLETE"; stage: Stage }
  | { type: "RESET" }
  | { type: "HYDRATE"; state: PicksState };

// v2: knockout picks are keyed to the REAL bracket routing (K{n} = competition match 72+n per
// knockout_slots.csv), so v1 picks made against the old invented pairings must not be replayed.
const STORAGE_KEY = "wc26-picks-v2";

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
    knockoutGoals: {},
    bias: {},
    squads: {},
    nonce: 0,
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
    case "SET_KO_GOALS": {
      const knockoutGoals = { ...state.knockoutGoals };
      knockoutGoals[action.matchId] = { home: action.home, away: action.away };
      return { ...state, knockoutGoals };
    }
    case "CLEAR_KO": {
      const next = { ...state.knockoutPicks };
      action.matchIds.forEach((id) => delete next[id]);
      return { ...state, knockoutPicks: next };
    }
    case "SET_BIAS": {
      const bias = { ...state.bias };
      if (action.level <= 0) delete bias[action.team];
      else bias[action.team] = action.level;
      return { ...state, bias };
    }
    case "SET_SQUAD": {
      const squads = { ...state.squads };
      if (!action.players.length) delete squads[action.team];
      else squads[action.team] = action.players;
      return { ...state, squads };
    }
    case "BUMP":
      return { ...state, nonce: state.nonce + 1, knockoutPicks: {} };
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
  home: RawTeam;
  away: RawTeam;
  /** Live Elo of each side as they enter this match (base + group bonus + accumulated KO boosts). */
  homeElo: number;
  awayElo: number;
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
  /** True when this result is a finalised official (real-world) result, not a prediction. */
  official?: boolean;
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
  /** The champion's live Elo after lifting the cup (base + group + every knockout boost). */
  championElo: number | null;
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

// Rounds whose goals the user can nudge with the steppers (R32/R16/QF). Kept in sync with MatchPicker.
const GOAL_EDITABLE_ROUNDS = new Set<KnockoutResult["round"]>(["R32", "R16", "QF"]);

function makeKO(
  matchId: string,
  round: KnockoutResult["round"],
  home: RawTeam,
  away: RawTeam,
  picks: Record<string, "home" | "away">,
  goalsOverride: Record<string, { home: number; away: number }>,
  tpl: KnockoutSlotTemplate,
  autoPredicted: boolean,
  liveElo: Map<string, number>,
  official?: Map<number, OfficialResult>,
): KnockoutResult {
  // Live Elo each side carries into this match (already boosted by prior rounds / group finish).
  const homeElo = Math.round(liveElo.get(home.name) ?? home.elo);
  const awayElo = Math.round(liveElo.get(away.name) ?? away.elo);
  // Admin-edited date (per competition match id) wins over the fixture's scheduled date.
  const date = (getScheduleDate(koCompetitionId(matchId)) ?? tpl.date).slice(0, 10);

  const r = predictMatch(home, away, matchId, { allowDraw: false });
  const mlWinner = r.winner as "home" | "away";

  let homeGoals: number;
  let awayGoals: number;
  let winner: "home" | "away";
  let penalties: boolean;
  let userOverride = false;
  let isOfficial = false;

  // A recorded real-world result overrides the prediction (only if the teams that actually reached
  // this slot match the finalised fixture — otherwise the bracket has diverged and we predict).
  const off = official?.get(koCompetitionId(matchId));
  if (off && new Set([off.home, off.away]).size === 2 &&
      ((off.home === home.name && off.away === away.name) ||
       (off.home === away.name && off.away === home.name))) {
    homeGoals = off.home === home.name ? off.hg : off.ag;
    awayGoals = off.home === home.name ? off.ag : off.hg;
    winner = off.winner_team
      ? off.winner_team === home.name ? "home" : "away"
      : homeGoals > awayGoals ? "home" : awayGoals > homeGoals ? "away" : mlWinner;
    penalties = homeGoals === awayGoals;
    isOfficial = true;
  } else {
    const applied = applyUserPick(
      matchId, home, away, mlWinner, r.homeGoals, r.awayGoals,
      autoPredicted ? undefined : picks[matchId],
    );
    homeGoals = applied.homeGoals;
    awayGoals = applied.awayGoals;
    winner = applied.winner;
    penalties = r.penalties;
    userOverride = applied.userOverride;

    // User goal-stepper edits (live, goal-editable rounds) take over the scoreline and re-derive the
    // advancing side from it: a decisive edit crowns the higher-scoring team; a level edit goes to
    // penalties with the picked side advancing. This keeps the bracket coherent with what's shown.
    const ug = goalsOverride[matchId];
    if (ug && !autoPredicted && GOAL_EDITABLE_ROUNDS.has(round)) {
      homeGoals = ug.home;
      awayGoals = ug.away;
      if (homeGoals !== awayGoals) winner = homeGoals > awayGoals ? "home" : "away";
      penalties = homeGoals === awayGoals;
    }
  }

  const winnerTeam = winner === "home" ? home : away;

  // Advance: the winner compounds a goal boost + a stage-survival boost into the next round.
  const preElo = liveElo.get(winnerTeam.name) ?? winnerTeam.elo;
  const winnerGoals = winner === "home" ? homeGoals : awayGoals;
  const goalsForBoost = homeGoals === awayGoals ? 1 : winnerGoals; // shootout win counts as one goal
  liveElo.set(winnerTeam.name, preElo + goalsForBoost * GOAL_ELO_BOOST + stageAdvanceBoost(preElo));

  return {
    matchId, round, home, away, homeElo, awayElo,
    homeGoals, awayGoals, winner, winnerTeam, penalties,
    corners: r.corners, yellows: r.yellows, reds: r.reds,
    date, venue: tpl.venue,
    userOverride, autoPredicted,
    ...(isOfficial ? { official: true } : {}),
  };
}

export function deriveBracket(state: PicksState): DerivedBracket {
  const groups = getAllGroupForecasts();
  // Finalised official results (admin-entered) keyed by competition match id, so a recorded knockout
  // result overrides the model prediction and cascades the real winner through the bracket.
  const official = new Map<number, OfficialResult>(
    getOfficialResults().map((r) => [r.match_id, r] as const),
  );
  const effectiveStandings: Record<string, GroupStanding[]> = {};

  for (const g of GROUP_LETTERS) {
    const serverOrder = groups[g].standings.map((s) => s.team.name);
    // A decided group (all matches official, or an admin standings override) is LOCKED: its real
    // finishing order is forced, so a stale user reorder can no longer change who plays whom in the
    // Round of 32. Until then, the player's own ranking drives the bracket.
    const order = groups[g].locked ? serverOrder : (state.groupOrder[g] ?? serverOrder);
    const lookup = new Map(
      groups[g].standings.map((s) => [s.team.name, s] as const),
    );
    effectiveStandings[g] = order
      .map((name) => lookup.get(name))
      .filter((s): s is GroupStanding => !!s);
  }

  // The official bracket template (knockout_slots.csv, served by the backend): which group
  // position / prior match feeds each of the 32 knockout slots. This is the single source of truth
  // for who-plays-whom — the app no longer invents its own pairing scheme.
  const template = getKnockoutTemplate();

  // Best third-placed teams. The template pins each Best-3rd slot to its real group once the group
  // stage is decided ("Best 3rd (Group D)"); with all 8 pinned, the qualifying thirds are exactly
  // those groups' third-placed teams. Otherwise rank thirds by the real table metrics
  // (pts, then GD, then GF) — never by raw Elo, which is a model rating, not a result.
  const pinnedThirdGroups = template
    .flatMap((t) => [t.slotHome, t.slotAway])
    .map((s) => /^Best 3rd \(Group ([A-L])\)$/.exec(s)?.[1])
    .filter((g): g is string => !!g);
  const bestThirds =
    pinnedThirdGroups.length === 8
      ? new Set(pinnedThirdGroups.map((g) => effectiveStandings[g][2].team.name))
      : new Set(
          GROUP_LETTERS.map((g) => effectiveStandings[g][2])
            .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf)
            .slice(0, 8)
            .map((s) => s.team.name),
        );

  // The 32-team field in slot-tag form (1A/2B/3D...), listed R32-match order for display.
  const qualifiers: { team: RawTeam; tag: string }[] = [];

  // Live Elo: base ratings + group-finish bonus (1st +10, 2nd +5) entering the knockouts. makeKO
  // then compounds the per-goal and stage-survival boosts as each tie is resolved in bracket order,
  // so a team's shown Elo climbs the further it goes.
  const liveElo = new Map<string, number>();
  for (const g of GROUP_LETTERS) {
    const w = effectiveStandings[g][0].team;
    const ru = effectiveStandings[g][1].team;
    liveElo.set(w.name, w.elo + GROUP_WINNER_BONUS);
    liveElo.set(ru.name, ru.elo + GROUP_RUNNER_BONUS);
  }

  // ---- Slot resolution against the template ----
  const winnerOfMatch = new Map<number, RawTeam>();
  const loserOfMatch = new Map<number, RawTeam>();
  const usedThirds = new Set<string>();

  const slotTag = (slot: string): string => {
    let m = /^Winner Group ([A-L])$/.exec(slot);
    if (m) return `1${m[1]}`;
    m = /^Runner-up Group ([A-L])$/.exec(slot);
    if (m) return `2${m[1]}`;
    m = /^Best 3rd \(Group ([A-L])\)$/.exec(slot);
    if (m) return `3${m[1]}`;
    return slot;
  };

  const resolveSlot = (slot: string): RawTeam | undefined => {
    let m = /^Winner Group ([A-L])$/.exec(slot);
    if (m) return effectiveStandings[m[1]][0].team;
    m = /^Runner-up Group ([A-L])$/.exec(slot);
    if (m) return effectiveStandings[m[1]][1].team;
    m = /^Best 3rd \(Group ([A-L])\)$/.exec(slot);
    if (m) {
      const t = effectiveStandings[m[1]][2].team;
      usedThirds.add(t.name);
      return t;
    }
    if (slot.includes("Best 3rd")) {
      // Legacy multi-group slot ("Best 3rd (Groups A/B/C/D/F)"): take the first still-unassigned
      // qualifying third from an allowed group. Approximate, but only ever hit pre-pinning.
      const g = /Groups?\s+([A-L/]+)/.exec(slot);
      const allowed = new Set(g ? g[1].split("/") : []);
      for (const letter of GROUP_LETTERS) {
        const t = effectiveStandings[letter][2].team;
        if (allowed.has(letter) && bestThirds.has(t.name) && !usedThirds.has(t.name)) {
          usedThirds.add(t.name);
          return t;
        }
      }
      return undefined;
    }
    m = /^Winner Match (\d+)$/.exec(slot);
    if (m) return winnerOfMatch.get(parseInt(m[1], 10));
    m = /^Loser Match (\d+)$/.exec(slot);
    if (m) return loserOfMatch.get(parseInt(m[1], 10));
    return undefined;
  };

  // Internal id kept as "K{n}" so koCompetitionId round-trips (K1..K16 = 73..88, ..., K31 = 104).
  const internalId = (mid: number) => `K${mid === 104 ? 31 : mid - 72}`;
  const BRACKET_ORDER = [
    // R32 (adjacent pairs feed the same R16 tie: 73/76→89, 75/78→90, 83/84→93, 82/81→94, ...)
    73, 76, 75, 78, 83, 84, 82, 81, 74, 77, 79, 80, 87, 86, 85, 88,
    // R16
    89, 90, 93, 94, 91, 92, 95, 96,
    // QF
    97, 98, 99, 100,
    // SF
    101, 102,
    // 3rd / Final
    103, 104
  ];

  const templateRound = (name: string) =>
    template.filter((t) => t.round === name).sort((a, b) => BRACKET_ORDER.indexOf(a.matchId) - BRACKET_ORDER.indexOf(b.matchId));

  const buildRound = (
    roundName: string,
    round: KnockoutResult["round"],
    autoPredicted: boolean,
    collectQualifiers = false,
  ): KnockoutResult[] => {
    const out: KnockoutResult[] = [];
    for (const tpl of templateRound(roundName)) {
      const home = resolveSlot(tpl.slotHome);
      const away = resolveSlot(tpl.slotAway);
      if (!home || !away) continue;
      if (collectQualifiers) {
        qualifiers.push({ team: home, tag: slotTag(tpl.slotHome) });
        qualifiers.push({ team: away, tag: slotTag(tpl.slotAway) });
      }
      const ko = makeKO(
        internalId(tpl.matchId), round, home, away,
        state.knockoutPicks, state.knockoutGoals,
        tpl, autoPredicted, liveElo, official,
      );
      winnerOfMatch.set(tpl.matchId, ko.winnerTeam);
      loserOfMatch.set(tpl.matchId, ko.winner === "home" ? ko.away : ko.home);
      out.push(ko);
    }
    return out;
  };

  // R32 — auto until user reaches r32 stage. ML defaults always computed; user picks only honored
  // once the stage is unlocked; official results override everything inside makeKO.
  const r32Unlocked = state.stage !== "intro" && state.stage !== "groups";
  const r32 = buildRound("Round of 32", "R32", !r32Unlocked, true);

  const r16Unlocked = ["r16", "qf", "results"].includes(state.stage);
  const r16 = buildRound("Round of 16", "R16", !r16Unlocked);

  const qfUnlocked = ["qf", "results"].includes(state.stage);
  const qf = buildRound("Quarter-final", "QF", !qfUnlocked);

  // SF + Final always ML-only (the third-place playoff isn't shown in the app).
  const sf = buildRound("Semi-final", "SF", true);
  const final = buildRound("Final", "Final", true)[0] ?? null;

  const champion = final ? final.winnerTeam : null;
  return {
    groups,
    effectiveStandings,
    bestThirds,
    qualifiers,
    r32, r16, qf, sf, final,
    champion,
    championElo: champion ? Math.round(liveElo.get(champion.name) ?? champion.elo) : null,
  };
}

// ---------- Context ----------
interface Ctx {
  state: PicksState;
  bracket: DerivedBracket;
  applying: boolean;
  setGroupOrder: (group: string, teams: string[]) => void;
  swapGroup: (group: string, from: number, to: number) => void;
  setKoWinner: (matchId: string, side: "home" | "away") => void;
  setKoGoals: (matchId: string, goals: { home: number; away: number }) => void;
  setBias: (team: string, level: number) => void;
  setSquad: (team: string, players: PoolPlayer[]) => void;
  applyStrength: () => Promise<void>;
  gotoStage: (s: Stage) => void;
  markComplete: (s: Stage) => void;
  resetPicks: () => void;
  autoFillAll: () => void;
}

const PicksCtx = createContext<Ctx | null>(null);

export function PicksProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, defaultState);
  const [applying, setApplying] = useState(false);

  // Hydrate once
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PicksState>;
        if (parsed) {
          const base = defaultState();
          const groupOrder = { ...base.groupOrder };
          if (parsed.groupOrder) {
            for (const [g, names] of Object.entries(parsed.groupOrder)) {
              if (
                Array.isArray(names) &&
                names.length === 4 &&
                names.every((n) => !!teamByName(n))
              ) {
                groupOrder[g] = names;
              }
            }
          }
          dispatch({
            type: "HYDRATE",
            state: {
              ...base,
              ...parsed,
              groupOrder,
              bias: parsed.bias ?? {},
              squads: parsed.squads ?? {},
              knockoutGoals: parsed.knockoutGoals ?? {},
              nonce: parsed.nonce ?? 0,
            } as PicksState,
          });
        }
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
  const setKoGoals = useCallback(
    (matchId: string, goals: { home: number; away: number }) => {
      dispatch({ type: "SET_KO_GOALS", matchId, home: goals.home, away: goals.away });
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

  const setBias = useCallback(
    (team: string, level: number) => dispatch({ type: "SET_BIAS", team, level }),
    [],
  );
  const setSquad = useCallback(
    (team: string, players: PoolPlayer[]) =>
      dispatch({ type: "SET_SQUAD", team, players }),
    [],
  );
  const applyStrength = useCallback(async () => {
    setApplying(true);
    try {
      const squadsPayload: Record<string, unknown> = {};
      for (const [team, players] of Object.entries(state.squads)) {
        squadsPayload[team] = {
          mode: "custom",
          selected_players: players,
          autofill_rest: true,
        };
      }
      // Build knockout goal overrides for the strength payload
      const knockoutGoalsPayload: Record<string, { home: number; away: number }> = {};
      for (const [matchId, goals] of Object.entries(state.knockoutGoals)) {
        const num = parseInt(matchId.replace("K", ""), 10);
        const realId = num === 31 ? 104 : 72 + num;
        knockoutGoalsPayload[String(realId)] = goals;
      }
      await applyStrengthData({
        team_bias: state.bias,
        squads: squadsPayload,
        knockout_goals: knockoutGoalsPayload,
      });
      dispatch({ type: "BUMP" });
      triggerKick();
    } finally {
      setApplying(false);
    }
  }, [state.bias, state.squads, state.knockoutGoals]);

  const value: Ctx = {
    state,
    bracket,
    applying,
    setGroupOrder,
    swapGroup,
    setKoWinner,
    setKoGoals,
    setBias,
    setSquad,
    applyStrength,
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

// Champion probabilities from the real model's title race (favourites board).
export function teamChampionProbabilities(): {
  team: RawTeam;
  prob: number;
}[] {
  return getTitleRace()
    .map((r) => {
      const team =
        teamByName(r.team) ??
        ({ name: r.team, iso: r.iso, elo: 0, group: "" } as RawTeam);
      return { team, prob: r.prob };
    })
    .sort((a, b) => b.prob - a.prob);
}
