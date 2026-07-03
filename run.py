"""
Single entry point for the WC2026 Predictor web app.

Usage:
    python run.py                # serve the built site + API at http://127.0.0.1:8000
    PORT=9000 python run.py      # custom port

It builds the frontend automatically if `frontend/dist` is missing (needs Node/npm for that one-time
step). For live frontend development use two terminals instead - see README.md ("Development").

Backend Python deps are auto-installed into a project-local .venv on first run (and reinstalled
whenever backend/requirements.txt changes), so `python run.py` works standalone even on systems
(e.g. Homebrew/PEP 668 "externally managed" Pythons) that refuse system-wide pip installs.
"""
import hashlib
import os
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"
VENV = ROOT / ".venv"
REQUIREMENTS = BACKEND / "requirements.txt"
_REQ_HASH_MARKER = VENV / ".requirements.sha256"


def _venv_python() -> Path:
    return VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python3")


def ensure_venv_deps() -> Path:
    """Create ./.venv (if missing) and install backend/requirements.txt into it (if missing or the
    requirements file changed since last install). Returns the venv's python executable."""
    vpy = _venv_python()
    if not vpy.exists():
        print(f"[run] Creating virtual environment at {VENV} ...")
        subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)

    req_hash = hashlib.sha256(REQUIREMENTS.read_bytes()).hexdigest()
    installed_hash = _REQ_HASH_MARKER.read_text().strip() if _REQ_HASH_MARKER.exists() else None
    if req_hash != installed_hash:
        print("[run] Installing backend dependencies into .venv (first run / requirements changed)...")
        subprocess.run([str(vpy), "-m", "pip", "install", "--quiet", "--upgrade", "pip"], check=True)
        subprocess.run([str(vpy), "-m", "pip", "install", "--quiet", "-r", str(REQUIREMENTS)], check=True)
        _REQ_HASH_MARKER.write_text(req_hash)
    return vpy


def ensure_frontend_built() -> bool:
    if DIST.exists():
        return True
    print("[run] frontend/dist not found - attempting a one-time build (needs npm)...")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    try:
        if not (FRONTEND / "node_modules").exists():
            subprocess.run([npm, "install"], cwd=FRONTEND, check=True)
        subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True)
        return DIST.exists()
    except Exception as e:  # noqa: BLE001
        print(f"[run] Could not build the frontend automatically ({e}).")
        print("[run] The API will still run; build the frontend manually with:")
        print(f"[run]    cd {FRONTEND} && npm install && npm run build")
        return False


def main():
    have_ui = ensure_frontend_built()
    try:
        import uvicorn  # noqa: F401
        import fastapi  # noqa: F401
    except ImportError:
        vpy = ensure_venv_deps()
        # NOTE: compare sys.prefix, not sys.executable - the venv's python is typically a symlink
        # back to the base interpreter, so resolving sys.executable would collapse both to the same
        # real file and this check would always be true (spuriously "already in the venv").
        if Path(sys.prefix).resolve() == VENV.resolve():
            sys.exit("[run] Dependencies still missing after installing into .venv - see the pip "
                      "output above for the underlying error.")
        print(f"[run] Restarting under the venv interpreter ({vpy}) ...")
        os.execv(str(vpy), [str(vpy), str(Path(__file__).resolve()), *sys.argv[1:]])

    sys.path.insert(0, str(BACKEND))
    os.chdir(BACKEND)
    port = int(os.environ.get("PORT", "8000"))
    url = f"http://127.0.0.1:{port}"
    print("=" * 60)
    print(f"  WC2026 Predictor running at  {url}")
    print(f"  Frontend: {'served from /dist' if have_ui else 'NOT built (API only)'}")
    print(f"  API docs: {url}/docs")
    print("=" * 60)

    if have_ui and os.environ.get("NO_BROWSER") != "1":
        threading.Timer(1.8, lambda: webbrowser.open(url)).start()

    uvicorn.run("server:app", host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
