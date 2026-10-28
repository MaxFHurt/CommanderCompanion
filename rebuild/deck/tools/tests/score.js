// Scores the engine against the workbook's pending picks for all five decks.
const {run,ctx,edh,deck,fs}=require('./harness.js');const WB=JSON.parse(fs.readFileSync(__dirname+'/workbook.json'));const V=process.argv.includes('-v'),only=process.argv.find(a=>a.startsWith('--deck='));
let T={slots:0,slotHit:0,cards:0,cardHit:0,sameSlot:0,app:0,loops:0,budgetOff:0,illegalWb:0,notFound:0};const lines=[];
for(const [name,w] of Object.entries(WB)){ if(only&&!name.toLowerCase().includes(only.slice(7).toLowerCase()))continue;
  const text='Commander\n1 '+w.commander+'\n\nDeck\n'+w.deck.map(x=>x[0]+' '+x[1]).join('\n');const d=deck(text,{dismissed:w.removed});const ne=edh(d.commander);ctx.__d=d;
  const R=run(`(()=>{const A=analyze(__d),R=upgradePaths(__d);return {unknown:A.unknown,uni:A.ctx.uni?[...A.ctx.uni]:null,aims:__d.aims,tribe:A.ctx.tribe,paths:R.paths.map(L=>({cut:L.cut,opts:Object.fromEntries(Object.keys(L.opts).map(t=>[t,{n:L.opts[t].add,sc:(find(L.opts[t].add)||{}).sc,p:(find(L.opts[t].add)||{}).p,g:+L.opts[t].gain.toFixed(1)}]))}))}})()`);
  const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(' // ')[0].replace(/[^a-z0-9]/g,'');
  const appAdds=new Map();R.paths.forEach(L=>Object.entries(L.opts).forEach(([t,o])=>appAdds.set(norm(o.n),{cut:L.cut,t})));
  const wbCards=[];w.recs.forEach(r=>['budget','mid','apex'].forEach(t=>{if(r[t])wbCards.push({cut:r.cut,t,n:r[t]})}));
  ctx.__wn=wbCards.map(x=>x.n);const meta=run(`__wn.map(n=>{const c=find(n);if(!c)return {nf:1};const id=ctxOf(__d).ident;return {ok:c.cmd&&c.ci.every(k=>id.includes(k)),p:c.p,sc:c.sc}})`);
  let slotHit=0,cardHit=0,same=0;const appCuts=new Set(R.paths.map(L=>norm(L.cut)));w.recs.forEach(r=>{if(appCuts.has(norm(r.cut)))slotHit++});
  const miss=[];wbCards.forEach((x,i)=>{const m=meta[i];if(m.nf){T.notFound++;return;}if(!m.ok){T.illegalWb++;return;}T.cards++;const a=appAdds.get(norm(x.n));if(a){cardHit++;if(norm(a.cut)===norm(x.cut))same++;}else miss.push(x.t[0]+':'+x.n);});
  const loops=[...appAdds.keys()].filter(k=>w.removed.some(r=>norm(r)===k)).length;
  const bOff=R.paths.filter(L=>L.opts.budget&&R.uni&&!R.uni.includes(L.opts.budget.sc)).length;
  T.slots+=w.recs.length;T.slotHit+=slotHit;T.cardHit+=cardHit;T.sameSlot+=same;T.app+=appAdds.size;T.loops+=loops;T.budgetOff+=bOff;
  lines.push(name.padEnd(18)+' edh '+String(ne).padStart(3)+' | aims '+R.aims.join(',')+(R.tribe?'('+R.tribe+')':'')+' | app paths '+String(R.paths.length).padStart(2)+' adds '+String(appAdds.size).padStart(2)+' | slots hit '+slotHit+'/'+w.recs.length+' | cards hit '+cardHit+' (same slot '+same+') | loops '+loops+(R.unknown.length?' | unknown '+R.unknown.length:''));
  if(V){lines.push('   missed: '+miss.join('; '));R.paths.forEach(L=>lines.push('   '+L.cut+' => '+Object.entries(L.opts).map(([t,o])=>t[0]+':'+o.n+'('+o.g+')').join(', ')));}
}
console.log(lines.join('\n'));console.log('TOTAL  workbook cards (legal, known): '+T.cards+' | app found '+T.cardHit+' ('+Math.round(100*T.cardHit/T.cards)+'%), same slot '+T.sameSlot+' | slots hit '+T.slotHit+'/'+T.slots+' | app adds '+T.app+' | loops '+T.loops+' | budget picks outside universe '+T.budgetOff+' | workbook picks illegal '+T.illegalWb+', not on Scryfall '+T.notFound);
