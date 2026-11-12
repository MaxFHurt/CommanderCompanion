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
# Each check prints one summary line. Live runs (testing speed, owner 9 Nov) queue them as jobs and run PAR of them side by side
# (default 3 of the machine's 4 cores); cisweep and genstrong split their own decks across PAR processes, so they run alone.
# Every check is deterministic, so the numbers are the same as one at a time; the summary keeps the same order. SEQ=1: one at a time.
JD=$(mktemp -d); JN=0
job(){ JN=$((JN + 1)); f="$JD/$(printf %03d $JN)${2:+.solo}.sh"; printf 'cd "%s" && DIR="%s" && PW="%s" && export PW && %s\n' "$PWD" "$DIR" "$PW" "$1" > "$f"; [ "$MODE" = live ] && [ -z "$SEQ" ] || { add "$(sh "$f" 2>&1)"; rm -f "$f"; }; }
jobs_run(){ for f in "$JD"/*.solo.sh; do [ -f "$f" ] && sh "$f" > "${f%.sh}.out" 2>&1; done
  ls "$JD"/*.sh 2>/dev/null | grep -v '\.solo\.sh$' | xargs -r -P "${PAR:-3}" -I{} sh -c 'sh "$0" > "${0%.sh}.out" 2>&1' {}
  for f in "$JD"/*.out; do [ -f "$f" ] && add "$(cat "$f")"; done; rm -rf "$JD"; }
# each tier's list as players see it (card strength on: the strength rows, ranked by the deck's tier); NOSTR=1 for the engine's own list
bench(){ for s in $*; do for t in apex mid budget; do job 'echo "bench '"$s $t"':  $(SCORECHECK=1 ALSOW=3,6 TIER='"$t"' node bench.js "$DIR" check '"$s"' --quiet 2>&1 | grep "^MEAN" | sed "s/ | whole-list.*//" | tr "\n" " ")"'; done; done; }
semantics(){ job 'echo "semantics:    $(node semantics.js "$DIR" | tail -1)"'; }
identity(){ job 'echo "$(node identity.js "$DIR" | head -1)"'; }   # colour identity vs the printed colours (owner, 12 Nov)
claims(){ job 'echo "claims:       $(node claims.js "$DIR" 2>&1 | grep -i unrecognised | tr -s " ")"'; }
accept(){ job 'echo "accept:       $(node accept.js "$DIR" 2>&1 | tail -1)"'; job 'echo "accept edh:   $(AIMS=edh node accept.js "$DIR" 2>&1 | tail -1)"'; }
scheck(){ job 'echo "scheck:       $(node scheck.js "$DIR" 2>&1 | tail -1)"'; }
cisweep(){ job 'echo "cisweep:      $(PAR=${PAR:-3} node cisweep.js "$DIR" 2>&1 | grep -i outside | tail -1)"' solo; }
edge(){ job 'echo "edge throws:  $(node edge.js "$DIR" 2>&1 | grep -c THROW)"'; }
genstrong(){ job 'echo "genstrong:    $(PAR=${PAR:-3} node genstrong.js "$DIR" tuneall 2>&1 | tail -1)"' solo; }
tourney(){ job 'echo "tourney:      $(node tourney.js "$DIR" 2>&1 | tail -1)"'; }
T0=$(date +%s)
# the page runs the minified bundles: rebuild them from the readable files first (0.9.3)
[ -f "$DIR/tools/build.sh" ] && sh "$DIR/tools/build.sh" >/dev/null
if [ "$MODE" = quick ]; then
  if has screens || has generator || has sim; then quick; fi
  if has upgrade; then quick; bench tuneall; fi
  if has cards; then semantics; identity; fi
else
  RAN=" "; once(){ case "$RAN" in *" $1 "*) return 1;; esac; RAN="$RAN$1 "; return 0; }
  if has upgrade || has cards || has sim; then once bench && bench tuneall test holdout; fi
  if has cards; then once semantics && semantics; once identity && identity; once claims && claims; once accept && accept; fi
  if has upgrade; then once scheck && scheck; once claims && claims; once cisweep && cisweep; once edge && edge; fi
  if has generator; then once accept && accept; once genstrong && genstrong; once tourney && tourney; fi
  jobs_run
  if has screens || has sim; then once ui && uisuite; fi
fi
rm -rf "$JD"; echo "== check.sh $KINDS $MODE ($(($(date +%s) - T0)) s)$SUM"
