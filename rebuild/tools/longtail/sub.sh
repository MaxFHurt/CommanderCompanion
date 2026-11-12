#!/bin/sh
# usage: sub.sh <names.txt> <tag>  — audit just the named cards; prints the ones still by hand
S=${LT:-/tmp/longtail}
node -e "
const fs=require('fs');const names=new Set(fs.readFileSync('$1','utf8').split('\n').map(l=>l.split(' :: ')[0]).filter(Boolean));
let all=[];for(let i=0;i<4;i++)all.push(...JSON.parse(fs.readFileSync('$S/data/chunk'+i+'.json')));
all=all.filter(c=>names.has(c.name));for(let i=0;i<4;i++)fs.writeFileSync('$S/data/sub'+i+'.json',JSON.stringify(all.filter((_,j)=>j%4===i)));"
cd "$(dirname "$0")/../.."
for i in 0 1 2 3; do node tools/rules-audit.mjs $S/data/sub$i.json $S/out/$2.s$i.json > /dev/null 2>$S/out/$2.s$i.err & done; wait
node -e "
const fs=require('fs');let rows=[];for(let i=0;i<4;i++)rows.push(...JSON.parse(fs.readFileSync('$S/out/$2.s'+i+'.json')).cards);
const bad=rows.filter(r=>!r.automated);
fs.writeFileSync('$S/out/$2.still.txt',bad.map(r=>r.name+' :: '+r.gaps.join(' | ')).join('\n'));
fs.writeFileSync('$S/out/$2.okay.txt',rows.filter(r=>r.automated).map(r=>r.name).join('\n'));
console.log(rows.length+' audited, '+bad.length+' by hand, '+(rows.length-bad.length)+' automatic');"
cat $S/out/$2.s*.err | head -3
