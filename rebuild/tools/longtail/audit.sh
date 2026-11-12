#!/bin/sh
# usage: audit.sh <tag>   -> out/<tag>.json merged (cards sorted by EDHREC rank)
S=${LT:-/tmp/longtail}
cd "$(dirname "$0")/../.."
for i in 0 1 2 3; do node tools/rules-audit.mjs $S/data/chunk$i.json $S/out/$1.$i.json > /dev/null 2>$S/out/$1.$i.err & done; wait
node $S/tools/merge.mjs $S/out $1
