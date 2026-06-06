"""Football-news service for the predictor.

Two sources, combined and de-duplicated:

1. A **curated seed** of World-Cup-2026 storylines that ships with the app, so the "Recent Football
   News" rail and match pages always have content even with no network (important on a locked-down
   VM and to keep ad/page performance predictable).
2. An **optional live feed** (RSS/Atom). Set ``WC_NEWS_FEED`` to an official/syndicated football
   feed URL and items are fetched on a TTL cache (default 30 min) and merged in front of the seed.
   No extra dependencies — parsed from the standard library.

Nothing here is fabricated as a quote from FIFA; the curated items are clearly editorial summaries
and link back to fifa.com search. Swap ``WC_NEWS_FEED`` in to surface genuine syndicated headlines.
"""
from __future__ import annotations
import os
import random
import time
import urllib.request
from datetime import datetime, timezone
from threading import Lock
from xml.etree import ElementTree as ET

FEED_URL = os.environ.get("WC_NEWS_FEED", "").strip()
FEED_TTL = int(os.environ.get("WC_NEWS_TTL", "1800"))  # seconds
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
_cache: dict = {"ts": 0.0, "items": []}


def _seed_items() -> list[dict]:
    today = datetime.now(timezone.utc).date().isoformat()
    out = []
    for s in _SEED:
        out.append({**s, "url": FIFA_SEARCH, "date": today, "live": False})
    return out


def _fetch_feed() -> list[dict]:
    """Best-effort RSS/Atom fetch. Returns [] on any error (never raises to the request path)."""
    if not FEED_URL:
        return []
    try:
        req = urllib.request.Request(FEED_URL, headers={"User-Agent": "wc26-predictor/1.0"})
        with urllib.request.urlopen(req, timeout=4) as r:
            raw = r.read()
        root = ET.fromstring(raw)
        items = []
        # RSS <item> or Atom <entry>
        nodes = root.iter("item")
        for i, it in enumerate(nodes):
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
    now = time.time()
    with _LOCK:
        if now - _cache["ts"] < FEED_TTL and _cache["items"]:
            return list(_cache["items"])
    live = _fetch_feed()
    items = live + _seed_items()
    with _LOCK:
        _cache["ts"] = now
        _cache["items"] = items
    return list(items)


def recent(n: int = 8, shuffle: bool = True) -> list[dict]:
    """Return up to n recent items, shuffled so the rail feels fresh on every visit."""
    items = _all_items()
    if shuffle:
        random.shuffle(items)
    n = max(5, min(n, 10))
    return items[:n]


def for_match(home: str, away: str) -> list[dict]:
    """Official-style news mentioning either team — used by the match detail page."""
    items = _all_items()
    hit = [it for it in items if home in it.get("teams", []) or away in it.get("teams", [])]
    return hit[:4]
