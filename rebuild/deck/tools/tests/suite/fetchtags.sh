#!/bin/sh
# Build 145: download the EDHREC theme pages (tribe and theme, in each test commander's colours) that the no-play-data checks
# use (genstrong.js with FALL=1 NOEDH=1, UI-B145-01), into proto/data2/tags. Usage: sh fetchtags.sh <work dir> (as setup.sh).
W=${1:-/tmp/dc3}; cd "$W/proto/tests" && mkdir -p ../data2/tags
node -e "process.argv=[process.argv[0],'x',require('path').resolve('../candidate'),'g','all','--quiet']; const B=require('./bench.js'),H=B.H,run=H.run,X=H.ctx; const out=new Set();
for (const s of ['tuneall','test','holdout']) for (const [slug] of B.SETS[s]){ const pd=H.retail(slug); X.__n=pd.commander; X.__p=pd.partner||''; run('fallTags(__n, __p)').forEach(f=>out.add(f.path)); }
console.log([...out].join('\n'));" | while read p; do f=../data2/tags/$(echo $p | tr / _).json; [ -s "$f" ] || curl -s -o "$f" "https://json.edhrec.com/pages/tags/$p.json"; sleep 0.3; done
ls ../data2/tags | wc -l
