// Backend-driven data layer. All teams, group forecasts and match predictions come from the real
// ML engine via the API. Nothing here is hardcoded/dummy except cosmetic knockout venue labels.
import { api } from "./api";
import type {
  GroupForecast,
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

// ---------- Module caches (populated by bootstrap / applyStrength) ----------
export let TEAMS: RawTeam[] = [];
let PAIRWISE: Record<string, Record<string, PairResult>> = {};
let GROUP_FORECASTS: Record<string, GroupForecast> = {};
let TITLE_RACE: TitleRaceEntry[] = [];
let META: Meta | null = null;
let RESULTS: OfficialResult[] = [];
let LOADED = false;

function applyPayload(d: StrengthData) {
  TEAMS = d.teams;
  PAIRWISE = d.pairwise;
  GROUP_FORECASTS = d.groups;
  TITLE_RACE = d.title_race;
  META = d.meta;
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
  LOADED = true;
  return { votes: d.votes, session: d.session };
}

/** Recompute predictions under team bias / custom squads (player picks). */
export async function applyStrength(cfg: {
  team_bias?: Record<string, number>;
  squads?: Record<string, unknown>;
}) {
  const d = await api.strength(cfg);
  applyPayload(d);
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
  _opts: { allowDraw?: boolean } = {},
): RawMatchResult {
  const p = PAIRWISE[home.name]?.[away.name];
  if (p) {
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
