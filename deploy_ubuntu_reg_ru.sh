#!/usr/bin/env bash
set -euo pipefail

APP_DIR=/opt/max-bot
REPO_DIR="$APP_DIR"

sudo apt update
sudo apt install -y docker.io docker-compose-plugin git curl nginx ufw
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker "$USER"

sudo mkdir -p "$APP_DIR"
cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "Please place the project files in $APP_DIR first or clone the repo here." >&2
  exit 1
fi

cp .env.example .env 2>/dev/null || true

sudo docker compose up -d --build

sudo docker compose ps
