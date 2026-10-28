const {run,ctx,edh,deck,fs}=require('./harness.js');const WB=JSON.parse(fs.readFileSync(__dirname+'/workbook.json'));
console.log(run(`LIB.filter(c=>/monitoring station|repulsor|spy satellite|^okoye|^shredder|^killmonger/i.test(c.n)).map(c=>c.n+' ['+c.sc+']').join(' | ')`));
let wI=[],aI=[],wOver=0,wN=0,aN=0;
for(const [name,w] of Object.entries(WB)){const d=deck('Commander\n1 '+w.commander+'\n\nDeck\n'+w.deck.map(x=>x[0]+' '+x[1]).join('\n'),{dismissed:w.removed});if(!edh(d.commander))continue;ctx.__d=d;ctx.__recs=w.recs;
 const r=run(`(()=>{const cx=ctxOf(__d),inc=n=>{const c=find(n);return c?((cx.edh.map.get(c._n)||{}).inc||0):null};const R=upgradePaths(__d);const app=R.paths.flatMap(p=>Object.values(p.opts).map(o=>inc(o.add)));const wb=[];let over=0;__recs.forEach(r=>['budget','mid','apex'].forEach(t=>{if(!r[t])return;const c=find(r[t]);if(!c)return;wb.push(inc(r[t]));if(c.p>TIERS[t].cap)over++;}));return {app,wb,over}})()`);
 const avg=a=>Math.round(100*a.reduce((s,x)=>s+x,0)/a.length);console.log(name.padEnd(18),'app picks',r.app.length,'avg inclusion',avg(r.app)+'%','zero-inclusion',r.app.filter(x=>!x).length,'| workbook picks',r.wb.length,'avg inclusion',avg(r.wb)+'%','zero-inclusion',r.wb.filter(x=>!x).length,'over price cap',r.over);
 wI=wI.concat(r.wb);aI=aI.concat(r.app);wOver+=r.over;}
const avg=a=>Math.round(100*a.reduce((s,x)=>s+x,0)/a.length);console.log('ALL: app avg',avg(aI)+'% ('+aI.filter(x=>!x).length+'/'+aI.length+' never played with that commander) | workbook avg',avg(wI)+'% ('+wI.filter(x=>!x).length+'/'+wI.length+' never played), over cap',wOver);
