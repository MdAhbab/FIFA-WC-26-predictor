"""
Production launcher for the GCP VM using Docker.

Why this exists: This script orchestrates the Docker setup for the application.
It stops any conflicting native instances and uses docker-compose to build
and run the application in an isolated container.

Usage on the VM:
    git clone <repo> && cd FIFA-WC-26-predictor
    sudo python3 run_onVM.py
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def kill_previous_native_instances(port: int = 8090):
    """Kill only host-level (non-Docker) python processes hogging the port."""
    import signal
    import time

    print("[run_onVM] Checking for conflicting native processes...")

    def is_docker_process(pid: int) -> bool:
        """Return True if the PID belongs to a Docker container or docker-proxy."""
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as f:
                cmd = f.read().replace(b"\x00", b" ").decode(errors="ignore")
            if any(kw in cmd for kw in ("docker-proxy", "docker", "containerd")):
                return True
            with open(f"/proc/{pid}/cgroup", "r") as f:
                cgroup = f.read()
            if "docker" in cgroup or "containerd" in cgroup:
                return True
        except Exception:
            pass
        return False

    # Kill native uvicorn instances only
    try:
        out = subprocess.check_output(["pgrep", "-f", "uvicorn server:app"]).decode()
        for pid_str in out.strip().split():
            if not pid_str:
                continue
            pid = int(pid_str)
            if is_docker_process(pid):
                print(f"[run_onVM] Skipping containerised process (PID {pid})")
                continue
            print(f"[run_onVM] Stopping native uvicorn (PID {pid})...")
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        time.sleep(1)
    except Exception:
        pass

    # Free the port from any non-Docker process
    try:
        out = subprocess.check_output(["fuser", f"{port}/tcp"],
                                      stderr=subprocess.DEVNULL).decode()
        for pid_str in out.strip().split():
            if not pid_str:
                continue
            pid = int(pid_str)
            if is_docker_process(pid):
                print(f"[run_onVM] Skipping docker-managed port holder (PID {pid})")
                continue
            print(f"[run_onVM] Freeing port {port} (killing PID {pid})...")
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        time.sleep(1)
    except Exception:
        pass


def check_docker():
    """Verify docker daemon is reachable; exit with a clear message if not."""
    # Check binary exists
    result = subprocess.run(["docker", "--version"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode != 0:
        print("[run_onVM] Error: Docker is not installed or not on PATH.")
        sys.exit(1)

    # Check daemon is responding (catches 'docker installed but daemon down' case)
    result = subprocess.run(["docker", "info"],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if result.returncode != 0:
        print("[run_onVM] Error: Docker daemon is not running. Start it with: sudo systemctl start docker")
        sys.exit(1)


def get_compose_cmd():
    """Return the docker compose command list (V2 plugin preferred, legacy fallback)."""
    for cmd in (["docker", "compose"], ["docker-compose"]):
        result = subprocess.run(cmd + ["version"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if result.returncode == 0:
            return cmd
    print("[run_onVM] Error: docker compose (or docker-compose) is not installed.")
    sys.exit(1)


def main():
    print("=" * 64)
    print("  Deploying WC2026 Predictor via Docker")
    print("=" * 64)

    # 1. Kill only native conflicting processes (skip Docker-managed ones)
    kill_previous_native_instances(8090)

    # 2. Verify Docker daemon is up
    check_docker()

    # 3. Resolve compose command
    compose_cmd = get_compose_cmd()

    print("[run_onVM] Tearing down old containers...")
    # --remove-orphans cleans up leftover containers from renamed services.
    # -v removes the named volume so the DB is rebuilt clean on redeploy.
    # Remove -v if you want to KEEP the vote/results DB across redeploys.
    subprocess.run(
        compose_cmd + ["-f", "docker-compose.yml", "down", "--remove-orphans"],
        cwd=ROOT
    )

    # Prune only dangling images — keeps other projects' images intact.
    subprocess.run(["docker", "image", "prune", "-f"], cwd=ROOT)

    print("[run_onVM] Building and starting containers...")
    result = subprocess.run(
        compose_cmd + ["-f", "docker-compose.yml", "up", "-d", "--build"],
        cwd=ROOT
    )
    if result.returncode != 0:
        print(f"[run_onVM] Build/start failed (exit {result.returncode}).")
        print("[run_onVM] Tip: run with 'sudo python3 run_onVM.py' if you lack docker permissions.")
        sys.exit(result.returncode)

    print("=" * 64)
    print("  Deployment Successful!")
    print("  Container is running in the background.")
    print("  Port 8090 is exposed to localhost (reverse-proxied via Nginx).")
    print("  View logs: docker compose -f docker-compose.yml logs -f")
    print("=" * 64)


if __name__ == "__main__":
    main()
