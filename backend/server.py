"""FastAPI backend for the WC2026 Predictor web app.

Serves the real ML engine's predictions (teams, group forecasts, a knockout pairwise-prediction
matrix, a Monte-Carlo title race) plus a SQLite-backed fan vote, anonymous sessions, a football-news
rail, per-match insight, and a continual-learning hook for finalised official results.

Performance model (the VM is small):
  * The goal model is trained/loaded **once** at process start (see engine.train_goal_model — it is
    persisted to disk, so restarts are ~instant).
  * Every prediction payload is built from one batched inference and cached (LRU, invalidated only
    when official results change). The base payload is warmed at startup, so the common path is a
    pure cache hit and 20+ concurrent visitors are served without recomputation.
  * Heavy recomputes (custom squads/bias) are bounded by a semaphore and use a lighter Monte-Carlo.
"""
from __future__ import annotations
import copy
import html as _html
import json
import os
import re
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path


def _load_dotenv(path: Path) -> None:
    """Minimal stdlib .env loader, run before any module reads os.environ. Keeps secrets (the NewsAPI
    key, admin token) out of source and git; a real process-manager/Docker env var always wins."""
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
    except FileNotFoundError:
        pass
    except Exception:
        pass


_load_dotenv(Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, HTMLResponse, Response as RawResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import db
import engine as E
import news
import sessions
import pandas as pd

HERE = Path(__file__).resolve().parent
DIST = HERE.parent / "frontend" / "dist"

ADMIN_TOKEN = os.environ.get("WC_ADMIN_TOKEN", "dev_admin_token")
if ADMIN_TOKEN == "dev_admin_token":
    print("[warning] WC_ADMIN_TOKEN not set. Using the insecure default 'dev_admin_token' (dev only). "
          "In production set BOTH WC_ADMIN_TOKEN and WC_ADMIN_PASSWORD to long random values — the "
          "default admin password is public in the repo.")
MC_BASE_SIMS = int(os.environ.get("WC_MC_SIMS", "4000"))    # full sim for the cached base payload
MC_TUNE_SIMS = int(os.environ.get("WC_MC_SIMS_TUNE", "1500"))  # lighter sim for live tweaks
MAX_COMPUTE = int(os.environ.get("WC_MAX_COMPUTE", "4"))    # concurrent heavy recomputes

# How many reverse-proxy hops to trust in X-Forwarded-For. The edge proxy (Caddy/nginx) appends the
# real client to the RIGHT, so we read the Nth-from-right entry; a client-spoofed left entry is ignored.
# 0 = ignore XFF entirely (direct exposure). Default 1 = exactly one trusted proxy in front.
TRUSTED_PROXY_HOPS = int(os.environ.get("WC_TRUSTED_PROXY_HOPS", "1"))

# Admin-login brute-force guard (in-memory, per source IP).
_LOGIN_LOCK = threading.Lock()
_LOGIN_ATTEMPTS: "dict[str, list[float]]" = {}
LOGIN_MAX_ATTEMPTS = int(os.environ.get("WC_LOGIN_MAX_ATTEMPTS", "8"))
LOGIN_WINDOW_SECS = int(os.environ.get("WC_LOGIN_WINDOW_SECS", "900"))   # 15 minutes


def _client_ip(request: "Request") -> str:
    """Best-effort real client IP. Trusts only the right-most TRUSTED_PROXY_HOPS entries of
    X-Forwarded-For (set by our own edge proxy), so a spoofed left-most value can't beat the limiter."""
    if TRUSTED_PROXY_HOPS > 0:
        xff = request.headers.get("X-Forwarded-For", "")
        parts = [p.strip() for p in xff.split(",") if p.strip()]
        if parts:
            idx = min(len(parts), TRUSTED_PROXY_HOPS)
            return parts[-idx]
    return request.client.host if request.client else "127.0.0.1"


def _login_rate_limited(ip: str) -> bool:
    """Record an attempt and return True if `ip` has exceeded the login attempt budget."""
    import time as _t
    now = _t.time()
    with _LOGIN_LOCK:
        hist = [t for t in _LOGIN_ATTEMPTS.get(ip, []) if now - t < LOGIN_WINDOW_SECS]
        hist.append(now)
        _LOGIN_ATTEMPTS[ip] = hist
        return len(hist) > LOGIN_MAX_ATTEMPTS

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

ENG = E.build()                        # train/load model + load data once
TEAM_GROUP = {t: g for g, ts in ENG['groups'].items() for t in ts}
VALID_TEAMS = set(ENG['teams'])
GROUP_FIX = {int(r.match_id): r for r in ENG['group_df'].itertuples(index=False)}
BASE_STATE = copy.deepcopy(ENG['state'])   # pristine team state, replayed when results change
db.init_db()


def iso(t): return ISO.get(t, '')


def raw_team(name, eff):
    return {"name": name, "iso": iso(name), "elo": round(eff.get(name, ENG['ratings'].get(name, 1500))),
            "group": TEAM_GROUP.get(name, "")}


# ---------------------------------------------------------------------------
# Continual learning: official results -> incremental Elo -> cache invalidation
# ---------------------------------------------------------------------------
_GEN = 0                       # bumps when team state changes; part of every cache key
_RESULTS: dict[int, dict] = {}  # match_id -> {match_id, stage, home, away, hg, ag, locked}
_STATE_LOCK = threading.Lock()


def _rebuild_state_from_results():
    """Reset team state to pristine, then replay every official result via incremental Elo.

    Replaying from a clean base keeps the update idempotent (Elo updates are not commutative/
    reversible), so editing or removing a result never leaves drift behind."""
    global _GEN
    with _STATE_LOCK:
        st = ENG['state']
        for t, base in BASE_STATE.items():
            st[t].update(copy.deepcopy(base))
        for r in sorted(_RESULTS.values(), key=lambda r: r['match_id']):
            E.elo_update(st, r['home'], r['away'], r['hg'], r['ag'])
        ENG['ratings'].update({t: st[t]['elo'] for t in ENG['teams']})
        _GEN += 1
    _CACHE.clear()


def _load_results():
    _RESULTS.clear()
    for r in db.list_official_results():
        _RESULTS[r['match_id']] = {
            'match_id': r['match_id'], 'stage': r['stage'], 'home': r['home_team'],
            'away': r['away_team'], 'hg': r['home_goals'], 'ag': r['away_goals'],
            'locked': bool(r['locked']),
            'winner_team': r.get('winner_team')
        }
    _rebuild_state_from_results()


# Admin-editable match dates (app display only — no effect on Elo/predictions, so no cache bump).
_SCHEDULE: dict[int, str] = {}


def _load_schedule():
    _SCHEDULE.clear()
    for r in db.list_schedule():
        _SCHEDULE[int(r['match_id'])] = str(r['date_utc'])


def _schedule_list() -> list[dict]:
    return [{"match_id": k, "date_utc": v} for k, v in sorted(_SCHEDULE.items())]


# ---------------------------------------------------------------------------
# SEO: the served index.html + sitemap are re-rendered with the *current* predicted champion and a
# "last updated" timestamp, so an admin result/date change is reflected to crawlers without a rebuild.
# ---------------------------------------------------------------------------
PUBLIC_DOMAIN = os.environ.get("WC_PUBLIC_DOMAIN", "fifaworldcup26predictor.ahbab.dev")
_SEO_LOCK = threading.Lock()
_SEO_GEN = 0
_LAST_MODIFIED = datetime.now(timezone.utc)
_INDEX_RAW: str | None = None
_INDEX_RENDERED: str | None = None
_INDEX_KEY: tuple | None = None


def _bump_seo():
    """Mark the site as freshly updated so the next index.html / sitemap serve reflects it."""
    global _SEO_GEN, _LAST_MODIFIED
    with _SEO_LOCK:
        _SEO_GEN += 1
        _LAST_MODIFIED = datetime.now(timezone.utc)


def _current_champion() -> str:
    try:
        return str(get_payload({}, MC_BASE_SIMS).get("meta", {}).get("champion") or "")
    except Exception:
        return ""


def _set_title(html_text: str, title: str) -> str:
    return re.sub(r"<title>.*?</title>", f"<title>{_html.escape(title)}</title>",
                  html_text, count=1, flags=re.S)


def _set_meta(html_text: str, attr: str, name: str, content: str) -> str:
    esc = _html.escape(content, quote=True)
    pat = re.compile(r'(<meta\s+' + attr + r'="' + re.escape(name) + r'"\s+content=")(.*?)(")', re.S)
    return pat.sub(lambda m: m.group(1) + esc + m.group(3), html_text, count=1) if pat.search(html_text) else html_text


def _render_index() -> str:
    """index.html with SEO title/description/OG re-rendered for the current champion + last-updated."""
    global _INDEX_RAW, _INDEX_RENDERED, _INDEX_KEY
    with _SEO_LOCK:
        if _INDEX_RAW is None:
            _INDEX_RAW = (DIST / "index.html").read_text(encoding="utf-8")
        last = _LAST_MODIFIED
        seo_gen = _SEO_GEN
    champ = _current_champion()
    results_applied = len(_RESULTS)
    key = (seo_gen, champ, results_applied)
    with _SEO_LOCK:
        if _INDEX_KEY == key and _INDEX_RENDERED is not None:
            return _INDEX_RENDERED
    updated = last.strftime("%B ") + str(last.day) + last.strftime(", %Y")
    iso = last.isoformat()
    if champ:
        title = f"FIFA World Cup 2026 Predictor — {champ} projected to win"
        desc = (f"Updated {updated}: the ML model currently projects {champ} to win the 2026 FIFA World Cup"
                + (f" ({results_applied} official results factored in)" if results_applied else "")
                + ". Group forecasts, full knockout bracket and Monte-Carlo champion odds. Entertainment only.")
    else:
        title = "FIFA World Cup 2026 Predictor — ML Bracket, Group & Knockout Predictions"
        desc = ("Free ML-powered FIFA World Cup 2026 predictor: group forecasts, full knockout bracket, "
                "champion odds from Monte-Carlo simulations. Build your own bracket and vote. Entertainment only.")
    html_text = _set_title(_INDEX_RAW, title)
    for a, n in (("name", "description"), ("property", "og:description"), ("name", "twitter:description")):
        html_text = _set_meta(html_text, a, n, desc)
    for a, n in (("property", "og:title"), ("name", "twitter:title")):
        html_text = _set_meta(html_text, a, n, title)
    extra = (f'<meta property="og:updated_time" content="{iso}" />\n'
             f'    <meta name="last-modified" content="{iso}" />\n  ')
    html_text = html_text.replace("</head>", extra + "</head>", 1)
    with _SEO_LOCK:
        _INDEX_RENDERED, _INDEX_KEY = html_text, key
    return html_text


# ---------------------------------------------------------------------------
# Serialisation
# ---------------------------------------------------------------------------
def _pairwise(eff, lam):
    """For every directed pair: a decisive knockout-style prediction (real ML)."""
    teams = ENG['teams']
    out = {h: {} for h in teams}
    for h in teams:
        for a in teams:
            if h == a:
                continue
            lh, la = lam[h][a]
            M = E.score_matrix(lh, la)
            ph, pdr, pa = E.outcome_probs(M)
            pen_home = 1 / (1 + 10 ** (-(eff[h] - eff[a]) / 400))
            adv_home = ph + pdr * pen_home
            winner = "home" if adv_home >= 0.5 else "away"
            # A knockout cannot end level in regulation: if a shootout is the likely outcome we show a
            # COHERENT level scoreline (e.g. 1-1) + the advancer, instead of a decisive score with a
            # contradictory "PENS" tag. The frontend renders "1-1 (TEAM win on penalties)".
            penalties = bool(pdr >= 0.30 and abs(ph - pa) < 0.07)
            if penalties:
                hg, ag = E.best_scoreline_constrained(M, "draw")   # most-likely level score
            else:
                hg, ag = E.best_scoreline_constrained(M, winner)   # decisive score matching the advancer
            out[h][a] = {
                "homeGoals": int(hg), "awayGoals": int(ag), "winner": winner,
                "penalties": penalties,
                "corners": E.best_count(E.corners_mu(lh, la, True), "corners"),
                "yellows": E.best_count(E.yellow_mu(ph, pdr, pa, True), "cards"),
                "reds": 0,
            }
    return out


def _group_forecasts(gp, eff, lam):
    groups_out = {}
    for g in sorted(ENG['groups']):
        gteams = ENG['groups'][g]
        rows = {t: {"team": raw_team(t, eff), "played": 0, "wins": 0, "draws": 0,
                    "losses": 0, "gf": 0, "ga": 0, "gd": 0, "pts": 0} for t in gteams}
        matches = []
        sub = gp[gp.group == g]
        for r in sub.itertuples(index=False):
            mid = int(r.match_id)
            official = _RESULTS.get(mid)
            if official:                       # finalised result overrides the prediction
                hg, ag = int(official['hg']), int(official['ag'])
                winner = 'home' if hg > ag else 'away' if ag > hg else 'draw'
            else:
                hg, ag = int(r.predicted_home_goals), int(r.predicted_away_goals)
                # App display is COHERENT (unlike the EV-optimal competition submission, where the
                # argmax winning_team is scored independently of the scoreline): derive the shown
                # winner from the predicted score so a 1-1 reads "Draw" and matches the standings
                # table below, which already awards both teams a point for a level score.
                winner = 'home' if hg > ag else 'away' if ag > hg else 'draw'
            matches.append({
                "matchId": f"G{mid}", "home": raw_team(r.home_team, eff),
                "away": raw_team(r.away_team, eff), "homeGoals": hg, "awayGoals": ag,
                "winner": winner, "penalties": False, "corners": int(r.corners),
                "yellows": int(r.yellow_cards), "reds": int(r.red_cards),
                "date": str(r.date_utc)[:10], "venue": str(r.venue),
                "official": bool(official), "locked": bool(official and official['locked'])})
            H, A = rows[r.home_team], rows[r.away_team]
            H["played"] += 1; A["played"] += 1
            H["gf"] += hg; H["ga"] += ag; A["gf"] += ag; A["ga"] += hg
            if hg > ag: H["wins"] += 1; A["losses"] += 1; H["pts"] += 3
            elif ag > hg: A["wins"] += 1; H["losses"] += 1; A["pts"] += 3
            else: H["draws"] += 1; A["draws"] += 1; H["pts"] += 1; A["pts"] += 1
        for row in rows.values():
            row["gd"] = row["gf"] - row["ga"]
        order = E.deterministic_standings(gteams, ENG['group_df'], eff, ENG['state'], ENG['model'], lam)
        standings = [rows[t] for t in order]
        groups_out[g] = {"group": g, "standings": standings, "matches": matches}
    return groups_out


def build_payload(config: dict | None = None, n_sims: int = MC_BASE_SIMS):
    config = config or {}
    eff = {t: ENG['effective_elo'](t, config) for t in ENG['teams']}
    lam = E.build_lambda_matrix(ENG['teams'], eff, ENG['state'], ENG['model'])
    gp, kp, bv = ENG['resolve'](config, official_results=_RESULTS)
    teams = sorted((raw_team(t, eff) for t in ENG['teams']), key=lambda d: -d["elo"])
    
    mp = HERE / 'datasets' / 'market_probabilities.csv'
    if mp.exists():
        m = pd.read_csv(mp).sort_values('champion_probability', ascending=False)
        cp = []
        for _, r in m.head(32).iterrows():
            cp.append({
                'team': r['team'],
                'champion': float(r['champion_probability']),
                'final': float(r.get('final_probability', 0)),
                'semi': float(r.get('semi_final_probability', 0)),
                'quarter': float(r.get('quarter_final_probability', 0)),
                'r16': float(r.get('round_of_16_probability', 0))
            })
    else:
        cp = E.champion_probabilities(lam, ENG['groups'], ENG['knock_df'], n_sims=n_sims, official_results=_RESULTS, group_df=ENG['group_df'])

    title_race = [{"team": d["team"], "iso": iso(d["team"]), "prob": d["champion"],
                   "final": d["final"], "semi": d["semi"], "quarter": d["quarter"], "r16": d["r16"]}
                  for d in cp]
    champ_prob = {d["team"]: d["champion"] for d in cp}
    return {
        "teams": teams,
        "group_letters": sorted(ENG['groups']),
        "groups": _group_forecasts(gp, eff, lam),
        "pairwise": _pairwise(eff, lam),
        "title_race": title_race,
        "meta": {"champion": bv["champion"], "champion_iso": iso(bv["champion"]),
                 "champion_prob": round(champ_prob.get(bv["champion"], 0.0), 4),
                 "finalists": [bv["finalist_home"], bv["finalist_away"]], "semis": bv["semis"],
                 "sims": n_sims, "results_applied": len(_RESULTS)},
    }


# ---------------------------------------------------------------------------
# Payload cache (warmed once; invalidated only when official results change)
# ---------------------------------------------------------------------------
_CACHE: "OrderedDict[tuple, dict]" = OrderedDict()
_CACHE_MAX = 24
_CACHE_LOCK = threading.Lock()
_COMPUTE_SEM = threading.Semaphore(MAX_COMPUTE)


def get_payload(config: dict, n_sims: int) -> dict:
    key = (_GEN, json.dumps(config, sort_keys=True, default=str))
    with _CACHE_LOCK:
        hit = _CACHE.get(key)
        if hit is not None:
            _CACHE.move_to_end(key)
            return hit
    with _COMPUTE_SEM:                      # bound concurrent heavy recomputes
        with _CACHE_LOCK:                   # someone may have computed it while we waited
            hit = _CACHE.get(key)
            if hit is not None:
                _CACHE.move_to_end(key)
                return hit
        payload = build_payload(config, n_sims)
        with _CACHE_LOCK:
            _CACHE[key] = payload
            while len(_CACHE) > _CACHE_MAX:
                _CACHE.popitem(last=False)
        return payload


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
app = FastAPI(title="WC2026 Predictor API", version="2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class StrengthReq(BaseModel):
    team_bias: dict[str, int] | None = None
    squads: dict[str, dict] | None = None
    knockout_goals: dict[str, dict] | None = None  # matchId -> {home: int, away: int}


class VoteReq(BaseModel):
    team1: str
    team2: str
    champion: str | None = None
    name: str | None = None
    referrer_vote_id: int | None = None
    payload: dict | None = None


class ResultReq(BaseModel):
    match_id: int
    home_team: str
    away_team: str
    home_goals: int
    away_goals: int
    stage: str = "group"
    locked: bool = True
    winner_team: str | None = None


class ScheduleReq(BaseModel):
    match_id: int
    date_utc: str


def _attach_session(request: Request, response: Response) -> str:
    sid, _s, _created = sessions.touch(request.cookies.get(sessions.COOKIE_NAME))
    response.set_cookie(sessions.COOKIE_NAME, sid, max_age=sessions.SESSION_TTL,
                        httponly=True, samesite="lax")
    return sid


@app.on_event("startup")
def _startup():
    _load_results()                 # replay any saved official results onto team state
    _load_schedule()                # load admin-edited match dates
    get_payload({}, MC_BASE_SIMS)   # warm the base payload exactly once


@app.get("/api/health")
def health():
    return {"ok": True, "teams": len(ENG['teams']),
            "model": "ml" if ENG['model'] is not None else "fallback",
            "active_sessions": sessions.count(), "results_applied": len(_RESULTS),
            "generation": _GEN, "cache_entries": len(_CACHE)}


@app.get("/api/bootstrap")
def bootstrap(request: Request, response: Response):
    sid = _attach_session(request, response)
    p = dict(get_payload({}, MC_BASE_SIMS))
    p["votes"] = db.vote_summary(VALID_TEAMS)
    p["results"] = list(_RESULTS.values())
    p["schedule"] = _schedule_list()
    p["session"] = sessions.info(sid)
    return p


@app.post("/api/strength")
def strength(req: StrengthReq, request: Request, response: Response):
    cfg = {}
    if req.team_bias:
        cfg["team_bias"] = {k: int(v) for k, v in req.team_bias.items()
                            if k in VALID_TEAMS and 1 <= int(v) <= 5}
    if req.squads:
        cfg["squads"] = {k: v for k, v in req.squads.items() if k in VALID_TEAMS}
    if req.knockout_goals:
        # Build knockout config entries from goal overrides
        ko_cfg = cfg.setdefault("knockout", {})
        for mid_str, goals in req.knockout_goals.items():
            try:
                mid = int(mid_str)
                if 73 <= mid <= 100:  # R32/R16/QF only
                    entry = ko_cfg.setdefault(str(mid), {"mode": "manual"})
                    if "winner_team" not in entry:
                        entry["mode"] = "manual"  # auto-mode: engine decides winner, uses goals
                    entry["home_goals"] = int(goals.get("home", 0))
                    entry["away_goals"] = int(goals.get("away", 0))
            except (ValueError, TypeError):
                pass
    sid = _attach_session(request, response)
    sessions.set_config(sid, cfg)
    return get_payload(cfg, MC_TUNE_SIMS)


@app.get("/api/session")
def session(request: Request, response: Response):
    sid = _attach_session(request, response)
    out = sessions.info(sid)
    out["active_sessions"] = sessions.count()
    return out


@app.get("/api/players/{team}")
def players(team: str):
    pool = ENG['pool'].get(team)
    if pool is None:
        raise HTTPException(404, f"Unknown team: {team}")
    return {"team": team, "players": pool}


@app.get("/api/match")
def match(home: str, away: str, match_id: int | None = None):
    if home not in VALID_TEAMS or away not in VALID_TEAMS:
        raise HTTPException(404, "Unknown team(s).")
    if home == away:
        raise HTTPException(400, "Pick two different teams.")
    eff = {home: ENG['effective_elo'](home, {}), away: ENG['effective_elo'](away, {})}
    lh, la = E.lambdas(home, away, eff, ENG['state'], ENG['model'])
    M = E.score_matrix(lh, la)
    ph, pdr, pa = E.outcome_probs(M)
    hg, ag = E.best_scoreline(M)
    # A match is "finalised" once an official result is recorded for its id: its news freezes.
    finalized = bool(match_id is not None and int(match_id) in _RESULTS)
    related = news.for_match(home, away, finalized=finalized)
    return {
        "home": raw_team(home, eff), "away": raw_team(away, eff),
        "matchId": match_id, "finalized": finalized,
        "probabilities": {"home": round(ph, 4), "draw": round(pdr, 4), "away": round(pa, 4)},
        "predicted": {"homeGoals": int(hg), "awayGoals": int(ag),
                      "lambdaHome": round(lh, 2), "lambdaAway": round(la, 2)},
        "h2h": E.head_to_head(ENG['mdf'], home, away),
        "lineups": {"home": E.probable_xi(home, ENG['presets'], ENG['pool']),
                    "away": E.probable_xi(away, ENG['presets'], ENG['pool'])},
        "news": related, "hasNews": bool(related),
    }


@app.get("/api/news")
def get_news(n: int = 8):
    return {"items": news.recent(n)}


@app.get("/api/results")
def results():
    return {"results": list(_RESULTS.values()), "schedule": _schedule_list(), "count": len(_RESULTS)}


def normalize_team_name(name: str | None) -> str | None:
    if not name:
        return None
    name_clean = name.strip().lower()
    for t in VALID_TEAMS:
        if t.lower() == name_clean:
            return t
    return None


@app.post("/api/vote")
def vote(req: VoteReq, request: Request):
    t1 = normalize_team_name(req.team1)
    t2 = normalize_team_name(req.team2)
    if not t1 or not t2:
        raise HTTPException(400, "Both teams must be valid participating World Cup teams.")
    if t1 == t2:
        raise HTTPException(400, "Pick two different teams.")
    
    ip = _client_ip(request)

    voted, rem_secs = db.has_voted_recently(ip)
    if voted:
        h = rem_secs // 3600
        m = (rem_secs % 3600) // 60
        raise HTTPException(
            status_code=429,
            detail=f"You have already voted in the last 12 hours from this IP. Next vote available in {h}h {m}m."
        )

    ch = normalize_team_name(req.champion) if req.champion else None
    # Resolve a collision-free name and insert atomically (no two concurrent voters get the same name).
    vote_id, resolved_name = db.add_vote_unique(
        t1, t2, ch, req.payload, requested_name=req.name, ip_address=ip,
        referrer_vote_id=req.referrer_vote_id)

    return {
        "ok": True,
        "vote_id": vote_id,
        "name": resolved_name,
        "votes": db.vote_summary(VALID_TEAMS)
    }


@app.get("/api/vote/shared/{vote_id}")
def vote_shared(vote_id: int):
    data = db.get_shared_vote_details(vote_id)
    if not data:
        raise HTTPException(404, "Shared vote not found.")
    return data


@app.get("/api/votes")
def votes():
    return db.vote_summary(VALID_TEAMS)


# Short referral links: /s/<base62(vote_id)> -> /play?ref=<vote_id>. Keeps shared URLs tiny for
# story/QR sharing. The alphabet here MUST match the frontend encoder in lib/share.ts.
_B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"


def _b62_decode(s: str) -> int | None:
    n = 0
    for ch in s:
        i = _B62.find(ch)
        if i < 0:
            return None
        n = n * 62 + i
    return n


@app.get("/s/{code}")
def short_ref(code: str):
    vid = _b62_decode(code)
    target = f"/play?ref={vid}" if (vid and vid > 0) else "/play"
    return RedirectResponse(url=target, status_code=302)


# ---- Admin: finalised official results (continual learning) ----
class LoginReq(BaseModel):
    username: str
    password: str


def _require_admin(token: str):
    if not ADMIN_TOKEN or token != ADMIN_TOKEN:
        raise HTTPException(403, "Admin token required.")


@app.post("/api/admin/login")
def admin_login(req: LoginReq, request: Request):
    ip = _client_ip(request)
    if _login_rate_limited(ip):
        raise HTTPException(429, "Too many login attempts. Please wait a few minutes and try again.")
    if db.verify_admin(req.username, req.password):
        # Return the server-side ADMIN_TOKEN so the client can use it for subsequent calls
        return {"ok": True, "token": ADMIN_TOKEN, "username": req.username}
    raise HTTPException(401, "Invalid credentials.")


@app.post("/api/admin/result")
def admin_result(req: ResultReq, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    home = normalize_team_name(req.home_team)
    away = normalize_team_name(req.away_team)
    if not home or not away:
        raise HTTPException(400, "Both teams must be valid World Cup teams.")
    if req.home_goals < 0 or req.away_goals < 0:
        raise HTTPException(400, "Scores must be non-negative.")
    winner = normalize_team_name(req.winner_team) if req.winner_team else None
    db.upsert_official_result(req.match_id, req.stage, home, away,
                              req.home_goals, req.away_goals, req.locked, winner_team=winner)
    _load_results()
    news.invalidate()               # refresh live news + freeze the now-finalised match's card
    get_payload({}, MC_BASE_SIMS)   # re-warm base payload with the new result baked in
    _bump_seo()                     # champion may have changed → refresh served SEO + sitemap
    return {"ok": True, "count": len(_RESULTS), "generation": _GEN}


@app.delete("/api/admin/result/{match_id}")
def admin_delete_result(match_id: int, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    db.delete_official_result(match_id)
    _load_results()
    news.invalidate()               # un-freeze the match's card + refresh the live rail
    get_payload({}, MC_BASE_SIMS)
    _bump_seo()
    return {"ok": True, "count": len(_RESULTS), "generation": _GEN}


@app.post("/api/admin/schedule")
def admin_schedule(req: ScheduleReq, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    date = (req.date_utc or "").strip()
    if not date:
        raise HTTPException(400, "A date is required.")
    db.upsert_schedule(req.match_id, date)
    _load_schedule()
    _bump_seo()                     # schedule change → bump "last updated" for SEO/sitemap
    return {"ok": True, "schedule": _schedule_list()}


@app.delete("/api/admin/schedule/{match_id}")
def admin_delete_schedule(match_id: int, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    db.delete_schedule(match_id)
    _load_schedule()
    _bump_seo()
    return {"ok": True, "schedule": _schedule_list()}


@app.post("/api/admin/vote_inject")
def admin_inject_vote(req: VoteReq, count: int = 1, x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    t1 = normalize_team_name(req.team1) or ""
    t2 = normalize_team_name(req.team2) or ""
    ch = normalize_team_name(req.champion) if req.champion else None
    for _ in range(count):
        db.add_vote(t1, t2, ch, req.payload)
    return db.vote_summary(VALID_TEAMS)


@app.delete("/api/admin/votes/clear")
def admin_clear_votes(x_admin_token: str = Header(default="")):
    _require_admin(x_admin_token)
    deleted = db.clear_all_votes()
    return {"ok": True, "deleted": deleted}


# ---------------------------------------------------------------------------
# Dynamic sitemap — `lastmod` tracks the latest admin update so crawlers re-fetch after a change.
# Declared before the SPA catch-all so it wins over any static dist/sitemap.xml.
# ---------------------------------------------------------------------------
@app.api_route("/sitemap.xml", methods=["GET", "HEAD"])
def sitemap():
    base = f"https://{PUBLIC_DOMAIN}"
    lastmod = _LAST_MODIFIED.strftime("%Y-%m-%d")
    pages = [("/", "daily", "1.0"), ("/predictions", "daily", "0.9"), ("/play", "weekly", "0.8"),
             ("/methodology", "monthly", "0.5"), ("/privacy", "yearly", "0.3"),
             ("/terms", "yearly", "0.3"), ("/disclaimer", "yearly", "0.3")]
    items = "".join(
        f"\n  <url><loc>{base}{path}</loc><lastmod>{lastmod}</lastmod>"
        f"<changefreq>{cf}</changefreq><priority>{pr}</priority></url>"
        for path, cf, pr in pages)
    body = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + items + "\n</urlset>\n")
    return RawResponse(content=body, media_type="application/xml")


# ---------------------------------------------------------------------------
# Serve the built frontend (prod). In dev the Vite server proxies /api here.
# ---------------------------------------------------------------------------
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
    def spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(404)
        candidate = DIST / full_path
        if full_path and candidate.is_file() and candidate.name != "index.html":
            return FileResponse(candidate)
        # SPA routes (and the root) get the SEO-rendered index so crawlers see the current champion.
        return HTMLResponse(_render_index())
