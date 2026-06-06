"""Tiny SQLite layer for fan votes (stdlib only, no ORM)."""
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

DB_PATH = Path(__file__).resolve().parent / "wc26.db"
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
