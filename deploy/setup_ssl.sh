#!/usr/bin/env bash
# One-shot TLS setup for fifaworldcup26predictor.ahbab.dev using nginx + certbot (Let's Encrypt).
# Run on the GCP VM after the app is up on 127.0.0.1:8090 and DNS points the subdomain at the VM.
set -euo pipefail

DOMAIN="fifaworldcup26predictor.ahbab.dev"
EMAIL="${CERTBOT_EMAIL:-mkhan223869@bscse.uiu.ac.bd}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing nginx + certbot (Debian/Ubuntu)…"
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx

echo "==> Installing the site config…"
sudo cp "$HERE/nginx/fifaworldcup26predictor.conf" /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/fifaworldcup26predictor.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

echo "==> Requesting/installing the certificate…"
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect

echo "==> Done. certbot auto-renews via its systemd timer. Verify:"
echo "    curl -I https://$DOMAIN/"
