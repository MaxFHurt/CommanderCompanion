#!/bin/sh
# Builds what the live page downloads (owner's choice 2c, 19 Oct 2026): the readable scripts listed in files.json, joined in
# load order and minified into
#   app.min.js     data, lists, engine and ui: the page (index.html loads it)
#   engine.min.js  data, lists and engine: the background worker (work.js loads it)
# Each starts with the build number and a fingerprint of its sources; the tests fail if a bundle is older than its sources.
# Run it after every change to the scripts, before testing and before going live: sh tools/build.sh
# ?dev=1 on the page loads the readable scripts instead (for debugging); the result is the same program.
set -e
cd "$(dirname "$0")/.."
ESB=${ESBUILD:-}
if [ -z "$ESB" ]; then
  if [ -x node_modules/.bin/esbuild ]; then ESB=node_modules/.bin/esbuild; else ESB="npx --yes esbuild@0.24.0"; fi
fi
# Plan facts (roadmap 6b; owner, 16 Nov: regenerated with each build): read from the newest daily card data (cached for 20 h
# in ~/.cache/cc-plan; PLAN_CARDS=<cards.json.gz> to use another file) by the game engine. Skipped when nothing it reads
# changed; offline with no cached cards, the committed plan-facts.js is kept.
PC=${PLAN_CARDS:-$HOME/.cache/cc-plan/cards.json.gz}
if [ -z "$PLAN_CARDS" ] && { [ ! -s "$PC" ] || [ -n "$(find "$PC" -mmin +1200 2>/dev/null)" ]; }; then
  mkdir -p "$(dirname "$PC")"
  curl -sSf -m 120 -o "$PC.tmp" https://raw.githubusercontent.com/MaxFHurt/Deck-Companion/card-data/cards.json.gz && mv "$PC.tmp" "$PC" || rm -f "$PC.tmp"
fi
if [ -s "$PC" ]; then node tools/plan-facts.mjs "$PC" plan-facts.js || echo "plan-facts.js: not regenerated (error above); the committed table is kept"
else echo "plan-facts.js: no card data (offline); the committed table is kept"; fi
BUILD=$(node -e "process.stdout.write(String(require('./version.json').build))")
for role in app engine; do
  LIST=$(node -e "const F=require('./files.json');process.stdout.write(('$role'==='app'?F.data.concat(F.engine,F.ui):F.data.concat(F.engine)).join(' '))")
  FP=$(node tools/fingerprint.js $LIST)
  cat $LIST > ".build-$role.js"
  $ESB ".build-$role.js" --minify --target=es2020 --log-level=error --legal-comments=none --outfile=".build-$role.min.js"
  { printf '/* Deck Companion build %s · sources %s · made by tools/build.sh from files.json; edit the readable files, not this */\n' "$BUILD" "$FP"; cat ".build-$role.min.js"; } > "$role.min.js"
  rm -f ".build-$role.js" ".build-$role.min.js"
  echo "$role.min.js: build $BUILD, $(wc -c < "$role.min.js") bytes, sources $FP"
done
