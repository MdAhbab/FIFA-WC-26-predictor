"""Tiny SQLite layer for fan votes + official results (stdlib only, no ORM).

The DB path can be overridden with the ``WC_DB_PATH`` env var (used in Docker so the file lives on
a persistent volume and survives redeploys)."""
import json
import os
import sqlite3
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from pathlib import Path
from threading import Lock

DB_PATH = Path(os.environ.get("WC_DB_PATH", Path(__file__).resolve().parent / "wc26.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
_LOCK = Lock()

# Feature flag to easily bypass the 12-hour IP-based rate limit for testing.
# Set to True to disable rate limits; set to False to re-enable them.
DISABLE_RATE_LIMIT = False


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
        c.execute(
            """CREATE TABLE IF NOT EXISTS admin_users (
                username TEXT PRIMARY KEY,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL
            )"""
        )
        # Admin-editable match dates (app only). One row per match_id; overrides the fixture/cosmetic
        # date shown in the app so the schedule can track real-world changes without a redeploy.
        c.execute(
            """CREATE TABLE IF NOT EXISTS match_schedule (
                match_id INTEGER PRIMARY KEY,
                date_utc TEXT NOT NULL,
                ts TEXT NOT NULL
            )"""
        )
        # Admin-set group standings override. One row per (group, team); `position` (1-4) is the
        # authoritative finishing order that drives both the displayed table AND the knockout seeding
        # — so the admin can fix a table the model gets wrong / lock a group's real final standings.
        c.execute(
            """CREATE TABLE IF NOT EXISTS group_standings (
                grp TEXT NOT NULL,
                team TEXT NOT NULL,
                played INTEGER NOT NULL DEFAULT 0,
                wins INTEGER NOT NULL DEFAULT 0,
                draws INTEGER NOT NULL DEFAULT 0,
                losses INTEGER NOT NULL DEFAULT 0,
                gf INTEGER NOT NULL DEFAULT 0,
                ga INTEGER NOT NULL DEFAULT 0,
                pts INTEGER NOT NULL DEFAULT 0,
                position INTEGER NOT NULL,
                ts TEXT NOT NULL,
                PRIMARY KEY (grp, team)
            )"""
        )

        # Migrations: Add new columns if they do not exist
        try:
            c.execute("ALTER TABLE votes ADD COLUMN name TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE votes ADD COLUMN ip_address TEXT")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE votes ADD COLUMN referrer_vote_id INTEGER")
        except sqlite3.OperationalError:
            pass
        try:
            c.execute("ALTER TABLE official_results ADD COLUMN winner_team TEXT")
        except sqlite3.OperationalError:
            pass

        # Admin account. The password comes from WC_ADMIN_PASSWORD when set, so production can use a
        # strong secret instead of the public default. If the env var is set it also ROTATES an
        # existing account's password on startup (lets you change a leaked/default password by redeploy).
        admin_pw = os.environ.get("WC_ADMIN_PASSWORD")
        existing = c.execute("SELECT username FROM admin_users WHERE username='ahbab'").fetchone()
        if not existing:
            salt = secrets.token_hex(16)
            pw_hash = hashlib.sha256((salt + (admin_pw or 'ahbab123')).encode()).hexdigest()
            c.execute("INSERT INTO admin_users (username, password_hash, salt) VALUES (?,?,?)",
                      ('ahbab', pw_hash, salt))
        elif admin_pw:
            salt = secrets.token_hex(16)
            pw_hash = hashlib.sha256((salt + admin_pw).encode()).hexdigest()
            c.execute("UPDATE admin_users SET password_hash=?, salt=? WHERE username='ahbab'",
                      (pw_hash, salt))


# ---------------------------------------------------------------------------
# Official results (continual learning)
# ---------------------------------------------------------------------------
def upsert_official_result(match_id, stage, home, away, hg, ag, locked=True, winner_team=None):
    ts = datetime.now(timezone.utc).isoformat()
    with _LOCK, _conn() as c:
        c.execute(
            """INSERT INTO official_results
                 (match_id, stage, home_team, away_team, home_goals, away_goals, locked, ts, winner_team)
               VALUES (?,?,?,?,?,?,?,?,?)
               ON CONFLICT(match_id) DO UPDATE SET
                 stage=excluded.stage, home_team=excluded.home_team, away_team=excluded.away_team,
                 home_goals=excluded.home_goals, away_goals=excluded.away_goals,
                 locked=excluded.locked, ts=excluded.ts, winner_team=excluded.winner_team""",
            (int(match_id), stage, home, away, int(hg), int(ag), 1 if locked else 0, ts, winner_team),
        )


def list_official_results() -> list[dict]:
    with _LOCK, _conn() as c:
        rows = c.execute(
            "SELECT match_id, stage, home_team, away_team, home_goals, away_goals, locked, ts, winner_team "
            "FROM official_results ORDER BY match_id"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_official_result(match_id) -> int:
    with _LOCK, _conn() as c:
        cur = c.execute("DELETE FROM official_results WHERE match_id=?", (int(match_id),))
        return cur.rowcount


# ---------------------------------------------------------------------------
# Match schedule (admin-editable dates; app display only)
# ---------------------------------------------------------------------------
def upsert_schedule(match_id, date_utc) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    with _LOCK, _conn() as c:
        c.execute(
            """INSERT INTO match_schedule (match_id, date_utc, ts) VALUES (?,?,?)
               ON CONFLICT(match_id) DO UPDATE SET date_utc=excluded.date_utc, ts=excluded.ts""",
            (int(match_id), str(date_utc), ts),
        )


def list_schedule() -> list[dict]:
    with _LOCK, _conn() as c:
        rows = c.execute(
            "SELECT match_id, date_utc FROM match_schedule ORDER BY match_id"
        ).fetchall()
    return [dict(r) for r in rows]


def delete_schedule(match_id) -> int:
    with _LOCK, _conn() as c:
        cur = c.execute("DELETE FROM match_schedule WHERE match_id=?", (int(match_id),))
        return cur.rowcount


# ---------------------------------------------------------------------------
# Group standings override (admin-set positions / points)
# ---------------------------------------------------------------------------
def upsert_group_standings(grp: str, rows: list[dict]) -> None:
    """Replace the whole standings override for one group. `rows` is the 4 teams already in finishing
    order (index 0 = 1st); position is derived from the order. Pass [] to clear the group."""
    ts = datetime.now(timezone.utc).isoformat()
    with _LOCK, _conn() as c:
        c.execute("DELETE FROM group_standings WHERE grp=?", (grp,))
        for i, r in enumerate(rows):
            gf = int(r.get("gf", 0)); ga = int(r.get("ga", 0))
            c.execute(
                """INSERT INTO group_standings
                     (grp, team, played, wins, draws, losses, gf, ga, pts, position, ts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (grp, str(r["team"]), int(r.get("played", 0)), int(r.get("wins", 0)),
                 int(r.get("draws", 0)), int(r.get("losses", 0)), gf, ga,
                 int(r.get("pts", 0)), i + 1, ts),
            )


def list_group_standings() -> dict[str, list[dict]]:
    """All admin standings overrides as {group: [rows ordered by position]} with gd derived."""
    with _LOCK, _conn() as c:
        rows = c.execute(
            "SELECT grp, team, played, wins, draws, losses, gf, ga, pts, position "
            "FROM group_standings ORDER BY grp, position"
        ).fetchall()
    out: dict[str, list[dict]] = {}
    for r in rows:
        d = dict(r)
        d["gd"] = d["gf"] - d["ga"]
        out.setdefault(d["grp"], []).append(d)
    return out


def delete_group_standings(grp: str) -> int:
    with _LOCK, _conn() as c:
        cur = c.execute("DELETE FROM group_standings WHERE grp=?", (grp,))
        return cur.rowcount


def add_vote(team1: str, team2: str = "", champion: str | None = None, payload: dict | None = None, name: str | None = None, ip_address: str | None = None, referrer_vote_id: int | None = None) -> int:
    # team2 is optional (a single-champion vote stores "" — the NOT NULL column needs a value).
    ts = datetime.now(timezone.utc).isoformat()
    with _LOCK, _conn() as c:
        cur = c.execute(
            "INSERT INTO votes (ts, team1, team2, champion, payload, name, ip_address, referrer_vote_id) VALUES (?,?,?,?,?,?,?,?)",
            (ts, team1, team2 or "", champion, json.dumps(payload) if payload else None, name, ip_address, referrer_vote_id),
        )
        return cur.lastrowid


def _resolve_unique_name(c, requested_name: str | None) -> str:
    """Collision-free display name, computed against the rows visible inside the caller's open
    connection `c`. Must be called while holding `_LOCK` so the lookup + the subsequent insert are
    a single critical section (see add_vote_unique)."""
    requested = (requested_name or "").strip()
    if not requested:
        return "Anonymous"
    rows = c.execute("SELECT name FROM votes WHERE name IS NOT NULL").fetchall()
    existing = {r["name"].lower() for r in rows if r["name"]}
    if requested.lower() not in existing:
        return requested
    i = 1
    while f"{requested}{i}".lower() in existing:
        i += 1
    return f"{requested}{i}"


def add_vote_unique(team1: str, team2: str = "", champion: str | None = None, payload: dict | None = None,
                    requested_name: str | None = None, ip_address: str | None = None,
                    referrer_vote_id: int | None = None) -> tuple[int, str]:
    """Resolve a collision-free name and insert the vote ATOMICALLY under a single lock, so two
    concurrent voters can never be assigned the same name. Returns (vote_id, resolved_name)."""
    ts = datetime.now(timezone.utc).isoformat()
    with _LOCK, _conn() as c:
        name = _resolve_unique_name(c, requested_name)
        cur = c.execute(
            "INSERT INTO votes (ts, team1, team2, champion, payload, name, ip_address, referrer_vote_id) VALUES (?,?,?,?,?,?,?,?)",
            (ts, team1, team2 or "", champion, json.dumps(payload) if payload else None, name, ip_address, referrer_vote_id),
        )
        return cur.lastrowid, name


def vote_summary(valid_teams: set[str] | None = None, top_n: int = 12) -> dict:
    """Aggregate champion support across every pick. Each vote contributes its champion picks
    (team1 always; team2 too when a homepage voter named a second champion). The board percentage is
    over the total number of champion picks cast (not votes*2), so 1- and 2-pick votes mix correctly."""
    with _LOCK, _conn() as c:
        rows = c.execute("SELECT team1, team2, champion FROM votes").fetchall()
    total = len(rows)
    counts: dict[str, int] = {}
    champ_counts: dict[str, int] = {}
    picks = 0
    for r in rows:
        for t in (r["team1"], r["team2"]):
            if t and (valid_teams is None or t in valid_teams):
                counts[t] = counts.get(t, 0) + 1
                picks += 1
        ch = r["champion"]
        if ch and (valid_teams is None or ch in valid_teams):
            champ_counts[ch] = champ_counts.get(ch, 0) + 1
    ranked = sorted(counts.items(), key=lambda kv: -kv[1])[:top_n]
    denom = picks if picks else 1
    top = [{"team": t, "count": n, "pct": round(100 * n / denom, 1)} for t, n in ranked]
    return {
        "total": total,
        "top": top,
        "champion_top": sorted(
            ({"team": t, "count": n} for t, n in champ_counts.items()),
            key=lambda d: -d["count"],
        )[:top_n],
    }

def delete_vote(vote_id: int) -> int:
    with _LOCK, _conn() as c:
        cur = c.execute("DELETE FROM votes WHERE id=?", (int(vote_id),))
        return cur.rowcount

def clear_all_votes() -> int:
    with _LOCK, _conn() as c:
        cur = c.execute("DELETE FROM votes")
        return cur.rowcount


# ---------------------------------------------------------------------------
# Admin auth
# ---------------------------------------------------------------------------
def verify_admin(username: str, password: str) -> bool:
    with _LOCK, _conn() as c:
        row = c.execute(
            "SELECT password_hash, salt FROM admin_users WHERE username=?", (username,)
        ).fetchone()
    if not row:
        return False
    expected = hashlib.sha256((row["salt"] + password).encode()).hexdigest()
    return secrets.compare_digest(expected, row["password_hash"])


# ---------------------------------------------------------------------------
# Share Link & Rate Limiting System
# ---------------------------------------------------------------------------
def has_voted_recently(ip: str) -> tuple[bool, int]:
    """Check if IP voted in last 12 hours. Returns (voted, seconds_remaining)."""
    if DISABLE_RATE_LIMIT:
        return False, 0

    if not ip:
        return False, 0
    with _LOCK, _conn() as c:
        row = c.execute(
            "SELECT ts FROM votes WHERE ip_address = ? ORDER BY ts DESC LIMIT 1",
            (ip,)
        ).fetchone()
    if not row:
        return False, 0
    try:
        last_ts = datetime.fromisoformat(row["ts"])
    except Exception:
        return False, 0
    if last_ts.tzinfo is None:
        last_ts = last_ts.replace(tzinfo=timezone.utc)
    elapsed = datetime.now(timezone.utc) - last_ts
    limit = timedelta(hours=12)
    if elapsed < limit:
        remaining = limit - elapsed
        return True, int(remaining.total_seconds())
    return False, 0


def make_unique_name(requested_name: str) -> str:
    requested_name = (requested_name or "").strip()
    if not requested_name:
        return "Anonymous"
    with _LOCK, _conn() as c:
        rows = c.execute("SELECT name FROM votes WHERE name IS NOT NULL").fetchall()
    existing_lowercased = {r["name"].lower() for r in rows if r["name"]}
    if requested_name.lower() not in existing_lowercased:
        return requested_name
    i = 1
    while True:
        candidate = f"{requested_name}{i}"
        if candidate.lower() not in existing_lowercased:
            return candidate
        i += 1


def _top4_of(row: dict) -> list[str]:
    """A voter's top-4 picks. Play votes store an explicit `top4` (their bracket's final four) in the
    payload; homepage/champion votes fall back to their named champion pick(s)."""
    try:
        p = json.loads(row.get("payload") or "{}")
        t4 = p.get("top4")
        if isinstance(t4, list) and t4:
            return [str(x) for x in t4 if x][:4]
    except Exception:
        pass
    return [t for t in (row.get("team1"), row.get("team2")) if t]


def _decorate(row: dict) -> dict:
    """Attach `top4` + a clean `champion` to a vote row and drop the raw payload from the response."""
    d = dict(row)
    d["top4"] = _top4_of(d)
    d.pop("payload", None)
    return d


def find_latest_vote_by_name(name: str) -> dict | None:
    """Recover a referral hub by the display name the user entered (most recent match wins).
    Used by the 'find my hub' lookup so a user who cleared their browser / switched device can still
    reach their link, referrals and top-4 picks. Returns {vote_id, name} or None."""
    n = (name or "").strip()
    if not n:
        return None
    with _LOCK, _conn() as c:
        row = c.execute(
            "SELECT id, name FROM votes WHERE name IS NOT NULL AND LOWER(name)=LOWER(?) "
            "ORDER BY id DESC LIMIT 1",
            (n,),
        ).fetchone()
    return {"vote_id": row["id"], "name": row["name"]} if row else None


def get_shared_vote_details(vote_id: int) -> dict | None:
    """Fetch referrer vote details, referred friends' votes, and the parent vote who referred the host.
    Every returned voter carries their `top4` picks so the comparison can show full top lists, not
    just the champion. `match_count` = overlap of top-4 picks with the host (referrer)."""
    cols = "id, name, team1, team2, champion, payload, ts, referrer_vote_id"
    with _LOCK, _conn() as c:
        ref_row = c.execute(f"SELECT {cols} FROM votes WHERE id = ?", (int(vote_id),)).fetchone()
        if not ref_row:
            return None
        friend_rows = c.execute(
            f"SELECT {cols} FROM votes WHERE referrer_vote_id = ? ORDER BY ts ASC", (int(vote_id),)
        ).fetchall()
        parent_row = None
        if ref_row["referrer_vote_id"] is not None:
            parent_row = c.execute(
                f"SELECT {cols} FROM votes WHERE id = ?", (int(ref_row["referrer_vote_id"]),)
            ).fetchone()

    ref = _decorate(ref_row)
    ref_top = set(ref["top4"])

    parent = None
    if parent_row:
        parent = _decorate(parent_row)
        parent["match_count"] = len(ref_top.intersection(parent["top4"]))

    friends = []
    for fr in friend_rows:
        fd = _decorate(fr)
        fd["match_count"] = len(ref_top.intersection(fd["top4"]))
        friends.append(fd)

    return {"referrer": ref, "friends": friends, "parent": parent}
