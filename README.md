# World Cup 2026 Predictor - Web App

A fast, ad-supported web app where visitors build their own 2026 World Cup bracket and vote on who will
lift the trophy. Every team, score, group table and knockout result is produced by the **real machine
learning engine** (the same Elo + Poisson model used for the DataCamp competition) - nothing on screen is
hardcoded. This is a standalone product, separate from the competition notebook.

> Predictions are for entertainment only - not betting advice.

---

## What it does
- **Real predictions everywhere** - 48 real qualified teams, real group forecasts, a full knockout
  bracket, and a champion, all from the ML engine.
- **Play it yourself** - rank the 12 groups, pick the Round of 32 and Round of 16 winners; the model
  finishes the quarter-finals, semis and final.
- **Tune the model** - bias up to 5 teams (+1..+5) and pick custom squads (the rest auto-fill by
  position); predictions recompute on the real engine.
- **Fan vote** - choose the two teams you think will win; the homepage shows the aggregated "people's
  bracket" from everyone's votes (stored in SQLite, no login, replayable).
- **Ad-ready** - Google AdSense slots wired in; safe placeholders until you add your client id.

---

## Architecture
```
frontend/   React 18 + Vite + Tailwind (shadcn/ui). Client-side bracket play, fed by the API.
backend/    FastAPI + SQLite.
  server.py   API + serves the built frontend in production
  engine.py   the real ML engine (Elo + HistGradientBoosting Poisson + Dixon-Coles + EV)
  datasets/   cloned data (matches, players, fixtures, market probs)
  db.py       SQLite votes (wc26.db, created on first run)
run.py      one-command launcher (builds frontend if needed, serves everything)
```
The frontend calls `/api/*`. In development Vite proxies `/api` to the backend; in production the backend
serves the built site and the API on one port (same origin).

---

## Quick start (production / one command)
Requirements: Python 3.11+ (with the backend deps) and, for the first build, Node 18+.

```bash
pip install -r backend/requirements.txt
python run.py
```
Open http://127.0.0.1:8000 . `run.py` builds `frontend/dist` automatically the first time, then FastAPI
serves the site and API together. Set `PORT=9000` to change the port; `NO_BROWSER=1` to not auto-open.
(For the production VM use `run_onVM.py`, which binds 0.0.0.0:8090 — see Deployment below.)

## Development (live reload, two terminals)
```bash
# terminal 1 - backend
cd backend
pip install -r requirements.txt
uvicorn server:app --reload --port 8000

# terminal 2 - frontend (Vite dev server, proxies /api to :8000)
cd frontend
npm install
npm run dev      # http://localhost:5173
```

---

## Enabling Google AdSense
Ad slots render a labelled placeholder until configured. To go live, create `app/frontend/.env`:
```
VITE_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX
VITE_AD_SLOT_LEADERBOARD=1234567890
VITE_AD_SLOT_RECTANGLE=2345678901
VITE_AD_SLOT_IN_ARTICLE=3456789012
```
Then rebuild (`npm run build` or `python run.py`). The AdSense loader script is injected automatically and
each `<AdSlot>` becomes a real responsive ad unit. Slots are clearly labelled and never overlap content,
to stay within AdSense policy. (Optionally set `VITE_API_BASE` if the API lives on a different origin.)

---

## API
| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/bootstrap` | teams, group forecasts, knockout pairwise matrix, **Monte-Carlo title race**, meta, votes, official results, session |
| POST | `/api/strength` | recompute predictions under `{team_bias, squads}` (cached; lighter sim) |
| GET  | `/api/players/{team}` | a team's selectable player pool |
| GET  | `/api/match?home=&away=` | per-match insight: win probabilities, predicted score, head-to-head, probable XIs, related news |
| GET  | `/api/news?n=8` | shuffled recent football-news rail (5–10 items) |
| GET  | `/api/results` | finalised official results applied so far |
| GET  | `/api/session` | anonymous session info (20-min idle TTL) + active-session count |
| POST | `/api/vote` | `{team1, team2, champion?, payload?}` -> stores a vote, returns the aggregate |
| GET  | `/api/votes` | aggregated fan vote |
| POST | `/api/admin/result` | (token-gated) record a finalised official result -> incremental Elo + locks the fixture |
| DELETE | `/api/admin/result/{match_id}` | (token-gated) remove a recorded result |
| GET  | `/api/health` | status, active sessions, results applied, cache size |

Interactive docs at `/docs`. Admin endpoints require the `x-admin-token` header matching
`WC_ADMIN_TOKEN` (writes are disabled until that env var is set).

---

## Production deployment (Docker / GCP VM)
For the live site (`fifaworldcup26predictor.ahbab.dev`) the app runs on its **own port (8090)** so it
never collides with the portfolio on the same VM. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

```bash
# Docker (frontend is built + model pre-trained inside the image)
docker compose up -d --build      # serves 127.0.0.1:8090, reverse-proxy the domain to it

# Or bare Python on the VM (no Docker)
python run_onVM.py                # binds 0.0.0.0:8090, builds frontend if needed
```

Ad-integration strategy: [`docs/AD_STRATEGY.md`](docs/AD_STRATEGY.md).

## Performance & scaling notes
- The goal model is **trained once and persisted** (`backend/model_cache/`, joblib). Subsequent
  restarts load it in milliseconds instead of retraining ~11k matches.
- The base prediction payload is **computed once at startup and cached**; identical requests are
  pure cache hits, so 20+ concurrent visitors are served from memory with no model inference.
- Champion / finalist / semi-final probabilities come from a **Monte-Carlo tournament simulation**
  (not an Elo softmax), which keeps the favourite's odds realistic instead of runaway-biased.
- Heavy recomputes (custom squads/bias) are bounded by a semaphore and use a lighter simulation.
- Tune with `WC_MC_SIMS`, `WC_MC_SIMS_TUNE`, `WC_MAX_COMPUTE` (see `backend/.env.example`).

## Continual learning (live results)
With `WC_ADMIN_TOKEN` set, POST finalised official scores to `/api/admin/result`. Each result applies
a lightweight **incremental Elo update** to both teams (no retrain), locks the completed fixture to its
real score, and refreshes every remaining probability.

## Refreshing predictions
The app reads from `backend/datasets/`. To refresh with newer data, replace the files there (same
column names) and restart — the model retrains once and re-caches (bump `MODEL_VERSION` in `engine.py`
to force a retrain if only the model code changed).

## Notes / limitations
- The interactive bracket uses a sensible qualifier pairing for a smooth game; the exact official FIFA
  slot wiring is used in the competition notebook. Teams, scores and the champion are the real model output.
- `wc26.db` (votes + official results) is created automatically; delete it to reset.
- The news rail ships with a curated WC-2026 seed; set `WC_NEWS_FEED` to an RSS/Atom URL to merge a
  live feed on top.
