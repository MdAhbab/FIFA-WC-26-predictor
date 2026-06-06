"""
Single entry point for the WC2026 Predictor web app.

Usage:
    python run.py                # serve the built site + API at http://127.0.0.1:8000
    PORT=9000 python run.py      # custom port

It builds the frontend automatically if `frontend/dist` is missing (needs Node/npm for that one-time
step). For live frontend development use two terminals instead - see README.md ("Development").
"""
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
        import uvicorn
    except ImportError:
        sys.exit("[run] Missing dependencies. Install with: pip install -r backend/requirements.txt")

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
