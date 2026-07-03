"""One-off maintenance for the LIVE database (votes, shares, group standings).

The production DB lives on a Docker volume (WC_DB_PATH=/app/backend/data-vol/wc26.db), so these data
fixes are applied on the VM, not committed to git. db.py reads WC_DB_PATH at import, so just run this
inside the running container and it targets the live DB automatically:

    docker compose exec predictor python maintenance.py stats
    docker compose exec predictor python maintenance.py scale-votes 37
    docker compose exec predictor python maintenance.py reset-shares
    docker compose exec predictor python maintenance.py seed-results          # real group results -> official_results
    docker compose exec predictor python maintenance.py seed-standings        # admin standings overrides (optional)
    docker compose exec predictor python maintenance.py seed-knockout-results # real knockout results -> official_results

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

import pandas as pd

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


# Web/Wikipedia spellings -> the app's canonical team names.
_ALIASES = {
    "united states": "USA", "usa": "USA",
    "ivory coast": "Côte d'Ivoire", "cote d'ivoire": "Côte d'Ivoire",
    "cape verde": "Cabo Verde",
}


def seed_results(csv_path: str | None) -> None:
    """Apply real group results from a CSV (default datasets/current_results.csv) as official results.

    Each row is (home, away, hg, ag) in real-world orientation; we match the pair to the app fixture
    (playoff slots already resolved by the engine), flip the score to the fixture's orientation, and
    upsert it. Played matches make the standings count for real and re-run the ML; a fully-played group
    auto-locks. Remaining matchday-3 games can be added to the CSV later and re-seeded."""
    import engine
    db.init_db()
    path = Path(csv_path) if csv_path else (Path(__file__).resolve().parent / "datasets" / "current_results.csv")
    if not path.exists():
        print(f"CSV not found: {path}", file=sys.stderr)
        sys.exit(1)

    gf, _ks, _groups, valid = engine.load_fixtures()
    valid_lower = {t.lower(): t for t in valid}

    def canon(name: str) -> str | None:
        n = name.strip()
        if n.lower() in _ALIASES:
            return _ALIASES[n.lower()]
        return valid_lower.get(n.lower())

    # pair (frozenset of names) -> (match_id, fixture_home, fixture_away, group)
    pair_map: dict[frozenset, tuple] = {}
    for r in gf.itertuples(index=False):
        pair_map[frozenset((r.home_team, r.away_team))] = (int(r.match_id), r.home_team, r.away_team, r.group)

    applied, skipped = 0, []
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or line.lower().startswith("home,"):
                continue
            parts = next(csv.reader([line]))
            if len(parts) < 4:
                continue
            h, a, hg, ag = parts[0], parts[1], parts[2], parts[3]
            ch, ca = canon(h), canon(a)
            if not ch or not ca:
                skipped.append(f"{h} vs {a} (unknown team)")
                continue
            slot = pair_map.get(frozenset((ch, ca)))
            if not slot:
                skipped.append(f"{ch} vs {ca} (no fixture)")
                continue
            mid, fhome, faway, grp = slot
            ihg, iag = int(hg), int(ag)
            # Orient the score to the fixture's home/away.
            if fhome == ch:
                phg, pag = ihg, iag
            else:
                phg, pag = iag, ihg
            db.upsert_official_result(mid, f"Group {grp}", fhome, faway, phg, pag, locked=True)
            applied += 1

    print(f"Seeded {applied} official group results from {path.name}.")
    for s in skipped:
        print(f"  skipped: {s}")
    if not skipped:
        print("Restart the app (or it picks up on next change) to apply.")


def seed_knockout_results(csv_path: str | None) -> None:
    """Apply real knockout results from a CSV (default datasets/current_knockout_results.csv).

    Unlike group fixtures, knockout pairings aren't fixed in advance (they depend on real group
    standings + the best-third-place allocation), so each row gives the match_id directly:
    (match_id, home, away, hg, ag, winner_team). `winner_team` is required when hg==ag (the match
    went to penalties) since the engine can't infer a shootout winner from the scoreline alone.
    We sanity-check each row against the engine's OWN currently-resolved team for that slot (built
    from the official group results + standings override already in the DB) and skip + warn on a
    mismatch rather than silently seeding the wrong team into a bracket slot."""
    import engine
    db.init_db()
    path = Path(csv_path) if csv_path else (Path(__file__).resolve().parent / "datasets" / "current_knockout_results.csv")
    if not path.exists():
        print(f"CSV not found: {path}", file=sys.stderr)
        sys.exit(1)

    ks = pd.read_csv(_find_dataset("knockout_slots.csv"))
    round_of = {int(r.match_id): str(r.round) for r in ks.itertuples(index=False)}

    official = {r["match_id"]: {"hg": r["home_goals"], "ag": r["away_goals"], "home": r["home_team"],
                                 "away": r["away_team"], "winner_team": r.get("winner_team")}
                for r in db.list_official_results()}
    ENG = engine.build()
    _gp, kp, _bv = ENG["resolve"]({}, official_results=official, standings_override=db.list_group_standings())
    slot_teams = {int(r.match_id): {r.predicted_home_team, r.predicted_away_team}
                  for r in kp.itertuples(index=False)}

    applied, skipped = 0, []
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line or line.startswith("#") or line.lower().startswith("match_id,"):
                continue
            parts = next(csv.reader([line]))
            if len(parts) < 5:
                continue
            mid = int(parts[0])
            home, away, hg, ag = parts[1].strip(), parts[2].strip(), int(parts[3]), int(parts[4])
            winner_team = parts[5].strip() if len(parts) > 5 and parts[5].strip() else None
            if hg == ag and not winner_team:
                skipped.append(f"match {mid}: {home} vs {away} ({hg}-{ag}) needs winner_team (penalties)")
                continue
            round_name = round_of.get(mid)
            if not round_name:
                skipped.append(f"match {mid}: not a known knockout match_id")
                continue
            resolved = slot_teams.get(mid)
            if resolved and {home, away} != resolved:
                skipped.append(f"match {mid}: {home} vs {away} doesn't match the bracket's resolved "
                                f"slot {resolved} (group results/standings may have changed)")
                continue
            db.upsert_official_result(mid, round_name, home, away, hg, ag, locked=True, winner_team=winner_team)
            applied += 1

    print(f"Seeded {applied} official knockout results from {path.name}.")
    for s in skipped:
        print(f"  skipped: {s}")
    print("Restart the app (or it picks up on next change) to apply.")


def _find_dataset(name: str) -> Path:
    return Path(__file__).resolve().parent / "datasets" / name


def main() -> None:
    ap = argparse.ArgumentParser(description="Live DB maintenance for the WC2026 predictor.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("stats", help="show vote counts + champion distribution")
    sv = sub.add_parser("scale-votes", help="downsample votes to N, preserving the ratio")
    sv.add_argument("target", type=int)
    sub.add_parser("reset-shares", help="clear names + referral links (reset sharing)")
    ss = sub.add_parser("seed-standings", help="load group standings overrides from a CSV")
    ss.add_argument("csv", nargs="?", default=None)
    sr = sub.add_parser("seed-results", help="apply real group match results from a CSV")
    sr.add_argument("csv", nargs="?", default=None)
    sk = sub.add_parser("seed-knockout-results", help="apply real knockout match results from a CSV")
    sk.add_argument("csv", nargs="?", default=None)
    args = ap.parse_args()

    if args.cmd == "stats":
        stats()
    elif args.cmd == "scale-votes":
        scale_votes(args.target)
    elif args.cmd == "reset-shares":
        reset_shares()
    elif args.cmd == "seed-standings":
        seed_standings(args.csv)
    elif args.cmd == "seed-results":
        seed_results(args.csv)
    elif args.cmd == "seed-knockout-results":
        seed_knockout_results(args.csv)


if __name__ == "__main__":
    main()
