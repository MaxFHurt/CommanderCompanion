#!/bin/sh
# Release checks for a batch, chosen by what the batch changed (owner, 13 Nov: test what a batch can break, not everything).
# Usage (repo root or anywhere): sh rebuild/tools/suites.sh [base-ref] [plan|run]
#   base-ref defaults to origin/main. plan (default) prints what would run; run runs it and prints one summary.
# Rule: a change in an engine folder (deck/engine, src/engine, src/game, data files) runs everything for that app;
# UI-only changes skip the engine benchmarks and rules suites. Unknown paths run everything (safe default).
BASE=${1:-origin/main}; MODE=${2:-plan}
R=$(cd "$(dirname "$0")/.." && pwd); cd "$R" || exit 1          # rebuild/
FILES=$(git diff --name-only "$BASE"...HEAD -- . | sed 's#^rebuild/##')
[ -z "$FILES" ] && { echo "No changes under rebuild/ since $BASE."; exit 0; }
DK=""; GN=""; GP=""
dk(){ case ",$DK," in *",$1,"*) ;; *) DK="${DK:+$DK,}$1";; esac; }
for f in $FILES; do
  case "$f" in
    *.md|tools/longtail/*|tools/suites.sh) ;;                               # docs, tools: nothing
    deck/tools/tests/*) dk screens ;;                                       # test edits: the UI suite proves them
    deck/ui/*|deck/index.html|deck/cc-theme.css|deck/manifest.json|deck/version.json|deck/app.min.js) dk screens ;;
    deck/engine/upgrades.js|deck/engine/score.js|deck/engine/mana.js) dk upgrade; dk screens ;;
    deck/engine/reading.js|deck/engine/rules.js|deck/engine/functions.js|deck/engine/library.js|deck/data.js|deck/lists.js) dk cards; dk screens ;;
    deck/engine/generator.js) dk generator; dk screens ;;
    deck/engine/practice.js|deck/match-worker.js) dk sim ;;
    deck/*) dk all ;;                                                        # core.js, strength.js, work.js, engine.min.js …
    src/engine/*|src/data/mechanics.js) GN=all; GP=all ;;
    src/game/*) [ "$GN" = all ] || GN=game; GP=all ;;
    src/ui/*|src/app/*|src/net/*|src/data/*|src/main.js|src/version.js|styles/*|index.html|sw.js|build.json|precache.json|manifest.webmanifest|assets/*) GP=all ;;
    cloud/*|tests/*.py|tests/fixtures/*) GP=all ;;
    tests/node/*) [ "$GN" = all ] || GN=game ;;
    *) DK=all; GN=all; GP=all ;;
  esac
done
NODE_ALL="game mechanics smoke catalog tracker practice rules-server forge-triggers"
case "$GN" in all) NODE="$NODE_ALL"; SOAK=1;; game) NODE="game mechanics smoke tracker practice"; SOAK=1;; *) NODE=""; SOAK="";; esac
[ -n "$GP" ] && NODE="${NODE:-smoke}"
PY="game_ui flows_ui net_ui online_ui recovery_ui offline_ui pair_ui challenge_ui tracker_test tracker_net_ui"
echo "Changed: $(echo $FILES | wc -w) files since $BASE"
echo "Deck Builder: ${DK:-none}${DK:+ (check.sh $DK live)}"
echo "Node suites:  ${NODE:-none}${SOAK:+ + soak 40 x3}"
echo "Browser:      $([ -n "$GP" ] && echo $PY || echo none)"
[ "$MODE" = run ] || exit 0

T0=$(date +%s); OUT=$(mktemp -d); trap 'pkill -f "http.server 4180" 2>/dev/null; rm -rf "$OUT"' EXIT
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
# Deck Builder first, alone (it uses 3 of 4 cores); then the game suites.
if [ -n "$DK" ]; then
  W=/home/user/dc-runs/$(date +%m%d-%H%M%S)-rel; sh deck/tools/tests/suite/setup.sh "$W" >/dev/null 2>&1
  (cd "$W/proto/tests" && sh check.sh "$DK" live 2>&1 | sed -n '/^== check.sh/,$p') > "$OUT/deck"
  pkill -f "http.server 8765" 2>/dev/null
fi
for s in $NODE; do printf '%-15s %s\n' "$s" "$(node tests/node/$s.mjs 2>&1 | tail -1 | cut -c1-140)"; done > "$OUT/node"
[ -n "$SOAK" ] && for i in 1 2 3; do echo "soak 40 #$i     $(node tests/node/soak.mjs 40 2>&1 | tail -1 | cut -c1-140)"; done >> "$OUT/node"
if [ -n "$GP" ]; then
  python3 -c "import playwright" 2>/dev/null || pip install -q playwright==1.63.0
  (setsid nohup python3 -m http.server 4180 --bind 127.0.0.1 >/dev/null 2>&1 &); sleep 1
  for t in $PY; do printf '%-15s %s\n' "$t" "$(python3 tests/$t.py 2>&1 | tail -1 | cut -c1-140)"; done > "$OUT/py"
fi
echo "== suites ($(($(date +%s) - T0)) s)"; cat "$OUT"/deck "$OUT"/node "$OUT"/py 2>/dev/null
