#!/bin/sh
# Builds the folder layout the test suite expects, from the Deck Builder folder (rebuild/deck in CommanderCompanion) and
# the test-data branch of MaxFHurt/Deck-Companion:
#   <work>/proto/candidate   the app (copied from the repository root)
#   <work>/proto/tests       these scripts
#   <work>/proto/snapshot, data2, fixtures, expert, baseline, variants   (test-data branch)
#   <work>/corpus, corpus2, corpus3, corpus4                             (test-data branch)
# Usage: sh tools/tests/suite/setup.sh [work-folder]     (default: ../dc-test next to the repository)
set -e
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
WORK=${1:-$REPO/../dc-test}
mkdir -p "$WORK/proto"
git -C "$REPO" fetch -q https://github.com/MaxFHurt/Deck-Companion.git test-data
git -C "$(git -C "$REPO" rev-parse --show-toplevel)" archive FETCH_HEAD | tar -x -C "$WORK"   # from the top: in a subfolder, git archive takes only that folder
rm -rf "$WORK/proto/candidate" "$WORK/proto/tests"; mkdir -p "$WORK/proto/candidate" "$WORK/proto/out"
cp "$REPO"/*.js "$REPO"/*.css "$REPO"/index.html "$REPO"/version.json "$REPO"/manifest.json "$WORK/proto/candidate/"
cp -r "$REPO/../assets" "$WORK/proto/candidate/assets"   # the Commander Companion art the page uses (../assets from deck/)
cp -r "$REPO/engine" "$REPO/ui" "$REPO/files.json" "$WORK/proto/candidate/"   # the split scripts (0.9.3)
cp -r "$REPO/tools" "$WORK/proto/candidate/tools"
cp -r "$REPO/tools/tests/suite" "$WORK/proto/tests"
echo "Test layout ready in $WORK. Run the tests from $WORK/proto/tests (see README.md)."
