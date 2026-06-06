"""
FIFA World Cup 2026 — final prediction engine + gamification resolver.

Pipeline
--------
1. Team strength: CURRENT Elo (+FIFA pts, form) per team, read from a feature-engineered
   historical match dataset (2014–2026). Falls back to a built-in Elo prior if absent.
2. Goal model (ML): sklearn HistGradientBoostingRegressor(loss='poisson') trained in
   "long" format (one row per team-per-match) to predict goals scored from
   [own/opp Elo, FIFA pts, form, attack/defence, home/neutral, world-cup]. Falls back to a
   calibrated Elo→goals curve if sklearn/data unavailable.
3. Dixon–Coles score matrix from (λ_home, λ_away) → EV optimiser that maximises EXPECTED
   competition points for each field independently (score / corners / cards).
4. resolve(UserConfig): merges user beliefs (squads, favourite, group tables, R32/R16 picks)
   with the model and fills every gap; QF→Final are always model-decided.
   resolve({}) == pure-model submission.

Outputs are in exact competition format (predicted_home_goals, …, winning_team / match_winner …).
"""
from __future__ import annotations
import json, re, warnings, hashlib
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import poisson
from scipy.optimize import linear_sum_assignment
warnings.filterwarnings('ignore')

try:
    from sklearn.ensemble import HistGradientBoostingRegressor
    import joblib
    _SKLEARN = True
except Exception:
    _SKLEARN = False

RNG = np.random.default_rng(42)

# Look in datasets/ first (consolidated), then data/ (competition canonical).
# Resolved relative to this file so the backend works regardless of the working directory.
_HERE = Path(__file__).resolve().parent
DATASETS = _HERE / 'datasets'
DATA = _HERE / 'data'
# Persisted artefacts (trained model) so the VM only pays the training cost once, ever.
CACHE_DIR = _HERE / 'model_cache'
MODEL_VERSION = 'hgb-poisson-v2'   # bump to invalidate the on-disk model cache

def _find(*names):
    for n in names:
        for base in (DATASETS, DATA, Path('.')):
            p = base / n
            if p.exists():
                return p
    return None

# ---------------------------------------------------------------------------
# Constants & name maps
# ---------------------------------------------------------------------------
HOSTS = {'USA', 'Mexico', 'Canada'}
MATCHDATA_NAME = {'USA': 'United States', 'Cabo Verde': 'Cape Verde'}   # competition -> match dataset
PLAYOFF_RESOLUTION = {
    'UEFA Playoff A': 'Bosnia and Herzegovina', 'UEFA Playoff B': 'Sweden',
    'UEFA Playoff C': 'Turkey', 'UEFA Playoff D': 'Czech Republic',
    'FIFA Playoff 1': 'DR Congo', 'FIFA Playoff 2': 'Iraq',
}
PRIOR_ELO = {
    'Spain': 2110, 'France': 2100, 'Argentina': 2085, 'Brazil': 2050, 'England': 2030,
    'Portugal': 2000, 'Netherlands': 1995, 'Germany': 1975, 'Belgium': 1955, 'Croatia': 1945,
    'Uruguay': 1935, 'Colombia': 1925, 'Morocco': 1900, 'Switzerland': 1875, 'Senegal': 1865,
    'Japan': 1860, 'USA': 1850, 'Austria': 1840, 'Mexico': 1840, 'Norway': 1830,
    'Ecuador': 1825, 'Turkey': 1815, 'South Korea': 1805, 'Sweden': 1800, 'Canada': 1795,
    'Egypt': 1790, 'Iran': 1785, "Côte d'Ivoire": 1785, 'Algeria': 1785, 'Scotland': 1780,
    'Australia': 1775, 'Czech Republic': 1775, 'Paraguay': 1760, 'Bosnia and Herzegovina': 1755,
    'DR Congo': 1745, 'Ghana': 1730, 'South Africa': 1725, 'Tunisia': 1720, 'Panama': 1700,
    'Saudi Arabia': 1695, 'Qatar': 1695, 'Uzbekistan': 1695, 'Cabo Verde': 1680, 'Iraq': 1680,
    'New Zealand': 1655, 'Jordan': 1650, 'Haiti': 1605, 'Curaçao': 1600,
}

# Dixon-Coles / EV constants
RHO = -0.03
MAXG = 10
MU_FALLBACK = 1.32
GAMMA_FALLBACK = 0.90

FEATURES = ['own_elo', 'opp_elo', 'elo_diff', 'own_fifa', 'opp_fifa',
            'own_form', 'opp_form', 'own_attack', 'opp_defence',
            'is_home', 'neutral', 'is_world_cup']

# ---------------------------------------------------------------------------
# 1. Fixtures
# ---------------------------------------------------------------------------
def load_fixtures():
    gf = pd.read_csv(_find('group_fixtures.csv'))
    ks = pd.read_csv(_find('knockout_slots.csv'))
    for col in ('home_team', 'away_team'):
        gf[col] = gf[col].replace(PLAYOFF_RESOLUTION)
    groups = {g: list(sub.home_team) + [t for t in sub.away_team if t not in list(sub.home_team)]
              for g, sub in gf.groupby('group')}
    # robust: collect the 4 teams of each group
    groups = {}
    for g, sub in gf.groupby('group'):
        ts = pd.unique(pd.concat([sub.home_team, sub.away_team]))
        groups[g] = list(ts)
    teams = sorted(set(gf.home_team) | set(gf.away_team))
    return gf, ks, groups, teams

# ---------------------------------------------------------------------------
# 2. Historical match data → team current state + goal model
# ---------------------------------------------------------------------------
def load_match_data():
    p = _find('international_matches.csv',
              'matches_with_elo_fifa_form_confed_exp_h2h.csv')
    if p is None:
        return None
    cols = ['date', 'home_team', 'away_team', 'home_score', 'away_score', 'neutral',
            'is_world_cup', 'home_elo_pre', 'away_elo_pre', 'home_elo_post', 'away_elo_post',
            'home_fifa_points_filled', 'away_fifa_points_filled',
            'home_form_points_per_match_last10', 'away_form_points_per_match_last10',
            'home_avg_goals_for_last10', 'home_avg_goals_against_last10',
            'away_avg_goals_for_last10', 'away_avg_goals_against_last10']
    df = pd.read_csv(p, usecols=lambda c: c in cols, low_memory=False)
    df['date'] = pd.to_datetime(df['date'], errors='coerce')
    return df.dropna(subset=['date', 'home_score', 'away_score']).sort_values('date')


def _matchname(team):
    return MATCHDATA_NAME.get(team, team)


def build_team_state(df, teams):
    """Latest known {elo, fifa, form, attack(gf), defence(ga)} per competition team."""
    # invert name map for lookup
    state = {}
    if df is not None:
        # Build per-team latest record by scanning home & away rows
        recs = {}
        for r in df.itertuples(index=False):
            for side in ('home', 'away'):
                name = getattr(r, f'{side}_team')
                elo = getattr(r, f'{side}_elo_post', np.nan)
                fifa = getattr(r, f'{side}_fifa_points_filled', np.nan)
                form = getattr(r, f'{side}_form_points_per_match_last10', np.nan)
                gf = getattr(r, f'{side}_avg_goals_for_last10', np.nan)
                ga = getattr(r, f'{side}_avg_goals_against_last10', np.nan)
                recs[name] = dict(elo=elo, fifa=fifa, form=form, gf=gf, ga=ga)  # last wins (sorted by date)
        for t in teams:
            mn = _matchname(t)
            rec = recs.get(mn)
            if rec and not np.isnan(rec['elo']):
                state[t] = rec
            else:
                state[t] = dict(elo=PRIOR_ELO.get(t, 1600), fifa=np.nan, form=np.nan, gf=np.nan, ga=np.nan)
    else:
        for t in teams:
            state[t] = dict(elo=PRIOR_ELO.get(t, 1600), fifa=np.nan, form=np.nan, gf=np.nan, ga=np.nan)
    # impute missing fifa/form/gf/ga with medians
    for key in ('fifa', 'form', 'gf', 'ga'):
        vals = [state[t][key] for t in teams if not (state[t][key] is None or np.isnan(state[t][key]))]
        med = float(np.median(vals)) if vals else (700 if key == 'fifa' else (1.4 if key in ('gf', 'ga') else 1.5))
        for t in teams:
            if state[t][key] is None or np.isnan(state[t][key]):
                state[t][key] = med
    return state


def build_training_xy(df):
    """Turn the historical matches into a long-format design matrix (X) and goal target (y):
    one row per team-per-match. This is the data the goal model is trained on."""
    rows, y = [], []
    for r in df.itertuples(index=False):
        for own, opp in (('home', 'away'), ('away', 'home')):
            oe = getattr(r, f'{own}_elo_pre', np.nan); pe = getattr(r, f'{opp}_elo_pre', np.nan)
            if np.isnan(oe) or np.isnan(pe):
                continue
            feat = [oe, pe, oe - pe,
                    getattr(r, f'{own}_fifa_points_filled', np.nan),
                    getattr(r, f'{opp}_fifa_points_filled', np.nan),
                    getattr(r, f'{own}_form_points_per_match_last10', np.nan),
                    getattr(r, f'{opp}_form_points_per_match_last10', np.nan),
                    getattr(r, f'{own}_avg_goals_for_last10', np.nan),
                    getattr(r, f'{opp}_avg_goals_against_last10', np.nan),
                    0 if bool(getattr(r, 'neutral', False)) else (1 if own == 'home' else 0),
                    1 if bool(getattr(r, 'neutral', False)) else 0,
                    int(bool(getattr(r, 'is_world_cup', 0)))]
            rows.append(feat)
            y.append(getattr(r, f'{own}_score'))
    return pd.DataFrame(rows, columns=FEATURES), np.asarray(y, dtype=float)


def _dataset_signature(df) -> str:
    """Cheap fingerprint of the training data so a stale on-disk model is detected & retrained."""
    n = len(df)
    last = str(df['date'].max()) if 'date' in df and n else ''
    return hashlib.md5(f'{MODEL_VERSION}|{n}|{last}'.encode()).hexdigest()[:16]


def train_goal_model(df, use_cache: bool = True):
    """Fit (or load) the Poisson gradient-boosted goal model.

    The fitted model is persisted to disk with joblib and keyed on a dataset fingerprint, so the
    resource-constrained VM only ever trains once per dataset version — every subsequent process
    start (and every worker/restart) loads the cached estimator in milliseconds instead of
    re-fitting on ~11k matches. Returns the fitted model (or None when sklearn/data is absent)."""
    if df is None or not _SKLEARN:
        return None
    sig = _dataset_signature(df)
    cache_file = CACHE_DIR / f'goal_model_{sig}.joblib'
    if use_cache and cache_file.exists():
        try:
            return joblib.load(cache_file)
        except Exception:
            pass  # corrupt/incompatible cache -> retrain below
    X, y = build_training_xy(df)
    model = HistGradientBoostingRegressor(loss='poisson', max_depth=4, learning_rate=0.06,
                                          max_iter=350, min_samples_leaf=40,
                                          l2_regularization=1.0, random_state=42)
    model.fit(X, y)
    if use_cache:
        try:
            CACHE_DIR.mkdir(exist_ok=True)
            for old in CACHE_DIR.glob('goal_model_*.joblib'):
                old.unlink()  # keep only the current fingerprint
            joblib.dump(model, cache_file)
        except Exception:
            pass
    return model

# ---------------------------------------------------------------------------
# 3. λ (expected goals) for a fixture
# ---------------------------------------------------------------------------
def fixture_context(home, away):
    host = (home in HOSTS) or (away in HOSTS)
    return (0 if host else 1, home in HOSTS, away in HOSTS)   # neutral, home_is_host, away_is_host


def _feat_row(own, opp, own_elo, opp_elo, state, is_home, neutral):
    return [own_elo, opp_elo, own_elo - opp_elo,
            state[own]['fifa'], state[opp]['fifa'],
            state[own]['form'], state[opp]['form'],
            state[own]['gf'], state[opp]['ga'],
            is_home, neutral, 1]


def lambdas(home, away, eff_ratings, state, model):
    neutral, h_host, a_host = fixture_context(home, away)
    eh, ea = eff_ratings[home], eff_ratings[away]
    if model is not None:
        Xh = pd.DataFrame([_feat_row(home, away, eh, ea, state, 1 if h_host else 0, neutral)], columns=FEATURES)
        Xa = pd.DataFrame([_feat_row(away, home, ea, eh, state, 1 if a_host else 0, neutral)], columns=FEATURES)
        lh = float(np.clip(model.predict(Xh)[0], 0.15, 6))
        la = float(np.clip(model.predict(Xa)[0], 0.15, 6))
    else:  # calibrated Elo fallback
        adj_h = eh + (60 if h_host else 0)
        adj_a = ea + (60 if a_host else 0)
        x = (adj_h - adj_a) / 400.0
        lh = float(np.clip(MU_FALLBACK * np.exp(GAMMA_FALLBACK * x), 0.15, 6))
        la = float(np.clip(MU_FALLBACK * np.exp(-GAMMA_FALLBACK * x), 0.15, 6))
    return lh, la

# ---------------------------------------------------------------------------
# 4. Dixon–Coles + EV optimisers
# ---------------------------------------------------------------------------
def _dc_tau(i, j, lh, la, rho):
    if i == 0 and j == 0: return 1 - lh * la * rho
    if i == 0 and j == 1: return 1 + lh * rho
    if i == 1 and j == 0: return 1 + la * rho
    if i == 1 and j == 1: return 1 - rho
    return 1.0

def score_matrix(lh, la, rho=RHO, maxg=MAXG):
    ph = poisson.pmf(np.arange(maxg + 1), lh)
    pa = poisson.pmf(np.arange(maxg + 1), la)
    M = np.outer(ph, pa)
    for i in (0, 1):
        for j in (0, 1):
            M[i, j] *= _dc_tau(i, j, lh, la, rho)
    return M / M.sum()

def after_et_matrix(lh, la, et_frac=0.33, maxg=MAXG):
    A = score_matrix(lh, la, maxg=maxg)
    n = A.shape[0]
    eh = poisson.pmf(np.arange(n), lh * et_frac)
    ea = poisson.pmf(np.arange(n), la * et_frac)
    for k in range(n):
        m = A[k, k]
        if m <= 0: continue
        A[k, k] = 0.0
        for dh in range(n - k):
            for da in range(n - k):
                A[k + dh, k + da] += m * eh[dh] * ea[da]
    return A / A.sum()

def outcome_probs(M):
    return float(np.tril(M, -1).sum()), float(np.trace(M)), float(np.triu(M, 1).sum())

def _mass(M):
    n = M.shape[0]; gd, tot = {}, {}
    for a in range(n):
        for b in range(n):
            gd[a - b] = gd.get(a - b, 0.0) + M[a, b]
            tot[a + b] = tot.get(a + b, 0.0) + M[a, b]
    return gd, tot

def best_scoreline(M):
    gd, tot = _mass(M); n = M.shape[0]
    best, bev = (1, 0), -1.0
    for a in range(n):
        for b in range(n):
            p = M[a, b]
            ev = 25 * p + 10 * (gd[a - b] - p) + 10 * (tot[a + b] - p)
            if ev > bev: bev, best = ev, (a, b)
    return best

def best_scoreline_constrained(M, outcome):
    gd, tot = _mass(M); n = M.shape[0]
    best, bev = None, -1.0
    for a in range(n):
        for b in range(n):
            if outcome == 'home' and a <= b: continue
            if outcome == 'away' and b <= a: continue
            if outcome == 'draw' and a != b: continue
            p = M[a, b]
            ev = 25 * p + 10 * (gd[a - b] - p) + 10 * (tot[a + b] - p)
            if ev > bev: bev, best = ev, (a, b)
    return best if best else best_scoreline(M)

def best_count(mu, kind, hi=25):
    pmf = poisson.pmf(np.arange(hi + 1), mu)
    best, bev = 0, -1.0
    for c in range(hi + 1):
        if kind == 'corners':
            win = pmf[max(0, c - 2):c + 3].sum(); ev = 10 * pmf[c] + 5 * (win - pmf[c])
        else:
            win = pmf[max(0, c - 1):c + 2].sum(); ev = 10 * pmf[c] + 5 * (win - pmf[c])
        if ev > bev: bev, best = ev, c
    return int(best)

def corners_mu(lh, la, knockout=False):
    return float(np.clip(9.6 + 0.5 * (lh + la - 2.6) + (0.6 if knockout else 0), 7.5, 12.5))

def yellow_mu(ph, pd_, pa, knockout=False):
    return float(np.clip((4.2 if knockout else 3.7) + 0.8 * (1 - abs(ph - pa)), 3.0, 6.0))

# ---------------------------------------------------------------------------
# 5. Squads → effective Elo (gamification strength layer)
# ---------------------------------------------------------------------------
K_SQUAD = 110
BIAS_PER_LEVEL = 8     # team_bias level 1..5 -> +8..+40 Elo (subtle nudge)
def load_squads():
    pj = _find('preset_squads.json'); presets = {}
    if pj:
        presets = json.load(open(pj, encoding='utf-8'))
    return presets

def load_player_pool():
    """Per-team selectable player pool (for the squad/player selector)."""
    p = _find('players.csv'); pool = {}
    if p:
        df = pd.read_csv(p, encoding='utf-8')
        for rec in df.to_dict('records'):
            pool.setdefault(rec['nation'], []).append(
                {'player_id': int(rec['player_id']), 'name': str(rec['name']),
                 'position': str(rec['position']), 'rating': int(rec['rating'])})
        for t in pool:
            pool[t].sort(key=lambda x: -x['rating'])
    return pool

# squad shape used when auto-completing a partially-chosen squad
_AUTOFILL_MIN = {'GK': 3, 'DEF': 8, 'MID': 8, 'FWD': 4}   # ~23-man squad

def autofill_squad(selected, pool_team, target=23):
    """Complete a partially chosen squad: keep the user's picks, then fill the rest with the
    best available players from the pool, respecting positional minimums (GK/DEF/MID/FWD)."""
    chosen = list(selected)
    taken = {p.get('player_id') for p in chosen if p.get('player_id') is not None}
    have = {'GK': 0, 'DEF': 0, 'MID': 0, 'FWD': 0}
    for p in chosen:
        have[p.get('position', 'MID')] = have.get(p.get('position', 'MID'), 0) + 1
    # 1) satisfy positional minimums with best available of each position
    for pos, mn in _AUTOFILL_MIN.items():
        for p in [a for a in pool_team if a['position'] == pos and a['player_id'] not in taken]:
            if have.get(pos, 0) >= mn or len(chosen) >= target:
                break
            chosen.append(p); taken.add(p['player_id']); have[pos] = have.get(pos, 0) + 1
    # 2) fill remaining slots with best available regardless of position
    for p in pool_team:
        if len(chosen) >= target:
            break
        if p['player_id'] not in taken:
            chosen.append(p); taken.add(p['player_id'])
    return chosen

def _squad_quality(players):
    if not players: return 75.0
    by = {'GK': [], 'DEF': [], 'MID': [], 'FWD': []}
    for p in players:
        by.get(p.get('position', 'MID'), by['MID']).append(p.get('rating', 75))
    for k in by: by[k].sort(reverse=True)
    xi_slots = {'GK': 1, 'DEF': 4, 'MID': 4, 'FWD': 2}
    xi, bench = [], []
    for k, n in xi_slots.items():
        xi += by[k][:n]; bench += by[k][n:]
    xm = sum(xi) / max(len(xi), 1); bm = sum(bench) / max(len(bench), 1) if bench else xm
    return 0.7 * xm + 0.3 * bm

def _baselines(presets):
    base = {t: _squad_quality(p) for t, p in presets.items()}
    vals = list(base.values()) or [75]
    mean = sum(vals) / len(vals)
    std = (sum((v - mean) ** 2 for v in vals) / max(len(vals) - 1, 1)) ** 0.5 or 1.0
    return base, mean, std

def make_effective_elo(state, presets, pool=None):
    pool = pool or {}
    base_q, q_mean, q_std = _baselines(presets)
    def effective_elo(team, cfg):
        elo = state[team]['elo']; delta = 0.0
        sq = cfg.get('squads', {}).get(team, {})
        mode = sq.get('mode', 'default')
        if mode != 'default' and presets:
            if mode == 'preset_current':
                players = presets.get(team, [])
            else:  # custom: user-picked players, auto-completed by position from the pool
                players = list(sq.get('selected_players', []))
                if sq.get('autofill_rest', True):
                    players = autofill_squad(players, pool.get(team, []))
                if not players:
                    players = presets.get(team, [])
            if players:
                q = _squad_quality(players)
                delta += max(-100, min(100, K_SQUAD * (q - base_q.get(team, q_mean)) / max(q_std, 1.0)))
        # graduated multi-team bias: {team: level 1..5} -> +8..+40 Elo (subtle)
        lvl = cfg.get('team_bias', {}).get(team)
        if lvl:
            delta += BIAS_PER_LEVEL * max(1, min(5, int(lvl)))
        # legacy single-favourite boost (kept for backward compatibility)
        if cfg.get('favourite_team') == team:
            delta += cfg.get('favourite_boost_elo', 30)
        return elo + max(-130, min(130, delta))
    return effective_elo

# ---------------------------------------------------------------------------
# 6. Standings, best-thirds, slot resolution
# ---------------------------------------------------------------------------
def deterministic_standings(group_teams, group_df, eff, state, model, lam=None):
    """Order a group's 4 teams by expected points (continuous, no ties)."""
    pts = {t: 0.0 for t in group_teams}; gdv = {t: 0.0 for t in group_teams}
    sub = group_df[group_df.home_team.isin(group_teams) & group_df.away_team.isin(group_teams)]
    for r in sub.itertuples(index=False):
        lh, la = lam[r.home_team][r.away_team] if lam else lambdas(r.home_team, r.away_team, eff, state, model)
        ph, pd_, pa = outcome_probs(score_matrix(lh, la))
        pts[r.home_team] += 3 * ph + pd_; pts[r.away_team] += 3 * pa + pd_
        gdv[r.home_team] += lh - la; gdv[r.away_team] += la - lh
    return sorted(group_teams, key=lambda t: (pts[t], gdv[t]), reverse=True)

def parse_third_groups(slot):
    m = re.search(r'Groups?\s+([A-L/]+)', str(slot))
    return set(m.group(1).split('/')) if m else set()

def allocate_best_thirds(qual_thirds, third_slots):
    n = len(third_slots); BIG = 1e6
    cost = np.full((n, n), BIG)
    for i, (_mid, allowed) in enumerate(third_slots):
        for j, (grp, _team) in enumerate(qual_thirds):
            if grp in allowed: cost[i, j] = 0
    ri, cj = linear_sum_assignment(cost)
    return {third_slots[i][0]: qual_thirds[j][1] for i, j in zip(ri, cj)}

# ---------------------------------------------------------------------------
# 7. resolve(UserConfig) — the gamification core
# ---------------------------------------------------------------------------
USER_EDITABLE_KO = set(range(73, 97))   # R32 (73-88) + R16 (89-96)

def make_resolver(group_df, knock_df, groups, state, model, effective_elo, ratings):
    third_slots = [(int(r.match_id), parse_third_groups(r.slot_away))
                   for r in knock_df.itertuples(index=False) if 'Best 3rd' in str(r.slot_away)]

    def resolve(user_config=None):
        cfg = user_config or {}
        warns = []
        eff = {t: effective_elo(t, cfg) for t in ratings}
        lam = build_lambda_matrix(list(ratings), eff, state, model)   # one batched inference
        score_mode = cfg.get('options', {}).get('score_mode', 'max_ev')

        manual_orders = {g.upper(): c['order'] for g, c in cfg.get('groups', {}).items()
                         if c.get('mode') == 'manual' and c.get('order')}

        # ---- group predictions (72) ----
        gp = group_df.copy()
        hg_, ag_, cor_, yel_, red_, win_ = [], [], [], [], [], []
        for r in group_df.itertuples(index=False):
            lh, la = lam[r.home_team][r.away_team]
            M = score_matrix(lh, la); ph, pd_, pa = outcome_probs(M)
            grp = r.group
            if grp in manual_orders:
                o = manual_orders[grp]
                hr = o.index(r.home_team) if r.home_team in o else 9
                ar = o.index(r.away_team) if r.away_team in o else 9
                wt = 'home' if hr < ar else 'away' if ar < hr else ('home' if ph >= max(pd_, pa) else 'away' if pa >= pd_ else 'draw')
            else:
                wt = 'home' if ph >= max(pd_, pa) else 'away' if pa >= pd_ else 'draw'
            if (grp in manual_orders or score_mode == 'coherent') and wt in ('home', 'away', 'draw'):
                a, b = best_scoreline_constrained(M, wt)
            else:
                a, b = best_scoreline(M)
            hg_.append(a); ag_.append(b); win_.append(wt)
            cor_.append(best_count(corners_mu(lh, la), 'corners'))
            yel_.append(best_count(yellow_mu(ph, pd_, pa), 'cards')); red_.append(0)
        gp['predicted_home_goals'] = hg_; gp['predicted_away_goals'] = ag_
        gp['corners'] = cor_; gp['yellow_cards'] = yel_; gp['red_cards'] = red_
        gp['winning_team'] = win_

        # ---- standings ----
        winners, runners, thirds = {}, {}, {}
        for g, gteams in groups.items():
            gc = cfg.get('groups', {}).get(g, {})
            if gc.get('mode') == 'manual' and gc.get('order') and set(gc['order']) == set(gteams):
                order = gc['order']
            else:
                if gc.get('mode') == 'manual':
                    warns.append(f'Group {g}: invalid manual order → using model')
                order = deterministic_standings(gteams, group_df, eff, state, model, lam)
            winners[g], runners[g], thirds[g] = order[0], order[1], order[2]

        # ---- best-8 thirds (rank by expected group points) ----
        def third_scalar(team, g):
            s = 0.0
            for opp in groups[g]:
                if opp == team: continue
                lh, la = lam[team][opp]
                ph, pd_, pa = outcome_probs(score_matrix(lh, la))
                s += 3 * ph + pd_
            return s
        ranked = sorted(thirds.items(), key=lambda kv: third_scalar(kv[1], kv[0]), reverse=True)
        qual = [(g, t) for g, t in ranked[:8]]
        third_assign = allocate_best_thirds(qual, third_slots)

        # ---- knockout cascade ----
        win_of, los_of = {}, {}
        def rslot(slot, mid):
            s = str(slot).strip()
            if s.startswith('Winner Group '): return winners[s.split()[-1]]
            if s.startswith('Runner-up Group '): return runners[s.split()[-1]]
            if 'Best 3rd' in s: return third_assign[mid]
            if s.startswith('Winner Match '): return win_of[int(s.split()[-1])]
            if s.startswith('Loser Match '): return los_of[int(s.split()[-1])]
            return s

        kp = knock_df.copy()
        ph_t, pa_t, hg2, ag2, cor2, yel2, red2, mw_, pen_ = [], [], [], [], [], [], [], [], []
        for r in knock_df.itertuples(index=False):
            mid = int(r.match_id)
            home = rslot(r.slot_home, mid)
            away = third_assign[mid] if 'Best 3rd' in str(r.slot_away) else rslot(r.slot_away, mid)
            lh, la = lam[home][away]
            Aet = after_et_matrix(lh, la); M90 = score_matrix(lh, la)
            ph, pd_, pa = outcome_probs(M90)
            pen_home = 1 / (1 + 10 ** (-(eff[home] - eff[away]) / 400))
            adv_home = ph + pd_ * pen_home
            ko = cfg.get('knockout', {}).get(str(mid), {})
            manual = (mid in USER_EDITABLE_KO and ko.get('mode') == 'manual')
            if manual:
                wt_name = ko.get('winner_team')
                ws = 'home' if (wt_name == home or ko.get('winner_slot') == 'home') else 'away'
                if wt_name and wt_name not in (home, away):
                    warns.append(f'Match {mid}: manual winner {wt_name!r} not in {home} vs {away} → using model')
                    ws = 'home' if adv_home >= 0.5 else 'away'
            else:
                ws = 'home' if adv_home >= 0.5 else 'away'
            winner = home if ws == 'home' else away
            loser = away if ws == 'home' else home
            win_of[mid], los_of[mid] = winner, loser
            if manual or score_mode == 'coherent':
                a, b = best_scoreline_constrained(Aet, ws)
            else:
                a, b = best_scoreline(Aet)
            ph_t.append(home); pa_t.append(away); hg2.append(a); ag2.append(b)
            cor2.append(best_count(corners_mu(lh, la, True), 'corners'))
            yel2.append(best_count(yellow_mu(ph, pd_, pa, True), 'cards')); red2.append(0)
            mw_.append(ws); pen_.append(bool(float(np.trace(Aet)) > 0.5))
        kp['predicted_home_team'] = ph_t; kp['predicted_away_team'] = pa_t
        kp['predicted_home_goals'] = hg2; kp['predicted_away_goals'] = ag2
        kp['corners'] = cor2; kp['yellow_cards'] = yel2; kp['red_cards'] = red2
        kp['match_winner'] = mw_; kp['penalties'] = pen_

        bracket = dict(champion=win_of.get(104, 'TBD'),
                       finalist_home=ph_t[-1] if ph_t else 'TBD',
                       finalist_away=pa_t[-1] if pa_t else 'TBD',
                       semis=[win_of.get(101, 'TBD'), win_of.get(102, 'TBD')],
                       winners=winners, runners=runners, win_of=win_of, warnings=warns)
        return gp, kp, bracket
    return resolve

# ---------------------------------------------------------------------------
# 7b. Monte-Carlo tournament simulation  →  realistic title-race probabilities
# ---------------------------------------------------------------------------
# Why this exists: a naive "softmax over Elo" massively over-weights the single strongest
# team (e.g. Spain) because it ignores the bracket — a favourite still has to survive ~7 knockout
# coin-flips, any of which it can lose. A Monte-Carlo simulation samples real scorelines from the
# model's expected goals and plays the whole tournament thousands of times, so champion odds reflect
# both team strength AND draw/variance. This is the industry-standard (FiveThirtyEight-style) method
# and yields well-calibrated probabilities instead of a runaway favourite.

def _third_slots_of(knock_df):
    return [(int(r.match_id), parse_third_groups(r.slot_away))
            for r in knock_df.itertuples(index=False) if 'Best 3rd' in str(r.slot_away)]


def build_lambda_matrix(teams, eff, state, model):
    """λ_home, λ_away for every ordered pair, reused for display + simulation + resolve.

    Vectorised: instead of ~2300 one-row ``model.predict`` calls (≈9s on the VM), we assemble a
    single design matrix of "goals scored by X vs Y" for every ordered pair and predict once
    (≈50ms). This is the single biggest inference-cost win and is what lets the box serve many
    concurrent users without the goal model becoming the bottleneck."""
    if model is None:
        return {h: {a: lambdas(h, a, eff, state, model) for a in teams if a != h} for h in teams}
    rows, idx = [], []
    for x in teams:
        for y in teams:
            if x == y:
                continue
            neutral = 0 if (x in HOSTS or y in HOSTS) else 1
            rows.append(_feat_row(x, y, eff[x], eff[y], state, 1 if x in HOSTS else 0, neutral))
            idx.append((x, y))
    preds = np.clip(model.predict(pd.DataFrame(rows, columns=FEATURES)), 0.15, 6)
    G = {pair: float(p) for pair, p in zip(idx, preds)}    # goals scored by pair[0] vs pair[1]
    return {h: {a: (G[(h, a)], G[(a, h)]) for a in teams if a != h} for h in teams}


def _rslot_sim(slot, mid, winners, runners, third_assign, win_of, los_of):
    s = str(slot).strip()
    if s.startswith('Winner Group '): return winners[s.split()[-1]]
    if s.startswith('Runner-up Group '): return runners[s.split()[-1]]
    if 'Best 3rd' in s: return third_assign[mid]
    if s.startswith('Winner Match '): return win_of[int(s.split()[-1])]
    if s.startswith('Loser Match '): return los_of.get(int(s.split()[-1]), 'TBD')
    return s


def simulate_tournament(lam, groups, knock_df, third_slots, rng, knock_rows=None):
    """Play one full tournament, sampling scorelines from Poisson(λ). Returns win_of/round sets."""
    winners, runners, thirds, third_metric = {}, {}, {}, {}
    for g, gteams in groups.items():
        pts = {t: 0 for t in gteams}; gd = {t: 0 for t in gteams}; gf = {t: 0 for t in gteams}
        n = len(gteams)
        for i in range(n):
            for j in range(i + 1, n):
                h, a = gteams[i], gteams[j]
                lh, la = lam[h][a]
                hg, ag = int(rng.poisson(lh)), int(rng.poisson(la))
                gf[h] += hg; gf[a] += ag; gd[h] += hg - ag; gd[a] += ag - hg
                if hg > ag: pts[h] += 3
                elif ag > hg: pts[a] += 3
                else: pts[h] += 1; pts[a] += 1
        order = sorted(gteams, key=lambda t: (pts[t], gd[t], gf[t], rng.random()), reverse=True)
        winners[g], runners[g], thirds[g] = order[0], order[1], order[2]
        t3 = order[2]; third_metric[g] = (pts[t3], gd[t3], gf[t3], rng.random())
    ranked = sorted(third_metric.items(), key=lambda kv: kv[1], reverse=True)
    qual = [(g, thirds[g]) for g, _ in ranked[:8]]
    third_assign = allocate_best_thirds(qual, third_slots)

    rows = knock_rows if knock_rows is not None else list(knock_df.itertuples(index=False))
    win_of, los_of = {}, {}
    reach = {}  # team -> furthest round code
    for r in rows:
        mid = int(r.match_id)
        home = _rslot_sim(r.slot_home, mid, winners, runners, third_assign, win_of, los_of)
        away = (third_assign[mid] if 'Best 3rd' in str(r.slot_away)
                else _rslot_sim(r.slot_away, mid, winners, runners, third_assign, win_of, los_of))
        lh, la = lam[home][away]
        hg, ag = int(rng.poisson(lh)), int(rng.poisson(la))
        if hg > ag: w, l = home, away
        elif ag > hg: w, l = away, home
        else:  # penalties: weight by attacking strength
            w, l = (home, away) if rng.random() < lh / (lh + la) else (away, home)
        win_of[mid], los_of[mid] = w, l
    return win_of, winners, runners


# Knockout match-id milestones (R32 73-88, R16 89-96, QF 97-100, SF 101-102, 3rd 103, Final 104)
_R32, _R16, _QF, _SF, _FINAL = range(73, 89), range(89, 97), range(97, 101), (101, 102), 104


def champion_probabilities(lam, groups, knock_df, n_sims=4000, seed=12345):
    """Run the Monte-Carlo and aggregate per-team round-reach + title probabilities."""
    third_slots = _third_slots_of(knock_df)
    knock_rows = list(knock_df.itertuples(index=False))
    rng = np.random.default_rng(seed)
    teams = list(lam.keys())
    champ = {t: 0 for t in teams}; final = {t: 0 for t in teams}
    semi = {t: 0 for t in teams}; qf = {t: 0 for t in teams}; r16 = {t: 0 for t in teams}
    for _ in range(n_sims):
        win_of, _w, _r = simulate_tournament(lam, groups, knock_df, third_slots, rng, knock_rows)
        for m in _R32:
            if m in win_of: r16[win_of[m]] += 1
        for m in _R16:
            if m in win_of: qf[win_of[m]] += 1
        for m in _QF:
            if m in win_of: semi[win_of[m]] += 1
        for m in _SF:
            if m in win_of: final[win_of[m]] += 1
        if _FINAL in win_of:
            champ[win_of[_FINAL]] += 1
    out = []
    for t in teams:
        out.append({'team': t,
                    'champion': champ[t] / n_sims, 'final': final[t] / n_sims,
                    'semi': semi[t] / n_sims, 'quarter': qf[t] / n_sims, 'r16': r16[t] / n_sims})
    out.sort(key=lambda d: -d['champion'])
    return out


# ---------------------------------------------------------------------------
# 7c. Incremental / continual learning — Elo update from finalised official results
# ---------------------------------------------------------------------------
# When an official FIFA result lands we do NOT retrain the gradient booster (too heavy for the VM).
# Instead we apply a single, principled World-Football-Elo update to both teams. This is genuine
# lightweight online learning: every future fixture's expected goals shift because λ depends on
# effective Elo, so predictions improve continuously as real results arrive — for a few microseconds
# of compute per match instead of a multi-second refit.

def elo_update(state, home, away, home_goals, away_goals, k=40, home_adv=55):
    if home not in state or away not in state:
        return
    Rh, Ra = state[home]['elo'], state[away]['elo']
    Eh = 1.0 / (1.0 + 10 ** (-((Rh + home_adv) - Ra) / 400.0))
    if home_goals > away_goals: Sh = 1.0
    elif away_goals > home_goals: Sh = 0.0
    else: Sh = 0.5
    gd = abs(home_goals - away_goals)
    g = 1.0 if gd <= 1 else (1.5 if gd == 2 else (11 + gd) / 8.0)   # WF-Elo goal weighting
    kk = k * g
    state[home]['elo'] = Rh + kk * (Sh - Eh)
    state[away]['elo'] = Ra + kk * ((1 - Sh) - (1 - Eh))
    # nudge rolling goal averages so the goal model's form features track reality too
    for side, gf_, ga_ in ((home, home_goals, away_goals), (away, away_goals, home_goals)):
        state[side]['gf'] = 0.8 * state[side]['gf'] + 0.2 * gf_
        state[side]['ga'] = 0.8 * state[side]['ga'] + 0.2 * ga_


# ---------------------------------------------------------------------------
# 7d. Match-insight helpers (head-to-head history + probable line-ups)
# ---------------------------------------------------------------------------
def head_to_head(mdf, home, away, n=6):
    """Historical record between two competition teams (maps to dataset names first)."""
    empty = {'played': 0, 'home_wins': 0, 'away_wins': 0, 'draws': 0,
             'home_goals': 0, 'away_goals': 0, 'recent': []}
    if mdf is None:
        return empty
    mh, ma = _matchname(home), _matchname(away)
    sub = mdf[((mdf.home_team == mh) & (mdf.away_team == ma)) |
              ((mdf.home_team == ma) & (mdf.away_team == mh))]
    if sub.empty:
        return empty
    hw = aw = dr = hg = ag = 0
    recent = []
    for r in sub.sort_values('date').itertuples(index=False):
        # normalise so goals are reported from `home`'s perspective
        if r.home_team == mh:
            g_h, g_a = int(r.home_score), int(r.away_score)
        else:
            g_h, g_a = int(r.away_score), int(r.home_score)
        hg += g_h; ag += g_a
        if g_h > g_a: hw += 1
        elif g_a > g_h: aw += 1
        else: dr += 1
        recent.append({'date': str(r.date)[:10], 'home': home, 'away': away,
                       'home_goals': g_h, 'away_goals': g_a})
    recent = recent[-n:][::-1]
    return {'played': hw + aw + dr, 'home_wins': hw, 'away_wins': aw, 'draws': dr,
            'home_goals': hg, 'away_goals': ag, 'recent': recent}


# 4-3-3 outfield shape for a "probable XI" sketch from the strongest available squad.
_XI_SHAPE = [('GK', 1), ('DEF', 4), ('MID', 3), ('FWD', 3)]


def _pid(p):
    return p.get('player_id', p.get('name'))


def probable_xi(team, presets, pool):
    """A probable 4-3-3 sketch from the strongest available players.

    Merges the named-squad preset with the broader player pool (some nations have only a thin
    preset). Every formation slot is filled with the best available player of that position; if the
    dataset is too thin for a nation, remaining slots are clearly marked '—' rather than inventing
    players, so the XI always renders as a complete shape without fabricating identities."""
    merged = {}
    for src in (presets.get(team) or [], pool.get(team) or []):
        for p in src:
            merged.setdefault(_pid(p), p)
    players = list(merged.values())
    by = {'GK': [], 'DEF': [], 'MID': [], 'FWD': []}
    for p in players:
        by.get(p.get('position', 'MID'), by['MID']).append(p)
    for k in by:
        by[k].sort(key=lambda x: -x.get('rating', 0))

    xi, used, partial = [], set(), False
    leftovers = lambda: sorted((p for p in players if _pid(p) not in used),
                               key=lambda x: -x.get('rating', 0))
    for pos, n in _XI_SHAPE:
        avail = [p for p in by[pos] if _pid(p) not in used]
        for i in range(n):
            if i < len(avail):
                p = avail[i]; used.add(_pid(p))
                xi.append({'name': p.get('name', '—'), 'position': pos,
                           'rating': int(p.get('rating', 0))})
            else:
                rest = leftovers()                      # try any other real player first
                if rest:
                    p = rest[0]; used.add(_pid(p))
                    xi.append({'name': p.get('name', '—'), 'position': pos,
                               'rating': int(p.get('rating', 0))})
                else:
                    partial = True
                    xi.append({'name': '—', 'position': pos, 'rating': 0})
    formation = '-'.join(str(n) for _pos, n in _XI_SHAPE[1:])  # e.g. 4-3-3
    return {'formation': formation, 'players': xi, 'partial': partial}


# ---------------------------------------------------------------------------
# 8. Build everything
# ---------------------------------------------------------------------------
def build():
    group_df, knock_df, groups, teams = load_fixtures()
    mdf = load_match_data()
    state = build_team_state(mdf, teams)
    model = train_goal_model(mdf)
    presets = load_squads()
    pool = load_player_pool()
    ratings = {t: state[t]['elo'] for t in teams}
    eff_fn = make_effective_elo(state, presets, pool)
    resolve = make_resolver(group_df, knock_df, groups, state, model, eff_fn, ratings)
    return dict(group_df=group_df, knock_df=knock_df, groups=groups, teams=teams,
                state=state, model=model, presets=presets, pool=pool, ratings=ratings,
                mdf=mdf, effective_elo=eff_fn, resolve=resolve)

# ---------------------------------------------------------------------------
# 9. Backtest on World Cup 2022 (validate with competition scoring)
# ---------------------------------------------------------------------------
def score_points(ph, pa, ah, aa):
    if ph == ah and pa == aa: s = 25
    elif (ph - pa) == (ah - aa): s = 10
    elif (ph + pa) == (ah + aa): s = 10
    else: s = 0
    return s

def backtest_wc2022(mdf, state_unused=None):
    if mdf is None or not _SKLEARN: return None
    cut = pd.Timestamp('2022-11-01')
    train = mdf[mdf.date < cut]
    test = mdf[(mdf.date >= cut) & (mdf.date < '2023-01-01') & (mdf.is_world_cup == 1)]
    if len(test) < 10: return None
    model = train_goal_model(train)
    # use the pre-match Elo/FIFA/form already stored on each test row (leak-free)
    tot_model = tot_base = 0; n = 0; win_hits = 0
    for r in test.itertuples(index=False):
        if np.isnan(getattr(r, 'home_elo_pre', np.nan)): continue
        feat_h = [r.home_elo_pre, r.away_elo_pre, r.home_elo_pre - r.away_elo_pre,
                  r.home_fifa_points_filled, r.away_fifa_points_filled,
                  r.home_form_points_per_match_last10, r.away_form_points_per_match_last10,
                  r.home_avg_goals_for_last10, r.away_avg_goals_against_last10, 0, 1, 1]
        feat_a = [r.away_elo_pre, r.home_elo_pre, r.away_elo_pre - r.home_elo_pre,
                  r.away_fifa_points_filled, r.home_fifa_points_filled,
                  r.away_form_points_per_match_last10, r.home_form_points_per_match_last10,
                  r.away_avg_goals_for_last10, r.home_avg_goals_against_last10, 0, 1, 1]
        lh = float(np.clip(model.predict(pd.DataFrame([feat_h], columns=FEATURES))[0], .15, 6))
        la = float(np.clip(model.predict(pd.DataFrame([feat_a], columns=FEATURES))[0], .15, 6))
        M = score_matrix(lh, la); a, b = best_scoreline(M)
        ph, pd_, pa = outcome_probs(M)
        wt = 'home' if ph >= max(pd_, pa) else 'away' if pa >= pd_ else 'draw'
        ah, aa = int(r.home_score), int(r.away_score)
        aw = 'home' if ah > aa else 'away' if aa > ah else 'draw'
        tot_model += score_points(a, b, ah, aa) + (40 if wt == aw else 0)
        tot_base += score_points(1, 0, ah, aa) + (40 if 'home' == aw else 0)
        win_hits += (wt == aw); n += 1
    return dict(n=n, model_pts=tot_model, base_pts=tot_base,
                model_per_match=tot_model / n, base_per_match=tot_base / n,
                winner_acc=win_hits / n)

# ---------------------------------------------------------------------------
if __name__ == '__main__':
    E = build()
    print(f"sklearn={_SKLEARN} | model={'ML(HGB-Poisson)' if E['model'] else 'Elo-fallback'} | teams={len(E['teams'])}")
    print('Top-10 current Elo:', sorted(((round(E['ratings'][t]), t) for t in E['teams']), reverse=True)[:10])

    gp, kp, bv = E['resolve']({})
    assert len(gp) == 72 and len(kp) == 32
    need_g = ['predicted_home_goals', 'predicted_away_goals', 'corners', 'yellow_cards', 'red_cards', 'winning_team']
    need_k = ['predicted_home_team', 'predicted_away_team', 'predicted_home_goals', 'predicted_away_goals',
              'corners', 'yellow_cards', 'red_cards', 'match_winner', 'penalties']
    assert gp[need_g].notna().all().all() and kp[need_k].notna().all().all()
    print('\nresolve({}) OK — 72 group + 32 KO, no NaN, competition format')
    print('Champion:', bv['champion'], '| Final:', bv['finalist_home'], 'vs', bv['finalist_away'])
    print('Group winners:', {g: bv['winners'][g] for g in sorted(bv['winners'])})
    print('Group score dist:', gp.assign(s=gp.predicted_home_goals.astype(str)+'-'+gp.predicted_away_goals.astype(str)).s.value_counts().to_dict())
    print('KO penalties True:', int(kp.penalties.sum()))

    # gamification smoke test: favourite + a manual group + a manual KO
    cfg = {'favourite_team': 'Morocco', 'favourite_boost_elo': 60,
           'groups': {'C': {'mode': 'manual', 'order': ['Morocco', 'Brazil', 'Scotland', 'Haiti']}},
           'knockout': {'73': {'mode': 'manual', 'winner_team': None}}}
    gp2, kp2, bv2 = E['resolve'](cfg)
    cwin = [bv2['winners']['C']]
    print('\nUser cfg (Morocco fav + win group C):  group C winner =', cwin, '| champion =', bv2['champion'])

    bt = backtest_wc2022(E['model'] if False else load_match_data())
    if bt:
        print(f"\nBacktest WC2022 ({bt['n']} matches): model {bt['model_per_match']:.1f} pts/match vs "
              f"baseline(1-0+home) {bt['base_per_match']:.1f} | winner acc {bt['winner_acc']*100:.0f}%")
