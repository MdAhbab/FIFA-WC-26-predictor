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
  /** True once the official FIFA result has been recorded for this fixture. */
  official?: boolean;
  /** True when the result is final and may no longer be edited. */
  locked?: boolean;
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
  prob: number; // champion probability (Monte-Carlo)
  final?: number; // reach-the-final probability
  semi?: number; // reach-the-semis probability
  quarter?: number; // reach-the-quarters probability
  r16?: number; // reach-the-round-of-16 probability
}

export interface Meta {
  champion: string;
  champion_iso: string;
  champion_prob?: number;
  finalists: [string, string] | string[];
  semis: string[];
  sims?: number;
  results_applied?: number;
}

export interface OfficialResult {
  match_id: number;
  stage: string;
  home: string;
  away: string;
  hg: number;
  ag: number;
  locked: boolean;
  /** Shootout winner for a level knockout result (null for decisive / group matches). */
  winner_team?: string | null;
}

export interface SessionInfo {
  active: boolean;
  ttl_seconds: number;
  expires_in?: number;
  hits?: number;
  active_sessions?: number;
}

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  date: string;
  teams: string[];
  tag?: string;
  live?: boolean;
}

export interface H2H {
  played: number;
  home_wins: number;
  away_wins: number;
  draws: number;
  home_goals: number;
  away_goals: number;
  recent: {
    date: string;
    home: string;
    away: string;
    home_goals: number;
    away_goals: number;
  }[];
}

export interface Lineup {
  formation: string;
  players: { name: string; position: "GK" | "DEF" | "MID" | "FWD"; rating: number }[];
  /** True when squad data was too thin to name a full XI (placeholders used). */
  partial?: boolean;
}

export interface MatchDetail {
  home: RawTeam;
  away: RawTeam;
  matchId?: number | null;
  finalized?: boolean;
  probabilities: { home: number; draw: number; away: number };
  predicted: { homeGoals: number; awayGoals: number; lambdaHome: number; lambdaAway: number };
  h2h: H2H;
  lineups: { home: Lineup; away: Lineup };
  news: NewsItem[];
  hasNews: boolean;
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
  results: OfficialResult[];
  session: SessionInfo;
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
