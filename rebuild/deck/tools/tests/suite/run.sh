#!/bin/sh
# Deck Builder tests in one command (skill deck-test). Usage: sh run.sh ids <UI ids…> | quick | full
# Rebuilds the bundles, sets up a fresh test folder, serves it, runs, prints the summary, stops the server.
set -e
MODE=$1; shift || true
SUITE=$(cd "$(dirname "$0")" && pwd); DECK=$(cd "$SUITE/../../.." && pwd)
PW=${PW:-/opt/node22/lib/node_modules/playwright}; export PW
PORT=${PORT:-$((8820 + $$ % 100))}
W=/home/user/dc-runs/$(date +%m%d-%H%M%S)-$$
sh "$DECK/tools/build.sh" >/dev/null
sh "$SUITE/setup.sh" "$W" >/dev/null 2>&1
cd "$W/proto/candidate" && setsid nohup python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
sleep 1; cd "$W/proto/tests"
trap 'pkill -f "http.server $PORT" 2>/dev/null || true' EXIT
case "$MODE" in
  ids)   printf '[["%s"]]' "$(echo "$*" | sed 's/ /","/g')" > ../plan.json
         SHARD=0/1 SHARDPLAN=../plan.json node ui-test.mjs "$PORT" ids 2>&1 | grep -E "^(PASS|FAIL)|^build" | grep -v "UI-ID-01\|UI-AIM-01" | cut -c1-300 ;;
  quick) node ui-quick.mjs "$PORT" q 2>&1 | tail -1 ;;
  full)  PORT=$PORT sh check.sh all live 2>&1 | tail -26 | cut -c1-300 ;;
  *)     echo "usage: sh run.sh ids <UI ids…> | quick | full"; exit 1 ;;
esac
echo "(test folder: $W)"
