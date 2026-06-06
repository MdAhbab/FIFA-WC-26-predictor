"""In-memory session store with a hard 20-minute idle timeout.

Deliberately dependency-free and lightweight (the GCP VM is small): a single dict guarded by a
lock, swept lazily on access. Each session keeps the user's last prediction config so repeated
tweaks reuse cached compute instead of recomputing from scratch (see server.get_payload).

A session is identified by an opaque cookie (``wcsid``). No personal data is stored — only an
anonymous id, timestamps and the user's in-progress prediction config.
"""
from __future__ import annotations
import secrets
import time
from threading import Lock

# 20-minute idle timeout, per the product requirement.
SESSION_TTL = 20 * 60
COOKIE_NAME = "wcsid"

_LOCK = Lock()
_SESSIONS: dict[str, dict] = {}
_last_sweep = 0.0


def _sweep(now: float) -> None:
    """Drop expired sessions. Called opportunistically, at most every ~30s, to stay cheap."""
    global _last_sweep
    if now - _last_sweep < 30:
        return
    _last_sweep = now
    dead = [sid for sid, s in _SESSIONS.items() if now - s["last_seen"] > SESSION_TTL]
    for sid in dead:
        _SESSIONS.pop(sid, None)


def touch(sid: str | None) -> tuple[str, dict, bool]:
    """Return (session_id, session, created). Creates a fresh session if missing/expired."""
    now = time.time()
    with _LOCK:
        _sweep(now)
        s = _SESSIONS.get(sid) if sid else None
        if s is None or now - s["last_seen"] > SESSION_TTL:
            sid = secrets.token_urlsafe(18)
            s = {"created": now, "last_seen": now, "config": {}, "hits": 0}
            _SESSIONS[sid] = s
            created = True
        else:
            created = False
        s["last_seen"] = now
        s["hits"] += 1
        return sid, s, created


def get(sid: str | None) -> dict | None:
    now = time.time()
    with _LOCK:
        s = _SESSIONS.get(sid) if sid else None
        if s is None or now - s["last_seen"] > SESSION_TTL:
            return None
        return s


def set_config(sid: str, config: dict) -> None:
    with _LOCK:
        s = _SESSIONS.get(sid)
        if s is not None:
            s["config"] = config
            s["last_seen"] = time.time()


def info(sid: str | None) -> dict:
    """Lightweight, JSON-safe view of a session for the client (countdown, etc.)."""
    s = get(sid)
    if s is None:
        return {"active": False, "ttl_seconds": SESSION_TTL}
    remaining = max(0, int(SESSION_TTL - (time.time() - s["last_seen"])))
    return {
        "active": True,
        "ttl_seconds": SESSION_TTL,
        "expires_in": remaining,
        "hits": s["hits"],
    }


def count() -> int:
    now = time.time()
    with _LOCK:
        return sum(1 for s in _SESSIONS.values() if now - s["last_seen"] <= SESSION_TTL)
