#!/bin/sh
# Dayspring launcher — everything a first run needs, zero terminal.
# Called by Dayspring.app (double-click) or directly: sh scripts/launch.sh
#   1. find node (PATH, then nvm installs)
#   2. first run: create .env.local with a fresh vault key
#   3. install deps / init db / seed / build as needed
#   4. start the server on :3000 (or just open it if already running)
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
PORT="${DAYSPRING_PORT:-3000}"
URL="http://localhost:$PORT"
LOG="$DIR/data/launch.log"

note() { osascript -e "display notification \"$1\" with title \"Dayspring\"" >/dev/null 2>&1 || true; }
alert() { osascript -e "display alert \"Dayspring\" message \"$1\"" >/dev/null 2>&1 || echo "$1" >&2; }

mkdir -p "$DIR/data"

# ── Node: PATH first, then any nvm-installed version (newest wins) ──────────
if ! command -v node >/dev/null 2>&1; then
  for d in "$HOME/.nvm/versions/node/"*/bin; do
    [ -d "$d" ] && PATH="$d:$PATH"
  done
  export PATH
fi
if ! command -v node >/dev/null 2>&1; then
  alert "Node.js is required. Install Node 20+ from nodejs.org, then open Dayspring again."
  exit 1
fi

# ── Already running? (must actually be Dayspring, not a squatter on :3000) ──
if BODY="$(curl -sf --max-time 2 "$URL" 2>/dev/null)"; then
  if printf '%s' "$BODY" | grep -qi dayspring; then
    open "$URL"
    exit 0
  fi
  alert "Port $PORT is used by another app. Quit it and open Dayspring again."
  exit 1
fi

# ── First-run setup ──────────────────────────────────────────────────────────
if [ ! -f .env.local ]; then
  umask 077
  printf '# Created by the Dayspring launcher. Keys pasted in Settings are stored\n# encrypted in the database using this machine secret — do not share it.\nDAYSPRING_VAULT_KEY=%s\n' \
    "$(openssl rand -hex 32)" > .env.local
fi
if ! grep -q '^DAYSPRING_VAULT_KEY=' .env.local; then
  printf 'DAYSPRING_VAULT_KEY=%s\n' "$(openssl rand -hex 32)" >> .env.local
fi

if [ ! -d node_modules ]; then
  note "First run — installing dependencies (a few minutes)…"
  npm install --no-fund --no-audit >> "$LOG" 2>&1
fi

# Push the Convex schema + functions and generate the client (idempotent).
# `convex dev --once` also creates a local anonymous deployment on first run
# and writes CONVEX_DEPLOYMENT / NEXT_PUBLIC_CONVEX_URL into .env.local.
FRESH_DB=0
grep -q '^CONVEX_DEPLOYMENT=' .env.local 2>/dev/null || FRESH_DB=1
npx convex dev --once >> "$LOG" 2>&1
if [ "$FRESH_DB" = "1" ]; then
  npm run seed >> "$LOG" 2>&1 || true
  npm run seed:catalog >> "$LOG" 2>&1 || true
fi

if [ ! -f .next/BUILD_ID ]; then
  note "Building Dayspring (one time, about a minute)…"
  npm run build >> "$LOG" 2>&1
fi

# ── Start + open ─────────────────────────────────────────────────────────────
note "Starting Dayspring…"
nohup npm start -- -p "$PORT" >> "$LOG" 2>&1 &

i=0
while [ $i -lt 60 ]; do
  if curl -sf --max-time 1 "$URL" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  fi
  i=$((i + 1))
  sleep 1
done

alert "Dayspring didn't start — see data/launch.log for details."
exit 1
