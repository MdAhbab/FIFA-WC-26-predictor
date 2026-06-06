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

export type Stage = "intro" | "groups" | "r32" | "r16" | "qf" | "results";

export interface KnockoutSlot {
  matchId: string;
  round: "R32" | "R16" | "QF" | "SF" | "Final";
  home: RawTeam;
  away: RawTeam;
  homeTag: string;
  awayTag: string;
}
