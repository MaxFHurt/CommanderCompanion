#!/bin/sh
# One command per kind of change (testing 3c, owner 19 Oct): runs exactly the checks the handoff table lists, one at a time
# (parallel runs crash and slow each other), and prints one summary line per check at the end.
# Usage: sh check.sh <kinds> [quick|live] [engineDir]
#   kinds, comma-separated: screens, upgrade, cards, generator, sim, docs (nothing), all
#   quick = while working; live = before going live (the regression checks)
#   engineDir defaults to ../candidate. Set POOL=1 to benchmark with the whole-card search.
# Example: sh check.sh upgrade,screens live
cd "$(dirname "$0")" || exit 1
KINDS=$1; MODE=${2:-quick}; DIR=${3:-../candidate}; PORT=${PORT:-8765}
PW=${PW:-/opt/node22/lib/node_modules/playwright}; export PW
[ -z "$KINDS" ] && { sed -n 2,8p "$0"; exit 1; }
has(){ case ",$KINDS," in *",$1,"*|*",all,"*) return 0;; esac; return 1; }
SUM=""; add(){ SUM="$SUM
$1"; }
server(){ curl -s -o /dev/null "http://127.0.0.1:$PORT/index.html" || (cd "$DIR" && setsid nohup python3 -m http.server "$PORT" >/dev/null 2>&1 &); sleep 1; }
quick(){ server; add "quick check:  $(node ui-quick.mjs "$PORT" q 2>&1 | tail -1)"; }
uisuite(){ server; L=$(node ui-par.mjs "$PORT" check 3 2>&1); add "UI suite:     $(echo "$L" | grep '^build' | tail -1)"; F=$(echo "$L" | grep 'FAIL\|stopped early' | cut -c1-180); [ -n "$F" ] && add "$F"; }   # 3 groups side by side (5.6 min); SEQ=1 runs it in one line
[ -n "$SEQ" ] && uisuite(){ server; L=$(node ui-test.mjs "$PORT" check 2>&1); add "UI suite:     $(echo "$L" | tail -1)"; F=$(echo "$L" | grep '^FAIL' | cut -c1-160); [ -n "$F" ] && add "$F"; }
bench(){ for s in $*; do add "bench $s:  $(SCORECHECK=1 ALSOW=3,6 node bench.js "$DIR" check "$s" --quiet 2>&1 | grep '^MEAN' | sed 's/ | whole-list.*//' | tr '\n' ' ')"; done; }
semantics(){ add "semantics:    $(node semantics.js "$DIR" | tail -1)"; }
claims(){ add "claims:       $(node claims.js "$DIR" 2>&1 | grep -i 'unrecognised' | tr -s ' ')"; }
accept(){ add "accept:       $(node accept.js "$DIR" 2>&1 | tail -1)"; add "accept edh:   $(AIMS=edh node accept.js "$DIR" 2>&1 | tail -1)"; }
scheck(){ add "scheck:       $(node scheck.js "$DIR" 2>&1 | tail -1)"; }
cisweep(){ add "cisweep:      $(node cisweep.js "$DIR" 2>&1 | grep -i outside | tail -1)"; }
edge(){ add "edge throws:  $(node edge.js "$DIR" 2>&1 | grep -c THROW)"; }
genstrong(){ add "genstrong:    $(node genstrong.js "$DIR" tuneall 2>&1 | tail -1)"; }
tourney(){ add "tourney:      $(node tourney.js "$DIR" 2>&1 | tail -1)"; }
T0=$(date +%s)
# the page runs the minified bundles: rebuild them from the readable files first (0.9.3)
[ -f "$DIR/tools/build.sh" ] && sh "$DIR/tools/build.sh" >/dev/null
if [ "$MODE" = quick ]; then
  if has screens || has generator || has sim; then quick; fi
  if has upgrade; then quick; bench tuneall; fi
  if has cards; then semantics; fi
else
  RAN=" "; once(){ case "$RAN" in *" $1 "*) return 1;; esac; RAN="$RAN$1 "; return 0; }
  if has upgrade || has cards || has sim; then once bench && bench tuneall test holdout; fi
  if has cards; then once semantics && semantics; once claims && claims; once accept && accept; fi
  if has upgrade; then once scheck && scheck; once claims && claims; once cisweep && cisweep; once edge && edge; fi
  if has generator; then once accept && accept; once genstrong && genstrong; once tourney && tourney; fi
  if has screens || has sim; then once ui && uisuite; fi
fi
echo "== check.sh $KINDS $MODE ($(($(date +%s) - T0)) s)$SUM"
