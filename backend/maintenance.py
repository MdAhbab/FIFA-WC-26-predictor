"""One-off maintenance for the LIVE database (votes, shares, group standings).

The production DB lives on a Docker volume (WC_DB_PATH=/app/backend/data-vol/wc26.db), so these data
fixes are applied on the VM, not committed to git. db.py reads WC_DB_PATH at import, so just run this
inside the running container and it targets the live DB automatically:

    docker compose exec predictor python maintenance.py stats
    docker compose exec predictor python maintenance.py scale-votes 37
    docker compose exec predictor python maintenance.py reset-shares
    docker compose exec predictor python maintenance.py seed-standings        # from datasets/current_standings.csv

Outside Docker, point it at a DB explicitly:
    WC_DB_PATH=/path/to/wc26.db python maintenance.py stats

Restart the app (or it re-reads on next change) so the in-memory caches pick the new data up:
    docker compose restart predictor
"""
from __future__ import annotations
import argparse
import csv
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

import db


def _conn():
    c = sqlite3.connect(db.DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def stats() -> None:
    db.init_db()
    with _conn() as c:
        total = c.execute("SELECT COUNT(*) n FROM votes").fetchone()["n"]
        named = c.execute("SELECT COUNT(*) n FROM votes WHERE name IS NOT NULL AND name<>''").fetchone()["n"]
        referred = c.execute("SELECT COUNT(*) n FROM votes WHERE referrer_vote_id IS NOT NULL").fetchone()["n"]
        champs = c.execute(
            "SELECT champion, COUNT(*) n FROM votes WHERE champion IS NOT NULL AND champion<>'' "
            "GROUP BY champion ORDER BY n DESC"
        ).fetchall()
    print(f"DB: {db.DB_PATH}")
    print(f"votes={total}  named={named}  referred={referred}")
    print("champion distribution:")
    for r in champs:
        print(f"  {r['champion']:<22} {r['n']}")


def _largest_remainder(counts: dict[str, int], target: int) -> dict[str, int]:
    """Allocate `target` keeps across strata in proportion to their counts (largest-remainder)."""
    total = sum(counts.values())
    if total == 0:
        return {}
    raw = {k: v * target / total for k, v in counts.items()}
    keep = {k: min(counts[k], int(x)) for k, x in raw.items()}
    short = target - sum(keep.values())
    # hand out the remaining slots to the biggest fractional remainders (that still have headroom)
    rema = sorted(((raw[k] - int(raw[k]), k) for k in counts), reverse=True)
    i = 0
    while short > 0 and rema:
        _, k = rema[i % len(rema)]
        if keep[k] < counts[k]:
            keep[k] += 1
            short -= 1
        i += 1
        if i > 100000:
            break
    return keep


def scale_votes(target: int) -> None:
    """Downsample the votes table to `target` rows, preserving the champion distribution (ratio)."""
    db.init_db()
    with _conn() as c:
        rows = c.execute("SELECT id, COALESCE(champion,'') AS champion FROM votes ORDER BY id").fetchall()
        total = len(rows)
        if target >= total:
            print(f"Nothing to do: {total} votes <= target {target}.")
            return
        by_champ: dict[str, list[int]] = defaultdict(list)
        for r in rows:
            by_champ[r["champion"]].append(r["id"])
        counts = {k: len(v) for k, v in by_champ.items()}
        keep_n = _largest_remainder(counts, target)
        keep_ids: list[int] = []
        for champ, ids in by_champ.items():
            keep_ids.extend(ids[: keep_n.get(champ, 0)])     # keep the earliest rows per champion
        keep_set = set(keep_ids)
        del_ids = [r["id"] for r in rows if r["id"] not in keep_set]
        c.executemany("DELETE FROM votes WHERE id=?", [(i,) for i in del_ids])
        # Heal referral links that now point at deleted rows.
        c.execute(
            "UPDATE votes SET referrer_vote_id=NULL WHERE referrer_vote_id IS NOT NULL "
            "AND referrer_vote_id NOT IN (SELECT id FROM votes)"
        )
        kept = c.execute("SELECT COUNT(*) n FROM votes").fetchone()["n"]
    print(f"Scaled votes {total} -> {kept} (deleted {len(del_ids)}), champion ratio preserved.")


def reset_shares() -> None:
    """Reset sharing 'as if nobody has shared': clear display names and referral links."""
    db.init_db()
    with _conn() as c:
        cur = c.execute("UPDATE votes SET name=NULL, referrer_vote_id=NULL")
        n = cur.rowcount
    print(f"Reset shares on {n} votes (names + referral links cleared).")


def seed_standings(csv_path: str | None) -> None:
    """Load group standings overrides from a CSV (default datasets/current_standings.csv)."""
    db.init_db()
    path = Path(csv_path) if csv_path else (Path(__file__).resolve().parent / "datasets" / "current_standings.csv")
    if not path.exists():
        print(f"CSV not found: {path}", file=sys.stderr)
        sys.exit(1)
    groups: dict[str, list[dict]] = defaultdict(list)
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or line.lower().startswith("group,"):
                continue
            parts = next(csv.reader([line]))
            g, pos, team, played, wins, draws, losses, gf, ga, pts = (parts + [""] * 10)[:10]
            groups[g.strip().upper()].append({
                "position": int(pos), "team": team.strip(), "played": int(played), "wins": int(wins),
                "draws": int(draws), "losses": int(losses), "gf": int(gf), "ga": int(ga), "pts": int(pts),
            })
    for g, rows in groups.items():
        rows.sort(key=lambda r: r["position"])
        db.upsert_group_standings(g, rows)
        print(f"Group {g}: set {len(rows)} rows -> {', '.join(r['team'] for r in rows)}")
    print(f"Seeded standings for {len(groups)} group(s). Restart the app to apply.")


def main() -> None:
    ap = argparse.ArgumentParser(description="Live DB maintenance for the WC2026 predictor.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stats", help="show vote counts + champion distribution")
    sv = sub.add_parser("scale-votes", help="downsample votes to N, preserving the ratio")
    sv.add_argument("target", type=int)
    sub.add_parser("reset-shares", help="clear names + referral links (reset sharing)")
    ss = sub.add_parser("seed-standings", help="load group standings from a CSV")
    ss.add_argument("csv", nargs="?", default=None)
    args = ap.parse_args()

    if args.cmd == "stats":
        stats()
    elif args.cmd == "scale-votes":
        scale_votes(args.target)
    elif args.cmd == "reset-shares":
        reset_shares()
    elif args.cmd == "seed-standings":
        seed_standings(args.csv)


if __name__ == "__main__":
    main()
