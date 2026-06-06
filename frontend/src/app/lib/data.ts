import type {
  GroupForecast,
  GroupStanding,
  MatchPrediction,
  RawTeam,
} from "./types";

// ---------- Static team list (48 teams across 12 groups) ----------
export const TEAMS: RawTeam[] = [
  { name: "USA", iso: "us", elo: 1830, group: "A" },
  { name: "Wales", iso: "gb-wls", elo: 1790, group: "A" },
  { name: "Egypt", iso: "eg", elo: 1740, group: "A" },
  { name: "Iran", iso: "ir", elo: 1760, group: "A" },

  { name: "Mexico", iso: "mx", elo: 1820, group: "B" },
  { name: "Croatia", iso: "hr", elo: 1930, group: "B" },
  { name: "Saudi Arabia", iso: "sa", elo: 1700, group: "B" },
  { name: "Australia", iso: "au", elo: 1780, group: "B" },

  { name: "Canada", iso: "ca", elo: 1810, group: "C" },
  { name: "Belgium", iso: "be", elo: 1950, group: "C" },
  { name: "Korea Republic", iso: "kr", elo: 1820, group: "C" },
  { name: "Senegal", iso: "sn", elo: 1830, group: "C" },

  { name: "France", iso: "fr", elo: 2050, group: "D" },
  { name: "Denmark", iso: "dk", elo: 1900, group: "D" },
  { name: "Ecuador", iso: "ec", elo: 1790, group: "D" },
  { name: "Tunisia", iso: "tn", elo: 1730, group: "D" },

  { name: "Spain", iso: "es", elo: 2020, group: "E" },
  { name: "Germany", iso: "de", elo: 1980, group: "E" },
  { name: "Japan", iso: "jp", elo: 1850, group: "E" },
  { name: "Costa Rica", iso: "cr", elo: 1720, group: "E" },

  { name: "Brazil", iso: "br", elo: 2080, group: "F" },
  { name: "Serbia", iso: "rs", elo: 1850, group: "F" },
  { name: "Cameroon", iso: "cm", elo: 1740, group: "F" },
  { name: "Uzbekistan", iso: "uz", elo: 1710, group: "F" },

  { name: "Argentina", iso: "ar", elo: 2110, group: "G" },
  { name: "Poland", iso: "pl", elo: 1820, group: "G" },
  { name: "Morocco", iso: "ma", elo: 1910, group: "G" },
  { name: "New Zealand", iso: "nz", elo: 1640, group: "G" },

  { name: "Portugal", iso: "pt", elo: 2030, group: "H" },
  { name: "Uruguay", iso: "uy", elo: 1930, group: "H" },
  { name: "Ghana", iso: "gh", elo: 1730, group: "H" },
  { name: "Iraq", iso: "iq", elo: 1680, group: "H" },

  { name: "England", iso: "gb-eng", elo: 2040, group: "I" },
  { name: "Switzerland", iso: "ch", elo: 1880, group: "I" },
  { name: "Ivory Coast", iso: "ci", elo: 1770, group: "I" },
  { name: "Panama", iso: "pa", elo: 1660, group: "I" },

  { name: "Netherlands", iso: "nl", elo: 2000, group: "J" },
  { name: "Sweden", iso: "se", elo: 1810, group: "J" },
  { name: "Algeria", iso: "dz", elo: 1790, group: "J" },
  { name: "Qatar", iso: "qa", elo: 1670, group: "J" },

  { name: "Italy", iso: "it", elo: 1960, group: "K" },
  { name: "Colombia", iso: "co", elo: 1910, group: "K" },
  { name: "Nigeria", iso: "ng", elo: 1800, group: "K" },
  { name: "Honduras", iso: "hn", elo: 1640, group: "K" },

  { name: "Scotland", iso: "gb-sct", elo: 1780, group: "L" },
  { name: "Austria", iso: "at", elo: 1890, group: "L" },
  { name: "Paraguay", iso: "py", elo: 1770, group: "L" },
  { name: "Jordan", iso: "jo", elo: 1660, group: "L" },
];

export const GROUP_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
] as const;

export const VENUES = [
  "MetLife Stadium, NJ",
  "SoFi Stadium, LA",
  "AT&T Stadium, Dallas",
  "Estadio Azteca, Mexico City",
  "BMO Field, Toronto",
  "Mercedes-Benz Stadium, Atlanta",
  "Arrowhead Stadium, Kansas City",
  "BC Place, Vancouver",
  "Estadio Akron, Guadalajara",
  "Lincoln Financial Field, Philadelphia",
  "Levi's Stadium, Santa Clara",
  "Lumen Field, Seattle",
  "NRG Stadium, Houston",
  "Hard Rock Stadium, Miami",
  "Gillette Stadium, Foxborough",
  "Estadio BBVA, Monterrey",
];

export function teamByName(name: string): RawTeam | undefined {
  return TEAMS.find((t) => t.name === name);
}

export function teamsOfGroup(g: string): RawTeam[] {
  return TEAMS.filter((t) => t.group === g);
}

// ---------- Deterministic PRNG from string seed ----------
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed: string) {
  let a = hashString(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rand: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > L && k < 9);
  return k - 1;
}

function expectedGoals(eloFor: number, eloAgainst: number): number {
  const diff = (eloFor - eloAgainst) / 400;
  return Math.max(0.15, 1.32 + diff * 0.62);
}

// ---------- Public ML predict ----------
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
  matchId: string,
  opts: { allowDraw?: boolean } = {},
): RawMatchResult {
  const rand = makeRng(`${matchId}|${home.name}|${away.name}`);
  const lh = expectedGoals(home.elo, away.elo);
  const la = expectedGoals(away.elo, home.elo);
  let hg = poisson(lh, rand);
  let ag = poisson(la, rand);
  let penalties = false;
  let winner: "home" | "away" | "draw" = "draw";
  if (hg > ag) winner = "home";
  else if (ag > hg) winner = "away";
  else winner = "draw";

  if (!opts.allowDraw && winner === "draw") {
    penalties = true;
    // tie-break: edge to higher elo + noise
    const edge = (home.elo - away.elo) / 600 + (rand() - 0.5) * 0.6;
    winner = edge >= 0 ? "home" : "away";
  }

  return {
    homeGoals: hg,
    awayGoals: ag,
    winner,
    penalties,
    corners: 4 + Math.floor(rand() * 9),
    yellows: 1 + Math.floor(rand() * 6),
    reds: rand() < 0.08 ? 1 : 0,
  };
}

// ---------- Group forecast (ML default) ----------
const DATE_BASE = new Date(2026, 5, 11); // Jun 11 2026
function dateStr(offset: number) {
  const d = new Date(DATE_BASE);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const groupForecastCache: Record<string, GroupForecast> = {};

export function getGroupForecast(g: string): GroupForecast {
  if (groupForecastCache[g]) return groupForecastCache[g];
  const teams = teamsOfGroup(g);
  const pairs: [number, number][] = [
    [0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2],
  ];
  const rowOf = (t: RawTeam): GroupStanding => ({
    team: t, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0, pts: 0,
  });
  const rows = teams.map(rowOf);
  const matches: MatchPrediction[] = [];
  const seed = makeRng(`group-venue-${g}`);
  pairs.forEach(([i, j], idx) => {
    const home = teams[i];
    const away = teams[j];
    const matchId = `G${g}-${idx + 1}`;
    const r = predictMatch(home, away, matchId, { allowDraw: true });
    matches.push({
      matchId,
      home, away,
      homeGoals: r.homeGoals,
      awayGoals: r.awayGoals,
      winner: r.winner,
      penalties: false,
      corners: r.corners,
      yellows: r.yellows,
      reds: r.reds,
      date: dateStr(idx + GROUP_LETTERS.indexOf(g as typeof GROUP_LETTERS[number]) * 1),
      venue: VENUES[Math.floor(seed() * VENUES.length)],
    });
    const A = rows[i];
    const B = rows[j];
    A.played++; B.played++;
    A.gf += r.homeGoals; A.ga += r.awayGoals;
    B.gf += r.awayGoals; B.ga += r.homeGoals;
    if (r.winner === "home") { A.wins++; B.losses++; A.pts += 3; }
    else if (r.winner === "away") { B.wins++; A.losses++; B.pts += 3; }
    else { A.draws++; B.draws++; A.pts++; B.pts++; }
  });
  rows.forEach((r) => (r.gd = r.gf - r.ga));
  rows.sort(
    (a, b) =>
      b.pts - a.pts ||
      b.gd - a.gd ||
      b.gf - a.gf ||
      b.team.elo - a.team.elo,
  );
  const forecast: GroupForecast = { group: g, standings: rows, matches };
  groupForecastCache[g] = forecast;
  return forecast;
}

export function getAllGroupForecasts(): Record<string, GroupForecast> {
  return Object.fromEntries(GROUP_LETTERS.map((g) => [g, getGroupForecast(g)]));
}
