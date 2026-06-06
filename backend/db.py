"""Tiny SQLite layer for fan votes + official results (stdlib only, no ORM).

The DB path can be overridden with the ``WC_DB_PATH`` env var (used in Docker so the file lives on
a persistent volume and survives redeploys)."""
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

DB_PATH = Path(os.environ.get("WC_DB_PATH", Path(__file__).resolve().parent / "wc26.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
_LOCK = Lock()


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with _LOCK, _conn() as c:
        c.execute(
            """CREATE TABLE IF NOT EXISTS votes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts TEXT NOT NULL,
                team1 TEXT NOT NULL,
                team2 TEXT NOT NULL,
                champion TEXT,
                payload TEXT
            )"""
        )
        # Finalised official FIFA results — the continual-learning feed. One row per match_id;
        # `locked` means the result is official and may no longer be edited by anyone.
        c.execute(
            """CREATE TABLE IF NOT EXISTS official_results (
                match_id INTEGER PRIMARY KEY,
                stage TEXT NOT NULL,
                home_team TEXT NOT NULL,
                away_team TEXT NOT NULL,
                home_goals INTEGER NOT NULL,
                away_goals INTEGER NOT NULL,
                locked INTEGER NOT NULL DEFAULT 1,
                ts TEXT NOT NULL
            )"""
        )


# ---------------------------------------------------------------------------
# Official results (continual learning)
# ---------------------------------------------------------------------------
def upsert_official_result(match_id, stage, home, away, hg, ag, locked=True):
    ts = datetime.now(timezone.utc).isoformat()
    with _LOCK, _conn() as c:
        c.execute(
            """INSERT INTO official_results
                 (match_id, stage, home_team, away_team, home_goals, away_goals, locked, ts)
               VALUES (?,?,?,?,?,?,?,?)
               ON CONFLICT(match_id) DO UPDATE SET
                 stage=excluded.stage, home_team=excluded.home_team, away_team=excluded.away_team,
                 home_goals=excluded.home_goals, away_goals=excluded.away_goals,
                 locked=excluded.locked, ts=excluded.ts""",
            (int(match_id), stage, home, away, int(hg), int(ag), 1 if locked else 0, ts),
        )


def list_official_results() -> list[dict]:
    with _LOCK, _conn() as c:
        rows = c.execute(
            "SELECT match_id, stage, home_team, away_team, home_goals, away_goals, locked, ts "
            "FROM official_results ORDER BY match_id"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_official_result(match_id) -> int:
    with _LOCK, _conn() as c:
        cur = c.execute("DELETE FROM official_results WHERE match_id=?", (int(match_id),))
        return cur.rowcount


def add_vote(team1: str, team2: str, champion: str | None = None, payload: dict | None = None) -> int:
    ts = datetime.now(timezone.utc).isoformat()
    with _LOCK, _conn() as c:
        cur = c.execute(
            "INSERT INTO votes (ts, team1, team2, champion, payload) VALUES (?,?,?,?,?)",
            (ts, team1, team2, champion, json.dumps(payload) if payload else None),
        )
        return cur.lastrowid


def vote_summary(valid_teams: set[str] | None = None, top_n: int = 12) -> dict:
    """Aggregate each team's appearances across both vote slots."""
    with _LOCK, _conn() as c:
        rows = c.execute("SELECT team1, team2, champion FROM votes").fetchall()
    total = len(rows)
    counts: dict[str, int] = {}
    champ_counts: dict[str, int] = {}
    for r in rows:
        for t in (r["team1"], r["team2"]):
            if t and (valid_teams is None or t in valid_teams):
                counts[t] = counts.get(t, 0) + 1
        ch = r["champion"]
        if ch and (valid_teams is None or ch in valid_teams):
            champ_counts[ch] = champ_counts.get(ch, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])[:top_n]
    denom = total * 2 if total else 1
    top = [{"team": t, "count": n, "pct": round(100 * n / denom, 1)} for t, n in ranked]
    return {
        "total": total,
        "top": top,
        "champion_top": sorted(
            ({"team": t, "count": n} for t, n in champ_counts.items()),
            key=lambda d: -d["count"],
        )[:top_n],
    }
