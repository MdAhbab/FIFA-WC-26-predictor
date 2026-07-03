// Backend-driven data layer. All teams, group forecasts and match predictions come from the real
// ML engine via the API. Nothing here is hardcoded/dummy except cosmetic knockout venue labels.
import { api } from "./api";
import type {
  GroupForecast,
  KnockoutSlotTemplate,
  Meta,
  OfficialResult,
  PairResult,
  RawTeam,
  SessionInfo,
  StrengthData,
  TitleRaceEntry,
  VoteSummary,
} from "./types";

export const GROUP_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
] as const;

// Cosmetic stadium labels for knockout cards (group matches carry their real venue from the API).
export const VENUES = [
  "MetLife Stadium, NJ", "SoFi Stadium, LA", "AT&T Stadium, Dallas",
  "Estadio Azteca, Mexico City", "BMO Field, Toronto", "Mercedes-Benz Stadium, Atlanta",
  "Arrowhead Stadium, Kansas City", "BC Place, Vancouver", "Estadio Akron, Guadalajara",
  "Lincoln Financial Field, Philadelphia", "Levi's Stadium, Santa Clara", "Lumen Field, Seattle",
  "NRG Stadium, Houston", "Hard Rock Stadium, Miami", "Gillette Stadium, Foxborough",
  "Estadio BBVA, Monterrey",
];

// The official FIFA bracket template (mirror of backend/datasets/knockout_slots.csv). The backend
// sends the authoritative copy in every payload; this constant is only the safety fallback so the
// bracket never renders empty if a payload ever lacks it.
const T = (
  matchId: number, round: string, date: string, venue: string,
  slotHome: string, slotAway: string,
): KnockoutSlotTemplate => ({ matchId, round, date, venue, slotHome, slotAway });
const FALLBACK_KNOCKOUT_TEMPLATE: KnockoutSlotTemplate[] = [
  T(73, "Round of 32", "2026-06-28", "SoFi Stadium, Los Angeles", "Runner-up Group A", "Runner-up Group B"),
  T(74, "Round of 32", "2026-06-29", "NRG Stadium, Houston", "Winner Group C", "Runner-up Group F"),
  T(75, "Round of 32", "2026-06-29", "Gillette Stadium, Boston", "Winner Group E", "Best 3rd (Group D)"),
  T(76, "Round of 32", "2026-06-30", "Estadio BBVA, Monterrey", "Winner Group F", "Runner-up Group C"),
  T(77, "Round of 32", "2026-06-30", "AT&T Stadium, Dallas", "Runner-up Group E", "Runner-up Group I"),
  T(78, "Round of 32", "2026-06-30", "MetLife Stadium, East Rutherford", "Winner Group I", "Best 3rd (Group F)"),
  T(79, "Round of 32", "2026-07-01", "Estadio Azteca, Mexico City", "Winner Group A", "Best 3rd (Group E)"),
  T(80, "Round of 32", "2026-07-01", "Mercedes-Benz Stadium, Atlanta", "Winner Group L", "Best 3rd (Group K)"),
  T(81, "Round of 32", "2026-07-01", "Lumen Field, Seattle", "Winner Group G", "Best 3rd (Group I)"),
  T(82, "Round of 32", "2026-07-02", "Levi's Stadium, Santa Clara", "Winner Group D", "Best 3rd (Group B)"),
  T(83, "Round of 32", "2026-07-02", "BMO Field, Toronto", "Runner-up Group K", "Runner-up Group L"),
  T(84, "Round of 32", "2026-07-02", "SoFi Stadium, Los Angeles", "Winner Group H", "Runner-up Group J"),
  T(85, "Round of 32", "2026-07-03", "BC Place, Vancouver", "Winner Group B", "Best 3rd (Group J)"),
  T(86, "Round of 32", "2026-07-03", "AT&T Stadium, Dallas", "Runner-up Group D", "Runner-up Group G"),
  T(87, "Round of 32", "2026-07-03", "Hard Rock Stadium, Miami", "Winner Group J", "Runner-up Group H"),
  T(88, "Round of 32", "2026-07-04", "GEHA Field at Arrowhead Stadium, Kansas City", "Winner Group K", "Best 3rd (Group L)"),
  T(89, "Round of 16", "2026-07-04", "NRG Stadium, Houston", "Winner Match 73", "Winner Match 75"),
  T(90, "Round of 16", "2026-07-04", "Lincoln Financial Field, Philadelphia", "Winner Match 74", "Winner Match 77"),
  T(91, "Round of 16", "2026-07-05", "MetLife Stadium, East Rutherford", "Winner Match 76", "Winner Match 78"),
  T(92, "Round of 16", "2026-07-06", "Estadio Azteca, Mexico City", "Winner Match 79", "Winner Match 80"),
  T(93, "Round of 16", "2026-07-06", "AT&T Stadium, Dallas", "Winner Match 83", "Winner Match 84"),
  T(94, "Round of 16", "2026-07-07", "Lumen Field, Seattle", "Winner Match 81", "Winner Match 82"),
  T(95, "Round of 16", "2026-07-07", "Mercedes-Benz Stadium, Atlanta", "Winner Match 86", "Winner Match 88"),
  T(96, "Round of 16", "2026-07-07", "BC Place, Vancouver", "Winner Match 85", "Winner Match 87"),
  T(97, "Quarter-final", "2026-07-09", "Gillette Stadium, Boston", "Winner Match 89", "Winner Match 90"),
  T(98, "Quarter-final", "2026-07-10", "SoFi Stadium, Los Angeles", "Winner Match 93", "Winner Match 94"),
  T(99, "Quarter-final", "2026-07-11", "Hard Rock Stadium, Miami", "Winner Match 91", "Winner Match 92"),
  T(100, "Quarter-final", "2026-07-12", "GEHA Field at Arrowhead Stadium, Kansas City", "Winner Match 95", "Winner Match 96"),
  T(101, "Semi-final", "2026-07-14", "AT&T Stadium, Dallas", "Winner Match 97", "Winner Match 98"),
  T(102, "Semi-final", "2026-07-15", "Mercedes-Benz Stadium, Atlanta", "Winner Match 99", "Winner Match 100"),
  T(103, "Third-place playoff", "2026-07-18", "Hard Rock Stadium, Miami", "Loser Match 101", "Loser Match 102"),
  T(104, "Final", "2026-07-19", "MetLife Stadium, East Rutherford", "Winner Match 101", "Winner Match 102"),
];

// ---------- Module caches (populated by bootstrap / applyStrength) ----------
export let TEAMS: RawTeam[] = [];
let PAIRWISE: Record<string, Record<string, PairResult>> = {};
let GROUP_FORECASTS: Record<string, GroupForecast> = {};
let KNOCKOUT_TEMPLATE: KnockoutSlotTemplate[] = [];
let TITLE_RACE: TitleRaceEntry[] = [];
let META: Meta | null = null;
let RESULTS: OfficialResult[] = [];
// Admin-edited match dates (competition match_id -> YYYY-MM-DD). Applied over the group fixture dates
// and the cosmetic knockout dates so the app schedule can be corrected without a server recompute.
let SCHEDULE: Record<number, string> = {};
let LOADED = false;

function applyPayload(d: StrengthData) {
  TEAMS = d.teams;
  PAIRWISE = d.pairwise;
  GROUP_FORECASTS = d.groups;
  if (d.knockout?.length) KNOCKOUT_TEMPLATE = d.knockout;
  TITLE_RACE = d.title_race;
  META = d.meta;
}

/** The official knockout bracket template (backend copy when available, static mirror otherwise). */
export function getKnockoutTemplate(): KnockoutSlotTemplate[] {
  return KNOCKOUT_TEMPLATE.length ? KNOCKOUT_TEMPLATE : FALLBACK_KNOCKOUT_TEMPLATE;
}

/** Overlay admin-edited dates onto the (freshly applied) group fixtures. Idempotent. */
function applyScheduleToGroups() {
  for (const g of Object.values(GROUP_FORECASTS)) {
    for (const m of g.matches) {
      const id = parseInt(String(m.matchId).replace("G", ""), 10);
      const d = SCHEDULE[id];
      if (d) m.date = d;
    }
  }
}

/** Admin-edited date for a competition match id (group 1-72, knockout 73-104), if any. */
export function getScheduleDate(matchId: number): string | undefined {
  return SCHEDULE[matchId];
}

export function isLoaded() {
  return LOADED;
}
export function getMeta() {
  return META;
}
export function getTitleRace() {
  return TITLE_RACE;
}
export function getOfficialResults(): OfficialResult[] {
  return RESULTS;
}

/** Load all base data once before the app renders. Returns the initial vote summary + session. */
export async function bootstrap(): Promise<{
  votes: VoteSummary;
  session: SessionInfo;
}> {
  const d = await api.bootstrap();
  applyPayload(d);
  RESULTS = d.results ?? [];
  SCHEDULE = {};
  for (const s of d.schedule ?? []) SCHEDULE[s.match_id] = s.date_utc;
  applyScheduleToGroups();
  LOADED = true;
  return { votes: d.votes, session: d.session };
}

/** Recompute predictions under team bias / custom squads / knockout goal overrides. */
export async function applyStrength(cfg: {
  team_bias?: Record<string, number>;
  squads?: Record<string, unknown>;
  knockout_goals?: Record<string, { home: number; away: number }>;
}) {
  const d = await api.strength(cfg);
  applyPayload(d);
  applyScheduleToGroups();
}

// ---------- Lookups ----------
export function teamByName(name: string): RawTeam | undefined {
  return TEAMS.find((t) => t.name === name);
}
export function teamsOfGroup(g: string): RawTeam[] {
  return TEAMS.filter((t) => t.group === g);
}
export function getGroupForecast(g: string): GroupForecast {
  return GROUP_FORECASTS[g];
}
export function getAllGroupForecasts(): Record<string, GroupForecast> {
  return GROUP_FORECASTS;
}

/** A group is locked once it's decided (all matches official, or an admin set its standings). Players
 *  can no longer reorder it and the bracket uses the real finishing order. */
export function isGroupLocked(g: string): boolean {
  return !!GROUP_FORECASTS[g]?.locked;
}

// ---------- Real ML match prediction (pairwise lookup) ----------
export interface RawMatchResult {
  homeGoals: number;
  awayGoals: number;
  winner: "home" | "away" | "draw";
  penalties: boolean;
  corners: number;
  yellows: number;
  reds: number;
}

export function predictMatch(
  home: RawTeam,
  away: RawTeam,
  _matchId: string,
  opts: { allowDraw?: boolean } = {},
): RawMatchResult {
  const allowDraw = opts.allowDraw ?? true;
  const p = PAIRWISE[home.name]?.[away.name];
  if (p) {
    // Knockouts can't end level: if the data ever returns a draw winner, resolve it to a shootout
    // advantage for the higher-rated side and flag penalties, so the bracket always has an advancer.
    if (!allowDraw && (p.winner as string) === "draw") {
      const homeAdvances = home.elo >= away.elo;
      return {
        homeGoals: p.homeGoals,
        awayGoals: p.awayGoals,
        winner: homeAdvances ? "home" : "away",
        penalties: true,
        corners: p.corners,
        yellows: p.yellows,
        reds: p.reds,
      };
    }
    return {
      homeGoals: p.homeGoals,
      awayGoals: p.awayGoals,
      winner: p.winner,
      penalties: p.penalties,
      corners: p.corners,
      yellows: p.yellows,
      reds: p.reds,
    };
  }
  // Defensive fallback (should not happen once data is loaded).
  const edge = home.elo >= away.elo;
  return {
    homeGoals: edge ? 1 : 0,
    awayGoals: edge ? 0 : 1,
    winner: edge ? "home" : "away",
    penalties: false,
    corners: 9,
    yellows: 4,
    reds: 0,
  };
}
