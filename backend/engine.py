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
import json, re, warnings
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.stats import poisson
from scipy.optimize import linear_sum_assignment
warnings.filterwarnings('ignore')

try:
    from sklearn.ensemble import HistGradientBoostingRegressor
    _SKLEARN = True
except Exception:
    _SKLEARN = False

RNG = np.random.default_rng(42)

# Look in datasets/ first (consolidated), then data/ (competition canonical).
# Resolved relative to this file so the backend works regardless of the working directory.
_HERE = Path(__file__).resolve().parent
DATASETS = _HERE / 'datasets'
DATA = _HERE / 'data'

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


def train_goal_model(df):
    """Fit the Poisson gradient-boosted goal model. Returns the fitted model (or None)."""
    if df is None or not _SKLEARN:
        return None
    X, y = build_training_xy(df)
    model = HistGradientBoostingRegressor(loss='poisson', max_depth=4, learning_rate=0.06,
                                          max_iter=350, min_samples_leaf=40,
                                          l2_regularization=1.0, random_state=42)
    model.fit(X, y)
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
def deterministic_standings(group_teams, group_df, eff, state, model):
    """Order a group's 4 teams by expected points (continuous, no ties)."""
    pts = {t: 0.0 for t in group_teams}; gdv = {t: 0.0 for t in group_teams}
    sub = group_df[group_df.home_team.isin(group_teams) & group_df.away_team.isin(group_teams)]
    for r in sub.itertuples(index=False):
        lh, la = lambdas(r.home_team, r.away_team, eff, state, model)
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
        score_mode = cfg.get('options', {}).get('score_mode', 'max_ev')

        manual_orders = {g.upper(): c['order'] for g, c in cfg.get('groups', {}).items()
                         if c.get('mode') == 'manual' and c.get('order')}

        # ---- group predictions (72) ----
        gp = group_df.copy()
        hg_, ag_, cor_, yel_, red_, win_ = [], [], [], [], [], []
        for r in group_df.itertuples(index=False):
            lh, la = lambdas(r.home_team, r.away_team, eff, state, model)
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
                order = deterministic_standings(gteams, group_df, eff, state, model)
            winners[g], runners[g], thirds[g] = order[0], order[1], order[2]

        # ---- best-8 thirds (rank by expected group points) ----
        def third_scalar(team, g):
            s = 0.0
            for opp in groups[g]:
                if opp == team: continue
                lh, la = lambdas(team, opp, eff, state, model)
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
            lh, la = lambdas(home, away, eff, state, model)
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
                effective_elo=eff_fn, resolve=resolve)

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
