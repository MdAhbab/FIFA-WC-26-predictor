// Thin API client. Uses relative /api (Vite proxy in dev, same-origin in prod).
import type {
  BootstrapData,
  PoolPlayer,
  StrengthData,
  VoteSummary,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE || "/api";

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status}`);
  return r.json() as Promise<T>;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    let msg = `POST ${path} failed: ${r.status}`;
    try {
      const j = await r.json();
      if (j.detail) msg = j.detail;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

export const api = {
  bootstrap: () => getJSON<BootstrapData>("/bootstrap"),
  strength: (body: { team_bias?: Record<string, number>; squads?: Record<string, unknown> }) =>
    postJSON<StrengthData>("/strength", body),
  players: (team: string) =>
    getJSON<{ team: string; players: PoolPlayer[] }>(`/players/${encodeURIComponent(team)}`),
  vote: (body: { team1: string; team2: string; champion?: string; payload?: unknown }) =>
    postJSON<VoteSummary>("/vote", body),
  votes: () => getJSON<VoteSummary>("/votes"),
};
