#!/bin/sh
# Sensitivity: each main setting at 50% and 150% of its value; mean top-5 / top-10 agreement and whole-list regret.
base=$(node bench.js ../candidate x "$1" --quiet | tail -1 | sed 's/ | cutRank.*//')
echo "base            $base"
for kv in wi:10 ws:4 wf:0.1 pc:3 pb:0.25 pk:5 m:2 wd:3 wk:1.5 fn:0.3; do k=${kv%%:*}; v=${kv#*:}
  for f in 0.5 1.5; do nv=$(echo "$v * $f" | bc -l | sed 's/^\./0./'); printf "%-4s x%-4s %-6s " $k $f $nv; UP="{\"$k\":$nv}" node bench.js ../candidate x "$1" --quiet | tail -1 | sed 's/ | cutRank.*//'; done; done
