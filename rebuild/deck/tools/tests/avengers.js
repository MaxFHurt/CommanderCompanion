const {run,ctx,edh,deck,fs}=require('./harness.js');
const d=deck(fs.readFileSync(__dirname+'/avengers.txt','utf8'),{dismissed:(process.env.DISMISS||'').split('|').filter(Boolean)});
console.log('edhrec cards for commander:',edh(d.commander));ctx.__d=d;
const out=run(`(()=>{const A=analyze(__d),c=A.ctx,R=upgradePaths(__d),f=n=>{const x=find(n);return x?n+' ['+(x.sc||'?')+' $'+(x.p==null?'?':x.p)+' r'+(x.r||'-')+']':n+' [??]'};
return {cmd:c.cmd.n+' :: '+c.cmd.o.replace(/\\n/g,' / ').slice(0,300),aims:__d.aims,tribe:c.tribe,uni:c.uni?[...c.uni]:null,size:A.size,unknown:A.unknown,roles:A.roles,lands:A.lands,
 fixes:R.fixes.map(p=>p.cut+' -> '+p.add),drops:R.drops.map(x=>x.n),
 paths:R.paths.map(L=>f(L.cut)+'\\n'+Object.keys(L.opts).map(t=>'     '+t.padEnd(6)+' '+f(L.opts[t].add)+' gain '+L.opts[t].gain.toFixed(1)+(L.opts[t].cross?' CROSS':'')+' | '+L.opts[t].why.join(', ')).join('\\n'))};})()`);
console.log(JSON.stringify(Object.assign({},out,{paths:undefined}),null,1));console.log(out.paths.join('\n'));
