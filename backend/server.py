"""FastAPI backend for the WC2026 Predictor web app.

Serves the real ML engine's predictions (teams, group forecasts, a knockout pairwise-prediction
matrix, title race) plus a SQLite-backed fan vote. No auth; replayable.
"""
from __future__ import annotations
import math
from pathlib import Path
from functools import lru_cache

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import engine as E
import db

HERE = Path(__file__).resolve().parent
DIST = HERE.parent / "frontend" / "dist"

# flagcdn ISO codes (gb-eng / gb-sct supported)
ISO = {
 'Mexico':'mx','South Africa':'za','South Korea':'kr','Czech Republic':'cz','Canada':'ca',
 'Bosnia and Herzegovina':'ba','Qatar':'qa','Switzerland':'ch','Brazil':'br','Morocco':'ma',
 'Haiti':'ht','Scotland':'gb-sct','USA':'us','Paraguay':'py','Australia':'au','Turkey':'tr',
 'Germany':'de','Curaçao':'cw',"Côte d'Ivoire":'ci','Ecuador':'ec','Netherlands':'nl','Japan':'jp',
 'Sweden':'se','Tunisia':'tn','Belgium':'be','Egypt':'eg','Iran':'ir','New Zealand':'nz','Spain':'es',
 'Cabo Verde':'cv','Saudi Arabia':'sa','Uruguay':'uy','France':'fr','Senegal':'sn','Iraq':'iq',
 'Norway':'no','Austria':'at','Jordan':'jo','Argentina':'ar','Algeria':'dz','Portugal':'pt',
 'DR Congo':'cd','Uzbekistan':'uz','Colombia':'co','England':'gb-eng','Croatia':'hr','Ghana':'gh','Panama':'pa'}

ENG = E.build()                       # train model + load data once
TEAM_GROUP = {t: g for g, ts in ENG['groups'].items() for t in ts}
VALID_TEAMS = set(ENG['teams'])
db.init_db()


def iso(t): return ISO.get(t, '')


def raw_team(name, eff):
    return {"name": name, "iso": iso(name), "elo": round(eff.get(name, ENG['ratings'].get(name, 1500))),
            "group": TEAM_GROUP.get(name, "")}


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def _pairwise(eff):
    """For every directed pair: a decisive knockout-style prediction (real ML)."""
    teams = ENG['teams']; state = ENG['state']; model = ENG['model']
    out = {h: {} for h in teams}
    for h in teams:
        for a in teams:
            if h == a:
                continue
            lh, la = E.lambdas(h, a, eff, state, model)
            M = E.score_matrix(lh, la)
            ph, pdr, pa = E.outcome_probs(M)
            pen_home = 1 / (1 + 10 ** (-(eff[h] - eff[a]) / 400))
            adv_home = ph + pdr * pen_home
            winner = "home" if adv_home >= 0.5 else "away"
            hg, ag = E.best_scoreline_constrained(M, winner)
            penalties = bool(pdr >= 0.30 and abs(ph - pa) < 0.07)
            out[h][a] = {
                "homeGoals": int(hg), "awayGoals": int(ag), "winner": winner,
                "penalties": penalties,
                "corners": E.best_count(E.corners_mu(lh, la, True), "corners"),
                "yellows": E.best_count(E.yellow_mu(ph, pdr, pa, True), "cards"),
                "reds": 0,
            }
    return out


def _group_forecasts(gp, eff):
    groups_out = {}
    for g in sorted(ENG['groups']):
        gteams = ENG['groups'][g]
        rows = {t: {"team": raw_team(t, eff), "played": 0, "wins": 0, "draws": 0,
                    "losses": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0} for t in gteams}
        matches = []
        sub = gp[gp.group == g]
        for r in sub.itertuples(index=False):
            hg, ag = int(r.predicted_home_goals), int(r.predicted_away_goals)
            matches.append({
                "matchId": f"G{int(r.match_id)}", "home": raw_team(r.home_team, eff),
                "away": raw_team(r.away_team, eff), "homeGoals": hg, "awayGoals": ag,
                "winner": r.winning_team, "penalties": False, "corners": int(r.corners),
                "yellows": int(r.yellow_cards), "reds": int(r.red_cards),
                "date": str(r.date_utc)[:10], "venue": str(r.venue)})
            H, A = rows[r.home_team], rows[r.away_team]
            H["played"] += 1; A["played"] += 1
            H["gf"] += hg; H["ga"] += ag; A["gf"] += ag; A["ga"] += hg
            if hg > ag: H["wins"] += 1; A["losses"] += 1; H["pts"] += 3
            elif ag > hg: A["wins"] += 1; H["losses"] += 1; A["pts"] += 3
            else: H["draws"] += 1; A["draws"] += 1; H["pts"] += 1; A["pts"] += 1
        for row in rows.values():
            row["gd"] = row["gf"] - row["ga"]
        order = E.deterministic_standings(gteams, ENG['group_df'], eff, ENG['state'], ENG['model'])
        standings = [rows[t] for t in order]
        groups_out[g] = {"group": g, "standings": standings, "matches": matches}
    return groups_out


def _title_race(eff):
    elos = {t: eff[t] for t in ENG['teams']}
    mx = max(elos.values())
    exps = {t: math.exp((e - mx) / 70.0) for t, e in elos.items()}
    s = sum(exps.values())
    race = [{"team": t, "iso": iso(t), "prob": exps[t] / s} for t in ENG['teams']]
    race.sort(key=lambda d: -d["prob"])
    return race


def build_payload(config: dict | None = None):
    config = config or {}
    eff = {t: ENG['effective_elo'](t, config) for t in ENG['teams']}
    gp, kp, bv = ENG['resolve'](config)
    teams = sorted((raw_team(t, eff) for t in ENG['teams']), key=lambda d: -d["elo"])
    return {
        "teams": teams,
        "group_letters": sorted(ENG['groups']),
        "groups": _group_forecasts(gp, eff),
        "pairwise": _pairwise(eff),
        "title_race": _title_race(eff),
        "meta": {"champion": bv["champion"], "champion_iso": iso(bv["champion"]),
                 "finalists": [bv["finalist_home"], bv["finalist_away"]], "semis": bv["semis"]},
    }


@lru_cache(maxsize=1)
def _base_payload():
    return build_payload({})


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
app = FastAPI(title="WC2026 Predictor API", version="1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class StrengthReq(BaseModel):
    team_bias: dict[str, int] | None = None
    squads: dict[str, dict] | None = None


class VoteReq(BaseModel):
    team1: str
    team2: str
    champion: str | None = None
    payload: dict | None = None


@app.get("/api/health")
def health():
    return {"ok": True, "teams": len(ENG['teams']),
            "model": "ml" if ENG['model'] is not None else "fallback"}


@app.get("/api/bootstrap")
def bootstrap():
    p = dict(_base_payload())
    p["votes"] = db.vote_summary(VALID_TEAMS)
    return p


@app.post("/api/strength")
def strength(req: StrengthReq):
    cfg = {}
    if req.team_bias:
        cfg["team_bias"] = {k: int(v) for k, v in req.team_bias.items()
                            if k in VALID_TEAMS and 1 <= int(v) <= 5}
    if req.squads:
        cfg["squads"] = {k: v for k, v in req.squads.items() if k in VALID_TEAMS}
    return build_payload(cfg)


@app.get("/api/players/{team}")
def players(team: str):
    pool = ENG['pool'].get(team)
    if pool is None:
        raise HTTPException(404, f"Unknown team: {team}")
    return {"team": team, "players": pool}


@app.post("/api/vote")
def vote(req: VoteReq):
    t1, t2 = req.team1, req.team2
    if t1 not in VALID_TEAMS or t2 not in VALID_TEAMS:
        raise HTTPException(400, "Both teams must be valid World Cup teams.")
    if t1 == t2:
        raise HTTPException(400, "Pick two different teams.")
    ch = req.champion if req.champion in VALID_TEAMS else None
    db.add_vote(t1, t2, ch, req.payload)
    return db.vote_summary(VALID_TEAMS)


@app.get("/api/votes")
def votes():
    return db.vote_summary(VALID_TEAMS)


# ---------------------------------------------------------------------------
# Serve the built frontend (prod). In dev the Vite server proxies /api here.
# ---------------------------------------------------------------------------
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
