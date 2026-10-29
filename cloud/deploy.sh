#!/bin/sh
# Puts cloud/worker.js live on Cloudflare as the "commander-companion-games" Worker.
# Needs CLOUDFLARE_API_TOKEN (Workers Scripts: Edit) and CLOUDFLARE_ACCOUNT_ID in the environment.
# Live address: https://commander-companion-games.<account subdomain>.workers.dev
set -eu
cd "$(dirname "$0")"
: "${CLOUDFLARE_API_TOKEN:?missing}" "${CLOUDFLARE_ACCOUNT_ID:?missing}"
NAME=commander-companion-games
API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$NAME"
AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# The Durable Object class is created once (migration v1); later uploads only replace the code.
if curl -sSf -H "$AUTH" "$API/settings" >/dev/null 2>&1; then MIGRATE=''; else MIGRATE=',"migrations":{"new_tag":"v1","new_sqlite_classes":["GameStore"]}'; fi
META='{"main_module":"worker.js","compatibility_date":"2026-10-01","bindings":[{"type":"durable_object_namespace","name":"GAMES","class_name":"GameStore"}]'"$MIGRATE"'}'

curl -sS -X PUT -H "$AUTH" -F "metadata=$META;type=application/json" -F "worker.js=@worker.js;type=application/javascript+module" "$API" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("upload:", "ok" if d["success"] else d["errors"]); sys.exit(0 if d["success"] else 1)'
curl -sS -X POST -H "$AUTH" -H "Content-Type: application/json" -d '{"enabled":true}' "$API/subdomain" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("workers.dev address:", "on" if d["success"] else d["errors"])'
