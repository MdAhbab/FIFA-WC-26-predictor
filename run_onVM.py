"""
Production launcher for the GCP VM (no Docker required).

Why this exists: the VM already runs the portfolio at ahbab.dev on the usual ports, so this app
must NOT take port 8000. It binds 0.0.0.0 on a dedicated port (default 8090) for a reverse proxy
(nginx/Caddy) to serve at https://fifaworldcup26predictor.ahbab.dev.

Usage on the VM:
    git clone <repo> && cd FIFA-WC-26-predictor
    python3 -m venv .venv && . .venv/bin/activate
    pip install -r backend/requirements.txt
    python run_onVM.py                 # builds frontend if needed, serves on :8090

Environment:
    WC_PORT          port to bind (default 8090; never 8000)
    WC_HOST          host to bind (default 0.0.0.0)
    WC_ADMIN_TOKEN   enable official-result (continual-learning) writes
    WC_MC_SIMS       Monte-Carlo iterations for the base payload (default 4000)
    WC_MAX_COMPUTE   max concurrent heavy recomputes (default 4)
    SKIP_BUILD=1     don't attempt an npm build (assume frontend/dist already exists)
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
DIST = FRONTEND / "dist"

DEFAULT_PORT = "8090"   # deliberately not 8000 (portfolio lives on the same VM)
DOMAIN = "fifaworldcup26predictor.ahbab.dev"


def ensure_frontend_built() -> bool:
    if DIST.exists():
        return True
    if os.environ.get("SKIP_BUILD") == "1":
        print("[run_onVM] frontend/dist missing and SKIP_BUILD=1 set — serving API only.")
        return False
    print("[run_onVM] frontend/dist not found — building once (needs Node/npm)...")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    try:
        if not (FRONTEND / "node_modules").exists():
            subprocess.run([npm, "ci"], cwd=FRONTEND, check=False) or \
                subprocess.run([npm, "install"], cwd=FRONTEND, check=True)
        subprocess.run([npm, "run", "build"], cwd=FRONTEND, check=True)
        return DIST.exists()
    except Exception as e:  # noqa: BLE001
        print(f"[run_onVM] Could not build the frontend automatically ({e}).")
        print(f"[run_onVM] Build it manually: cd {FRONTEND} && npm install && npm run build")
        return False


def main():
    have_ui = ensure_frontend_built()
    try:
        import uvicorn  # noqa: F401
    except ImportError:
        sys.exit("[run_onVM] Missing deps. Run: pip install -r backend/requirements.txt")

    port = int(os.environ.get("WC_PORT", os.environ.get("PORT", DEFAULT_PORT)))
    host = os.environ.get("WC_HOST", "0.0.0.0")
    if port == 8000:
        print("[run_onVM] WARNING: port 8000 may collide with the portfolio on this VM.")

    sys.path.insert(0, str(BACKEND))
    os.chdir(BACKEND)

    print("=" * 64)
    print(f"  WC2026 Predictor (production)  ->  http://{host}:{port}")
    print(f"  Frontend: {'served from /dist' if have_ui else 'NOT built (API only)'}")
    print(f"  Reverse-proxy this to:  https://{DOMAIN}")
    print(f"  Health:  http://{host}:{port}/api/health")
    print("=" * 64)

    import uvicorn
    # Single worker: model + prediction cache + sessions + continual-learning state are in-process.
    uvicorn.run("server:app", host=host, port=port, workers=1, log_level="info")


if __name__ == "__main__":
    main()
