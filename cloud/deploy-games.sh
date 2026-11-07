#!/bin/sh
# Puts the online-games rules server (cloud/rules-server.mjs, via cloud/supabase-games.mjs) live as the Supabase Edge
# Function "games" on the Commander Companion project. The Supabase access token is supplied by the environment's network
# secret for api.supabase.com (or SUPABASE_ACCESS_TOKEN). Live address: https://$REF.supabase.co/functions/v1/games
set -eu
cd "$(dirname "$0")"
REF=wdngytwilqxcdoqtefgg
ESBUILD=${ESBUILD:-$(ls /root/.npm/_npx/*/node_modules/.bin/esbuild 2>/dev/null | head -1)}
[ -n "$ESBUILD" ] || ESBUILD="npx --yes esbuild@0.24.0"
OUT=$(mktemp -d)
$ESBUILD supabase-games.mjs --bundle --minify --format=esm --platform=neutral --target=es2022 --outfile="$OUT/index.js" --log-level=warning
AUTH=${SUPABASE_ACCESS_TOKEN:+-H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN"}
# The table (created once; harmless to repeat).
curl -sS -X POST $AUTH -H "Content-Type: application/json" "https://api.supabase.com/v1/projects/$REF/database/query" \
  -d '{"query":"create table if not exists public.cc_games (code text primary key, rev integer not null default 1, phase text not null default '"'"'lobby'"'"', lobby jsonb, game text, keys jsonb not null default '"'"'[]'"'"'::jsonb, summary jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()); alter table public.cc_games enable row level security;"}' >/dev/null
cd "$OUT"
curl -sS -X POST $AUTH "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=games" \
  -F 'metadata={"entrypoint_path":"index.js","name":"games","verify_jwt":false};type=application/json' -F "file=@index.js;type=application/javascript" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print("games function:", "version %s" % d["version"] if "version" in d else d)'
ls -l "$OUT/index.js" | awk '{print "bundle bytes:", $5}'
rm -rf "$OUT"
