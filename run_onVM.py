"""
Production launcher for the GCP VM using Docker.

Why this exists: This script orchestrates the Docker setup for the application.
It stops any conflicting native instances and uses docker-compose to build 
and run the application in an isolated container.

Usage on the VM:
    git clone <repo> && cd FIFA-WC-26-predictor
    python3 run_onVM.py
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def kill_previous_native_instances(port: int = 8090):
    """Ensure no native python processes are hogging the port before docker starts."""
    import signal
    import time
    
    print("[run_onVM] Checking for native python processes...")
    try:
        out = subprocess.check_output(["pgrep", "-f", "uvicorn server:app"]).decode()
        for pid_str in out.strip().split():
            if not pid_str: continue
            pid = int(pid_str)
            print(f"[run_onVM] Stopping native uvicorn instance (PID: {pid})...")
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        time.sleep(1)
    except Exception:
        pass
        
    try:
        out = subprocess.check_output(["fuser", f"{port}/tcp"], stderr=subprocess.DEVNULL).decode()
        for pid_str in out.strip().split():
            if not pid_str: continue
            pid = int(pid_str)
            print(f"[run_onVM] Freeing port {port} (killing PID: {pid})...")
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
        time.sleep(1)
    except Exception:
        pass

def main():
    print("=" * 64)
    print("  Deploying WC2026 Predictor via Docker")
    print("=" * 64)

    # 1. Kill any native instances that might conflict with Docker's port binding
    kill_previous_native_instances(8090)

    # 2. Check if docker is installed
    try:
        subprocess.run(["docker", "--version"], check=True, stdout=subprocess.DEVNULL)
    except FileNotFoundError:
        print("[run_onVM] Error: Docker is not installed on this system.")
        sys.exit(1)

    # 3. Run docker compose
    compose_cmd = ["docker", "compose"]
    try:
        # Check if docker compose plugin is available, otherwise try docker-compose
        subprocess.run(compose_cmd + ["version"], check=True, stdout=subprocess.DEVNULL)
    except Exception:
        compose_cmd = ["docker-compose"]
        try:
            subprocess.run(compose_cmd + ["version"], check=True, stdout=subprocess.DEVNULL)
        except Exception:
            print("[run_onVM] Error: docker compose (or docker-compose) is not installed.")
            sys.exit(1)

    print("[run_onVM] Tearing down old containers and rebuilding...")
    
    # Needs sudo if the user is not in the docker group, but let's try without first.
    # Usually on standard setups `sudo` might be needed, we will just pass the command.
    try:
        subprocess.run(compose_cmd + ["-f", "docker-compose.yml", "down"], cwd=ROOT, check=True)
        subprocess.run(compose_cmd + ["-f", "docker-compose.yml", "up", "-d", "--build"], cwd=ROOT, check=True)
    except subprocess.CalledProcessError as e:
        print(f"[run_onVM] Deployment failed with exit code {e.returncode}.")
        print("[run_onVM] You might need to run this script with 'sudo python3 run_onVM.py' if you lack docker permissions.")
        sys.exit(e.returncode)

    print("=" * 64)
    print("  Deployment Successful!")
    print("  Container is running in the background.")
    print("  Port 8090 is exposed to localhost.")
    print("  To view logs, run: docker compose logs -f")
    print("=" * 64)

if __name__ == "__main__":
    main()
