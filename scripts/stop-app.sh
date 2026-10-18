#!/bin/bash
# Stop the local Eisenhower Matrix production server.

set -u

PORT="${PORT:-3001}"
URL="http://127.0.0.1:$PORT"

is_running() {
  curl -fsS --max-time 1 "$URL/api/health" >/dev/null 2>&1
}

notify() {
  osascript - "Eisenhower Matrix" "$1" <<'APPLESCRIPT' >/dev/null 2>&1 || true
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
APPLESCRIPT
}

if ! is_running; then
  notify "The server is not running."
  exit 0
fi

PIDS="$(lsof -ti tcp:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -z "$PIDS" ]; then
  notify "Could not find the server process."
  exit 1
fi

for pid in $PIDS; do
  CMD="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  case "$CMD" in
    *apps/server/src/index.ts* | *eisenhower*)
      kill "$pid" 2>/dev/null || true
      ;;
  esac
done

for _ in $(seq 1 20); do
  if ! is_running; then
    notify "Server stopped."
    exit 0
  fi
  sleep 0.25
done

notify "The server is still running. Try again or close it from Activity Monitor."
exit 1
