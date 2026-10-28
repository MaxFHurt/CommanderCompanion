#!/bin/sh
# Builds the folder layout the test suite expects, from this repository and its test-data branch:
#   <work>/proto/candidate   the app (copied from the repository root)
#   <work>/proto/tests       these scripts
#   <work>/proto/snapshot, data2, fixtures, expert, baseline, variants   (test-data branch)
#   <work>/corpus, corpus2, corpus3, corpus4                             (test-data branch)
# Usage: sh tools/tests/suite/setup.sh [work-folder]     (default: ../dc-test next to the repository)
set -e
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
WORK=${1:-$REPO/../dc-test}
mkdir -p "$WORK/proto"
git -C "$REPO" fetch -q origin test-data
git -C "$REPO" archive FETCH_HEAD | tar -x -C "$WORK"
rm -rf "$WORK/proto/candidate" "$WORK/proto/tests"; mkdir -p "$WORK/proto/candidate" "$WORK/proto/out"
cp "$REPO"/*.js "$REPO"/index.html "$REPO"/version.json "$REPO"/manifest.json "$REPO"/*.png "$WORK/proto/candidate/"
cp -r "$REPO/engine" "$REPO/ui" "$REPO/files.json" "$WORK/proto/candidate/"   # the split scripts (0.9.3)
cp -r "$REPO/tools" "$WORK/proto/candidate/tools"
cp -r "$REPO/tools/tests/suite" "$WORK/proto/tests"
echo "Test layout ready in $WORK. Run the tests from $WORK/proto/tests (see README.md)."
