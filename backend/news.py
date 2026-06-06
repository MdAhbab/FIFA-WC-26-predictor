"""Football-news service for the predictor.

Sources, combined and de-duplicated (best first):

1. **NewsAPI.org** (live). The key lives ONLY in the backend env (``WC_NEWS_API_KEY``); the browser
   never sees it — the frontend calls our ``/api/news`` and ``/api/match`` which proxy NewsAPI here.
   General World-Cup-2026 headlines power the "Recent Football News" rail; a per-team query powers the
   relevant news on each match card. Results are TTL-cached so we stay well under the daily quota.
2. **Optional RSS/Atom feed** (``WC_NEWS_FEED``), merged in if set — stdlib parsing, no extra deps.
3. A **curated WC-2026 seed** that ships with the app as a resilient fallback, so the rail and match
   cards always render even with no network / no key / a fetch error (important on a locked-down VM).

Finalised matches FREEZE: once an official result is recorded (admin), that match's card stops
fetching new headlines and serves the last snapshot — see ``for_match(..., finalized=True)``.
Recording or clearing a result calls ``invalidate()`` so the live sections refresh immediately.
"""
from __future__ import annotations
import json
import os
import random
import time
import urllib.request
from datetime import datetime, timezone
from threading import Lock
from urllib.parse import urlencode
from xml.etree import ElementTree as ET

API_KEY = os.environ.get("WC_NEWS_API_KEY", "").strip()
NEWSAPI_URL = "https://newsapi.org/v2/everything"
FEED_URL = os.environ.get("WC_NEWS_FEED", "").strip()
FEED_TTL = int(os.environ.get("WC_NEWS_TTL", "1800"))  # seconds
MATCH_TTL = int(os.environ.get("WC_NEWS_MATCH_TTL", str(FEED_TTL)))  # per-match cache
FIFA_SEARCH = "https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"

# Curated, evergreen WC-2026 storylines. `teams` powers per-match matching on the match page.
_SEED: list[dict] = [
    {"id": "s1", "title": "World Cup 2026 expands to 48 teams across 16 host cities",
     "summary": "The first 48-team men's World Cup runs across the USA, Canada and Mexico with 104 "
                "matches — the largest tournament in the competition's history.",
     "source": "Tournament desk", "teams": ["USA", "Canada", "Mexico"], "tag": "Tournament"},
    {"id": "s2", "title": "Spain arrive as model favourites — but the field is deep",
     "summary": "Carrying the highest current Elo, Spain top the predictor's board, yet our "
                "Monte-Carlo simulations still give them only around a one-in-five title shot.",
     "source": "Analysis", "teams": ["Spain"], "tag": "Analysis"},
    {"id": "s3", "title": "Argentina chase back-to-back crowns",
     "summary": "The reigning champions remain a heavyweight in every simulation, anchored by a "
                "settled spine and tournament know-how.",
     "source": "Analysis", "teams": ["Argentina"], "tag": "Analysis"},
    {"id": "s4", "title": "France's depth keeps them in the top tier of contenders",
     "summary": "Strength in every position keeps France among the handful of teams reaching the "
                "final four in the majority of model runs.",
     "source": "Analysis", "teams": ["France"], "tag": "Analysis"},
    {"id": "s5", "title": "Hosts USA, Mexico and Canada handed favourable group draws",
     "summary": "Home advantage and friendly kick-off venues give the three host nations a measurable "
                "lift in their opening fixtures.",
     "source": "Tournament desk", "teams": ["USA", "Mexico", "Canada"], "tag": "Hosts"},
    {"id": "s6", "title": "Brazil rebuild aims to end the wait for a sixth star",
     "summary": "A new generation looks to restore Brazil to the summit after recent quarter-final "
                "heartbreaks.",
     "source": "Analysis", "teams": ["Brazil"], "tag": "Analysis"},
    {"id": "s7", "title": "England seek to convert promise into silverware",
     "summary": "Perennial semi-final threats, England again rate as genuine dark-horse champions in "
                "the simulations.",
     "source": "Analysis", "teams": ["England"], "tag": "Analysis"},
    {"id": "s8", "title": "Morocco carry African hopes after historic run",
     "summary": "Building on a landmark semi-final, Morocco are the model's standout outsider to go "
                "deep again.",
     "source": "Analysis", "teams": ["Morocco"], "tag": "Analysis"},
    {"id": "s9", "title": "Portugal lean on a golden generation's final dance",
     "summary": "Experience and attacking firepower keep Portugal in the conversation for a deep run.",
     "source": "Analysis", "teams": ["Portugal"], "tag": "Analysis"},
    {"id": "s10", "title": "Netherlands and Germany headline a loaded European chasing pack",
     "summary": "Both sides rate as live quarter- and semi-final threats in the predictor's runs.",
     "source": "Analysis", "teams": ["Netherlands", "Germany"], "tag": "Analysis"},
    {"id": "s11", "title": "Expanded format means eight best third-placed teams advance",
     "summary": "With 12 groups of four, the eight strongest runners-up at third join the group "
                "winners and runners-up in a 32-team knockout round.",
     "source": "Tournament desk", "teams": [], "tag": "Format"},
    {"id": "s12", "title": "Colombia and Uruguay lead the South American challengers",
     "summary": "Beyond the favourites, CONMEBOL depth gives Colombia and Uruguay real knockout "
                "upside in the model.",
     "source": "Analysis", "teams": ["Colombia", "Uruguay"], "tag": "Analysis"},
    {"id": "s13", "title": "Japan and South Korea spearhead Asia's bid for the last 16",
     "summary": "Asia's standard-bearers are tipped to escape their groups in most simulations.",
     "source": "Analysis", "teams": ["Japan", "South Korea"], "tag": "Analysis"},
    {"id": "s14", "title": "How the predictor works: Elo + Poisson, simulated thousands of times",
     "summary": "Every probability on the site comes from a goal model run through a full-tournament "
                "Monte-Carlo, not a single deterministic bracket.",
     "source": "Methodology", "teams": [], "tag": "Methodology"},
]

_LOCK = Lock()
_cache: dict = {"ts": 0.0, "items": []}          # general "recent" rail cache
_match_cache: dict[frozenset, dict] = {}          # per-team-pair cache (live + frozen snapshots)


def _seed_items() -> list[dict]:
    today = datetime.now(timezone.utc).date().isoformat()
    out = []
    for s in _SEED:
        out.append({**s, "url": FIFA_SEARCH, "date": today, "live": False})
    return out


def _seed_for(home: str, away: str) -> list[dict]:
    """Curated seed items mentioning either team (resilient fallback for a match card)."""
    hit = [s for s in _seed_items() if home in s.get("teams", []) or away in s.get("teams", [])]
    return (hit or _seed_items())[:4]


def _dedup(items: list[dict]) -> list[dict]:
    seen, out = set(), []
    for it in items:
        key = (it.get("title") or "").strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(it)
    return out


def _fetch_newsapi(query: str, n: int = 8) -> list[dict]:
    """Best-effort NewsAPI.org `everything` query. Returns [] on any error (never raises to the
    request path), so a missing key / quota / network blip silently falls back to the seed."""
    if not API_KEY:
        return []
    params = urlencode({"q": query, "language": "en", "sortBy": "publishedAt",
                        "pageSize": max(1, min(n, 20)), "apiKey": API_KEY})
    try:
        req = urllib.request.Request(f"{NEWSAPI_URL}?{params}",
                                     headers={"User-Agent": "wc26-predictor/1.0"})
        with urllib.request.urlopen(req, timeout=6) as r:
            data = json.load(r)
        if data.get("status") != "ok":
            return []
        items = []
        for i, a in enumerate(data.get("articles", [])):
            title = (a.get("title") or "").strip()
            if not title or title == "[Removed]":
                continue
            items.append({
                "id": (a.get("url") or f"na{i}"),
                "title": title,
                "summary": (a.get("description") or "")[:240],
                "source": ((a.get("source") or {}).get("name") or "NewsAPI"),
                "url": a.get("url") or FIFA_SEARCH,
                "date": (a.get("publishedAt") or "")[:10] or datetime.now(timezone.utc).date().isoformat(),
                "teams": [], "tag": "News", "live": True,
            })
        return items
    except Exception:
        return []


def _fetch_feed() -> list[dict]:
    """Best-effort RSS/Atom fetch (optional extra source). Returns [] on any error."""
    if not FEED_URL:
        return []
    try:
        req = urllib.request.Request(FEED_URL, headers={"User-Agent": "wc26-predictor/1.0"})
        with urllib.request.urlopen(req, timeout=4) as r:
            raw = r.read()
        root = ET.fromstring(raw)
        items = []
        for i, it in enumerate(root.iter("item")):
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            desc = (it.findtext("description") or "").strip()
            date = (it.findtext("pubDate") or "").strip()
            if title:
                items.append({"id": f"live{i}", "title": title, "summary": desc[:240],
                              "source": "Live feed", "url": link or FIFA_SEARCH,
                              "date": date[:16] or datetime.now(timezone.utc).date().isoformat(),
                              "teams": [], "tag": "News", "live": True})
        return items[:12]
    except Exception:
        return []


def _all_items() -> list[dict]:
    """General WC-2026 headlines for the rail: NewsAPI + optional RSS, with the seed as a backstop."""
    now = time.time()
    with _LOCK:
        if now - _cache["ts"] < FEED_TTL and _cache["items"]:
            return list(_cache["items"])
    live = _dedup(_fetch_newsapi('"FIFA World Cup 2026" OR "World Cup 2026"', n=14) + _fetch_feed())
    items = live + _seed_items() if live else _seed_items()
    with _LOCK:
        _cache["ts"] = now
        _cache["items"] = items
    return list(items)


def recent(n: int = 8, shuffle: bool = True) -> list[dict]:
    """Return up to n recent items. Live NewsAPI headlines lead; the curated seed fills any gap."""
    items = _all_items()
    if shuffle:
        random.shuffle(items)
    n = max(5, min(n, 10))
    return items[:n]


def for_match(home: str, away: str, finalized: bool = False) -> list[dict]:
    """Relevant news for a single fixture (match-card rail).

    While the match is upcoming we query NewsAPI for the two teams (TTL-cached per pair). Once the
    match is FINALISED (an official result was recorded) we stop fetching and return the last live
    snapshot we captured (or the curated seed if we never fetched one) — so finished matches freeze.
    """
    key = frozenset((home, away))
    entry = _match_cache.get(key)

    if finalized:
        if entry and entry.get("items"):
            return entry["items"]
        return _seed_for(home, away)

    now = time.time()
    if entry and now - entry["ts"] < MATCH_TTL and entry.get("items"):
        return entry["items"]

    # Require a World-Cup context so a team name doesn't pull in unrelated (e.g. women's/club) stories.
    query = f'("{home}" OR "{away}") AND ("World Cup" OR "World Cup 2026")'
    live = _dedup(_fetch_newsapi(query, n=8))[:4]
    items = live or _seed_for(home, away)
    with _LOCK:
        _match_cache[key] = {"ts": now, "items": items}
    return items


def invalidate() -> None:
    """Drop the general-rail cache and any non-frozen per-match caches so the live sections refresh
    on the next request. Called whenever an official result is recorded or cleared by the admin."""
    with _LOCK:
        _cache["ts"] = 0.0
        _cache["items"] = []
        _match_cache.clear()
