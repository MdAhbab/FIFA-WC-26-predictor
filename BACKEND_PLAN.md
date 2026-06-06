# Backend + Product Plan - WC2026 Predictor web app

A separate (non-competition) product: a fast, ad-supported site where visitors build their own World Cup
bracket and vote on who will win. All predictions come from the real ML engine (the same one used for the
DataCamp notebook); nothing on screen is hardcoded/dummy data.

## Goals
1. Replace the frontend's fictional teams + toy JS model with the **real 48 teams and real ML predictions**.
2. A **light FastAPI + SQLite** backend that:
   - serves real predictions (group forecasts + a knockout pairwise-prediction matrix + title race),
   - recomputes predictions when the user applies **team bias** or **custom squads**,
   - serves the **player pool** per team for the squad selector,
   - stores a "**which 2 teams will win**" vote and the user's bracket, with no auth, replayable,
   - returns aggregated vote results for the homepage "fan board".
3. One **`run.py`** to launch everything; a detailed **README**.

## Architecture
```
Browser (React/Vite)  --/api-->  FastAPI (app/backend/server.py)
        |                              |- engine.py  (real ML engine: Elo + Poisson HGB + Dixon-Coles + EV)
        |                              |- datasets/  (cloned: matches, players, fixtures, market probs)
        |                              |- db.py -> wc26.db (SQLite: votes)
   client-side bracket derivation      |
   using REAL data from /api/bootstrap
```
- Dev: Vite dev server proxies `/api` to FastAPI (port 8000).
- Prod: `run.py` builds (or uses) `frontend/dist` and FastAPI serves it + `/api` on one port.

## Data flow / endpoints (all JSON)
- `GET  /api/bootstrap` -> `{ teams[], group_letters[], groups{}, pairwise{}, title_race[], meta{}, votes{} }`
  - `teams`: 48 real teams `{name, iso, elo, group}`.
  - `groups`: per group `{standings[], matches[]}` from the engine (real fixtures + predicted scores).
  - `pairwise`: `pairwise[home][away] = {homeGoals,awayGoals,winner,penalties,corners,yellows,reds}` for
    every directed pair, so the client derives knockouts instantly with REAL model output.
  - `title_race`: champion-probability board (softmax over effective Elo).
  - `meta`: `{champion, finalists, semis}` from the pure-model bracket.
  - `votes`: current aggregated fan vote.
- `POST /api/strength {team_bias?, squads?}` -> recomputes `{teams, groups, pairwise, title_race, meta}`
  under the chosen biases / squads (so player picks and bias change real predictions).
- `GET  /api/players/{team}` -> `[{player_id,name,position,rating}]` for the squad selector.
- `POST /api/vote {team1, team2, champion?, payload?}` -> stores the vote (+ optional full bracket), returns
  the updated aggregate.
- `GET  /api/votes` -> `{total, top:[{team,iso,count,pct}], updated}`.
- `GET  /api/health`.

## SQLite schema (db.py, stdlib sqlite3 - no ORM)
```
votes(id INTEGER PK, ts TEXT, team1 TEXT, team2 TEXT, champion TEXT, payload TEXT)
```
Aggregate fan board = count each team across team1/team2, rank desc.

## Frontend wiring (keep the existing UI, swap the data source)
- `lib/api.ts`: typed fetch helpers (`/api/...`, base configurable).
- `lib/data.ts`: becomes backend-driven - `bootstrap()` loads real teams/forecasts/pairwise; `predictMatch`
  becomes a real pairwise lookup; `getAllGroupForecasts` returns real forecasts; `teamChampionProbabilities`
  reads the real title race. A small loading gate ensures data is ready before pages render.
- `PicksContext`: unchanged bracket derivation, now fed real data; adds `team_bias` + `squads` (calls
  `/api/strength`, debounced) and a "submit/vote" action (`/api/vote`).
- `pages/Home.tsx`: real champion + real title race + the **fan vote widget** (pick 2 teams) and the
  aggregated results board.
- `pages/Play.tsx`: real groups/knockouts; a **Squad & Bias** panel (player selector + per-team bias).
- `components/AdSlot.tsx`: real Google AdSense wiring controlled by `VITE_ADSENSE_CLIENT` (placeholder when
  unset, so it is safe before approval).

## Corner cases handled
- Backend missing datasets -> engine Elo fallback (still serves a valid product).
- Stale `localStorage` picks referencing unknown teams -> reset.
- Vote spam -> light per-payload validation (must be 2 distinct real teams).
- Bias limited to 5 teams, level 1..5; squad autofill by position.
- CWD independence (engine resolves `datasets/` relative to its own file).
- CORS for dev; same-origin in prod.

## Run / deploy
- `python run.py` (installs nothing) -> builds frontend if needed, starts FastAPI on `:8000`, serves the app.
- README documents dev mode (two terminals), prod mode (one), AdSense setup, and data refresh.
