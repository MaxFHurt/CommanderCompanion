#!/bin/sh
S=${LT:-/tmp/longtail}
for i in 0 1 2 3; do node $S/tools/clauses.mjs $S/out/$1.json $i 4 $S/out/$1.cl$i.json & done; wait
node $S/tools/group.mjs $1
