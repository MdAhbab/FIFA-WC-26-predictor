# Deployment — fifaworldcup26predictor.ahbab.dev (GCP VM)

The VM already serves the portfolio at **ahbab.dev**, so this app runs on its **own port (8090)**
behind the same reverse proxy. Two supported paths: **Docker (recommended)** or **bare Python**.

---

## 0. DNS

Point an A record (or CNAME) for `fifaworldcup26predictor.ahbab.dev` at the VM's public IP.

---

## 1A. Deploy with Docker (recommended)

```bash
git clone <repo-url> FIFA-WC-26-predictor
cd FIFA-WC-26-predictor

# optional: set secrets / ad ids
export WC_ADMIN_TOKEN="$(openssl rand -hex 24)"     # enables official-result updates
# export VITE_ADSENSE_CLIENT=ca-pub-XXXX            # bake ads into the build

docker compose up -d --build
curl -s localhost:8090/api/health
```

- Frontend is built **inside** the image; the goal model is **pre-trained at build time** and cached,
  so the container starts in ~1s.
- The container binds `127.0.0.1:8090` (localhost only) — the reverse proxy exposes it publicly.
- Votes + official results persist in the `wc26-data` Docker volume.

Update later:

```bash
git pull && docker compose up -d --build
```

## 1B. Deploy with bare Python (no Docker)

```bash
git clone <repo-url> FIFA-WC-26-predictor
cd FIFA-WC-26-predictor
python3 -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
# Node is only needed once to build the frontend:
python run_onVM.py            # builds frontend/dist, then serves 0.0.0.0:8090
```

Run it as a service with **systemd** (`/etc/systemd/system/wc26.service`):

```ini
[Unit]
Description=WC2026 Predictor
After=network.target

[Service]
WorkingDirectory=/home/USER/FIFA-WC-26-predictor
Environment=WC_PORT=8090
Environment=WC_ADMIN_TOKEN=REPLACE_WITH_RANDOM
ExecStart=/home/USER/FIFA-WC-26-predictor/.venv/bin/python run_onVM.py
Restart=always
User=USER

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now wc26
```

---

## 2. Reverse proxy + TLS

### Caddy (simplest — automatic HTTPS)

Add to your `Caddyfile`:

```
fifaworldcup26predictor.ahbab.dev {
    reverse_proxy 127.0.0.1:8090
}
```

### nginx

```nginx
server {
    server_name fifaworldcup26predictor.ahbab.dev;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
# then: sudo certbot --nginx -d fifaworldcup26predictor.ahbab.dev
```

The portfolio's existing `ahbab.dev` server block is untouched — this is a separate `server {}` on a
separate upstream port.

---

## 3. Firewall

Only 80/443 need to be open publicly (handled by the proxy). Port **8090 stays on localhost**.

---

## 4. Updating official results (continual learning)

With `WC_ADMIN_TOKEN` set, post a finalised score; the model applies an incremental Elo update,
locks the fixture, and refreshes all remaining probabilities:

```bash
curl -X POST https://fifaworldcup26predictor.ahbab.dev/api/admin/result \
  -H "x-admin-token: $WC_ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"match_id":1,"home_team":"Mexico","away_team":"South Africa","home_goals":2,"away_goals":1,"stage":"group"}'
```

Remove a mistaken entry: `DELETE /api/admin/result/{match_id}` with the same header.

---

## 5. Tuning for the small VM

| Env var | Default | Effect |
| --- | --- | --- |
| `WC_MC_SIMS` | 4000 | Monte-Carlo runs for the cached base payload |
| `WC_MC_SIMS_TUNE` | 1500 | Runs for live squad/bias recomputes |
| `WC_MAX_COMPUTE` | 4 | Cap on concurrent heavy recomputes |

The base payload is computed **once** at startup and cached, so steady-state traffic (incl. 20+
concurrent visitors) is served from memory with no model inference.
