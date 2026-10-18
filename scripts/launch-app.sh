#!/bin/bash
# Start the production server if needed, then open the app in the browser.
# Designed to be run from a double-clickable macOS .app (minimal PATH).

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3001}"
export PORT
URL="http://127.0.0.1:$PORT"
LOG="$ROOT/data/server.log"
DIST="$ROOT/apps/web/dist/index.html"

# Finder-launched apps do not inherit the shell PATH. Cover the common setups.
export PATH="$HOME/.volta/bin:$HOME/.asdf/shims:$HOME/.local/share/mise/shims:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1 || true
fi

alert() {
  osascript - "Eisenhower Matrix" "$1" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display alert (item 1 of argv) message (item 2 of argv) as critical buttons {"OK"} default button "OK"
end run
APPLESCRIPT
}

is_running() {
  curl -fsS --max-time 1 "$URL/api/health" >/dev/null 2>&1
}

mkdir -p "$ROOT/data"

if is_running; then
  open "$URL"
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  alert "Node.js/npm was not found. Install Node.js 24+ and try again."
  exit 1
fi

# Rotate the log so it cannot grow without bound.
if [ -f "$LOG" ] && [ "$(wc -c < "$LOG" | tr -d ' ')" -gt 1000000 ]; then
  : > "$LOG"
fi

cd "$ROOT" || exit 1

if [ ! -d "$ROOT/node_modules" ]; then
  echo "==== $(date) installing dependencies ====" >> "$LOG"
  if ! npm install >> "$LOG" 2>&1; then
    alert "npm install failed. See data/server.log for details."
    exit 1
  fi
fi

# Rebuild only when the web source is newer than the last build.
NEEDS_BUILD=0
if [ ! -f "$DIST" ]; then
  NEEDS_BUILD=1
elif [ -n "$(find "$ROOT/apps/web/src" "$ROOT/apps/web/index.html" "$ROOT/apps/web/vite.config.ts" "$ROOT/packages/shared/src" -newer "$DIST" -print -quit 2>/dev/null)" ]; then
  NEEDS_BUILD=1
fi

if [ "$NEEDS_BUILD" -eq 1 ]; then
  echo "==== $(date) building web app ====" >> "$LOG"
  if ! npm run build >> "$LOG" 2>&1; then
    alert "The web build failed. See data/server.log for details."
    exit 1
  fi
fi

# Something else already owns the port: give it a moment, then report.
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  for _ in $(seq 1 20); do
    if is_running; then
      open "$URL"
      exit 0
    fi
    sleep 0.5
  done
  alert "Port $PORT is already in use by another app."
  exit 1
fi

echo "==== $(date) starting server ====" >> "$LOG"
nohup npm start >> "$LOG" 2>&1 &
disown

for _ in $(seq 1 60); do
  if is_running; then
    open "$URL"
    exit 0
  fi
  sleep 0.5
done

alert "The server did not start. See data/server.log for details."
exit 1
