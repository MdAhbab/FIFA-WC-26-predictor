export interface RawTeam {
  name: string;
  iso: string;
  elo: number;
  group: string;
}

export interface MatchPrediction {
  matchId: string;
  home: RawTeam;
  away: RawTeam;
  homeGoals: number;
  awayGoals: number;
  winner: "home" | "away" | "draw";
  penalties: boolean;
  corners: number;
  yellows: number;
  reds: number;
  date: string;
  venue: string;
}

export interface GroupStanding {
  team: RawTeam;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface GroupForecast {
  group: string;
  standings: GroupStanding[];
  matches: MatchPrediction[];
}

// ---------- Backend payload shapes ----------
export interface PairResult {
  homeGoals: number;
  awayGoals: number;
  winner: "home" | "away";
  penalties: boolean;
  corners: number;
  yellows: number;
  reds: number;
}

export interface TitleRaceEntry {
  team: string;
  iso: string;
  prob: number;
}

export interface Meta {
  champion: string;
  champion_iso: string;
  finalists: [string, string] | string[];
  semis: string[];
}

export interface VoteEntry {
  team: string;
  count: number;
  pct?: number;
}

export interface VoteSummary {
  total: number;
  top: VoteEntry[];
  champion_top: VoteEntry[];
}

export interface StrengthData {
  teams: RawTeam[];
  group_letters: string[];
  groups: Record<string, GroupForecast>;
  pairwise: Record<string, Record<string, PairResult>>;
  title_race: TitleRaceEntry[];
  meta: Meta;
}

export interface BootstrapData extends StrengthData {
  votes: VoteSummary;
}

export interface PoolPlayer {
  player_id: number;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  rating: number;
}

export type Stage = "intro" | "groups" | "r32" | "r16" | "qf" | "results";

export interface KnockoutSlot {
  matchId: string;
  round: "R32" | "R16" | "QF" | "SF" | "Final";
  home: RawTeam;
  away: RawTeam;
  homeTag: string;
  awayTag: string;
}
