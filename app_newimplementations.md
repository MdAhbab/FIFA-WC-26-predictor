# App Audit & New Implementations Plan

_System audit of the WC2026 Predictor web app (`app/`). Findings are grouped by severity with a
concrete location, the evidence, and a recommended fix. This is a **plan to implement later** — the
items under "Already fixed in this pass" are done; everything else is proposed, not yet applied._

> Scope: the `app/` folder only (backend FastAPI + React frontend). The competition `notebook.ipynb`
> and root `*.py` are out of scope here and were handled separately (kept EV-optimal).

---

## Already fixed in this pass (shipped)

- **Draws are now coherent in the app.** `_group_forecasts` derives the displayed `winner` from the
  predicted scoreline, so a 1‑1 reads "Draw" and matches the standings table (which already awards a
  point per side). Verified: 0 incoherent group matches, 43 draws now shown.
- **Penalty shootouts are now coherent.** `_pairwise` returns a **level** scoreline (e.g. 1‑1) when a
  shootout is the likely outcome instead of a decisive score tagged "PENS". Frontend (`MatchPicker`,
  `Predictions`) shows "1‑1 → {team} win on penalties" and treats any level KO score as a shootout,
  so user goal-stepper edits to a draw stay coherent. Verified: 0 incoherent pairwise penalties.
- **Real news via NewsAPI**, proxied server-side; the **key is never exposed to the browser**
  (`WC_NEWS_API_KEY` in gitignored `backend/.env`, loaded by a stdlib `.env` loader). Curated seed
  remains a fallback so the app never breaks on a missing key / quota / network error.
- **Per-match relevant news** on match cards, **match-id badges** on the cards (group rows, KO cards,
  detail dialog), **auto-refresh on admin updates** (`news.invalidate()`), and **news freezes for
  finalized matches** (`for_match(..., finalized=True)` serves the last snapshot; dialog shows
  "FINAL · news frozen").

---

## High severity

### H1 — Admin auth defaults are unsafe in production
- **Where:** `backend/server.py` (`ADMIN_TOKEN = os.environ.get("WC_ADMIN_TOKEN", "dev_admin_token")`,
  `admin_login` returns the token to the client), `backend/db.py` (seeds `ahbab` / `ahbab123`).
- **Issue:** If `WC_ADMIN_TOKEN` is unset, every admin endpoint accepts the well-known default
  `dev_admin_token`; combined with the weak seeded password this means the `/admin` dashboard
  (clear votes, inject votes, post official results that drive continual learning) is effectively
  open. The login endpoint also hands the raw server token to the browser.
- **Fix:**
  1. Refuse to start (or hard-disable admin writes) when `WC_ADMIN_TOKEN` is the default in prod.
  2. Force a strong admin password on first run; remove the hard-coded `ahbab123` default or require
     a `WC_ADMIN_PASSWORD` env on seed.
  3. Rate-limit `/api/admin/login` (e.g. 5/min/IP) and add a small lockout to blunt brute force.
  4. Prefer an HttpOnly session cookie for admin instead of returning the bearer token to JS.

### H2 — IP rate-limit is bypassable and over-blocks
- **Where:** `backend/server.py` `vote()` (parses `X-Forwarded-For`), `backend/db.py`
  `has_voted_recently()`.
- **Issue:** `X-Forwarded-For` is client-controlled when not behind a trusted proxy, so the 12‑hour
  limit is trivially bypassed by spoofing the header; conversely, users behind shared NAT / mobile
  carriers share an IP and wrongly block each other.
- **Fix:** Only trust `X-Forwarded-For` when the immediate peer is a known proxy (configurable trusted
  hop count). Combine the IP check with the existing anonymous session cookie (`wcsid`) so the limit
  is per-session-or-IP, and treat the header as advisory.

---

## Medium severity

### M1 — Client knockout bracket ignores official KO results
- **Where:** `frontend/src/app/lib/PicksContext.tsx` (`deriveBracket` / `makeKO`) vs
  `backend/server.py` `build_payload` (`meta` is official-aware via `resolve(..., official_results)`).
- **Issue:** The R32→Final cards are derived **client-side** from the `pairwise` (all-pairs,
  hypothetical) table + user picks. Group official results flow in via `effectiveStandings`, but a
  finalized **knockout** upset is only reflected in `meta` (champion/finalists), not in the bracket
  cards. After an admin records a KO result, the bracket can disagree with the headline champion.
- **Fix:** Serve the resolved `knockout_predictions` (with `official_results` applied) from the
  backend and have the client prefer official results per match id, falling back to its pairwise
  derivation for not-yet-played matches.

### M2 — App engine `backtest_wc2022` uses wrong (uncompressed) features
- **Where:** `backend/engine.py` `backtest_wc2022` builds `feat_h/feat_a` with **raw** FIFA points,
  raw form and raw goal columns where `FEATURES` expects tanh-**compressed diffs** (see
  `build_training_xy` / `_feat_row`).
- **Issue:** The backtest feeds the model out-of-distribution inputs, so its reported score is
  meaningless. Not used in serving, but misleading for validation. (The competition engine
  `wc2026_engine.py` already does this correctly — port that version.)
- **Fix:** Replace the raw feature rows with the compressed-diff construction used in training.

### M3 — Engine feature scales diverge from the notebook
- **Where:** `backend/engine.py` (`ELO_COMPRESS_SCALE=300`, `FIFA_COMPRESS_SCALE=500`) vs
  `wc2026_engine.py` (`400` / `400`).
- **Issue:** The app and the competition model produce different λ for the same fixture. If that is
  intentional (app tuned separately) it should be documented; if not, reconcile so the app mirrors
  the submission. Note the on-disk model cache key (`MODEL_VERSION`) must change whenever scales do.
- **Fix:** Decide on one source of truth; document the divergence in `engine.py` and bump
  `MODEL_VERSION` if scales change.

### M4 — `make_unique_name` has a concurrency race
- **Where:** `backend/db.py` `make_unique_name()`.
- **Issue:** It reads all names then picks a suffix in Python; two simultaneous votes can resolve to
  the same name before either is inserted. Also O(n) per call (loads every name).
- **Fix:** Add a `UNIQUE` index on `name` (case-insensitive collation) and insert-with-retry, or
  resolve the suffix inside the same transaction as the insert.

---

## Low severity / polish

### L1 — `predictMatch` accepts but ignores `allowDraw`
- **Where:** `frontend/src/app/lib/data.ts`. Harmless today (the backend `pairwise` never returns a
  draw winner), but the dead parameter is misleading. Remove it, or implement it as a defensive
  draw→advancer resolution for robustness if the data contract ever changes.

### L2 — Per-match news cache is unbounded
- **Where:** `backend/news.py` `_match_cache`. One entry per viewed team-pair; grows slowly but never
  evicts. Cap it (simple LRU / max size) to bound memory on a long-running process.

### L3 — Per-match news relevance is approximate
- **Where:** `backend/news.py` `for_match`. The boolean NewsAPI query (`"{home}" OR "{away}" AND
  "World Cup"`) can still surface tangential stories. Consider `qInTitle`, a relevancy sort, or a
  small allow-list of football outlets to tighten results. Seed fallback already covers gaps.

### L4 — Match-id badges could be mirrored in the admin panel
- **Where:** `frontend/src/app/pages/Admin.tsx`. The public cards now show `#id`; surfacing the same
  id next to the result form would make admin updates faster (the stated goal of the badges).

---

## Suggested implementation order
1. **H1, H2** (security) — before any public exposure.
2. **M1** (bracket vs official results) — user-visible correctness once results start landing.
3. **M2, M3** (model validation/consistency) — low risk, improves trust in numbers.
4. **M4, L1–L4** — hardening and polish.

_Estimated effort: H1/H2 ~half day; M1 ~half day; M2/M3/M4 a few hours each; L-items minor._
