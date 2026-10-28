const {run,ctx,edh,deck,fs}=require('./harness.js');const WB=JSON.parse(fs.readFileSync(__dirname+'/workbook.json'));
for(const [name,w] of Object.entries(WB)){const text='Commander\n1 '+w.commander+'\n\nDeck\n'+w.deck.map(x=>x[0]+' '+x[1]).join('\n');const d=deck(text,{dismissed:w.removed});edh(d.commander);ctx.__d=d;ctx.__recs=w.recs;
 console.log('\n=== '+name+' ===');
 console.log(run(`(()=>{const L=[],A=analyze(__d);if(A.unknown.length)L.push('unknown deck cards: '+A.unknown.join('; '));
 const R=upgradePaths(__d),got=new Set(R.paths.flatMap(p=>Object.values(p.opts).map(o=>norm(o.add))));
 __recs.forEach(r=>{['budget','mid','apex'].forEach(t=>{if(!r[t])return;const a=find(r[t]),c=find(r.cut);if(!a||!c){L.push(t[0]+' '+r.cut+' -> '+r[t]+'  [card not found: '+(!a?r[t]:r.cut)+']');return;}
  const d2=Object.assign({},__d,{tier:t}),cx=ctxOf(d2),ba=baseScore(a,d2,cx),bc=baseScore(c,d2,cx),inc=x=>cx.edh?Math.round(100*((cx.edh.map.get(x._n)||{}).inc||0)):-1;
  L.push((got.has(a._n)?'HIT  ':'miss ')+t[0]+' '+r.cut.slice(0,26).padEnd(26)+' s'+bc.s.toFixed(1).padStart(5)+' own'+(bc.s-bc.a).toFixed(1).padStart(5)+' inc'+String(inc(c)).padStart(3)+' '+mainType(c).slice(0,4)+' ['+jobsOf(c.n).join('/')+']  ->  '+r[t].slice(0,30).padEnd(30)+' s'+ba.s.toFixed(1).padStart(5)+' own'+(ba.s-ba.a).toFixed(1).padStart(5)+' inc'+String(inc(a)).padStart(3)+' $'+String(a.p).padEnd(6)+' '+a.sc.padEnd(4)+' '+mainType(a).slice(0,4)+' ['+jobsOf(a.n).join('/')+'] gain '+(ba.s-bc.s).toFixed(1)+(cx.uni&&t==='budget'&&!cx.uni.has(a.sc)?' NOT-IN-UNIVERSE':'')+(a.p>TIERS[t].cap?' OVER-CAP':''));});});
 return L.join('\\n')})()`));}
