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
