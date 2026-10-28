// Test harness: runs Deck Companion's engine in Node against the card-data snapshot.
const fs=require('fs'),vm=require('vm'),zlib=require('zlib'),W=process.env.WEB||__dirname+'/../..',D=process.env.DATA||__dirname+'/data';
const ctx=vm.createContext({console,Math,JSON,Set,Map,Date,RegExp,Object,Array,String,Number,Infinity,isNaN,parseFloat,parseInt});
for(const f of ['data.js','lists.js','engine.js']) vm.runInContext(fs.readFileSync(W+'/'+f,'utf8'),ctx,{filename:f});
const run=c=>vm.runInContext(c,ctx);
ctx.__raw=JSON.parse(zlib.gunzipSync(fs.readFileSync(D+'/cards.json.gz')));ctx.__tags=JSON.parse(fs.readFileSync(D+'/tags.json'));
run(`const __rows=[];for(const o of __raw){const c=fromScryfall(o);if(c)__rows.push(c);} const __best=new Map();for(const c of __rows){const k=norm(c.n),o=__best.get(k);if(!o||(o.p==null&&c.p!=null))__best.set(k,c);} buildIndex(mergeLibrary(typeof STARTER!=='undefined'?STARTER:[],[...__best.values()])); BTAGS={mld:new Set(__tags.mld.map(norm)),turns:new Set(__tags.turns.map(norm)),v:1};`);
const slug=n=>String(n).split(' // ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 -]/g,'').trim().replace(/\s+/g,'-');
function edh(name){const f=D+'/edhrec/'+slug(name)+'.json';if(!fs.existsSync(f)){run(`EDH={key:'',map:null,decks:0,state:'fail'}`);return 0;}const j=JSON.parse(fs.readFileSync(f)),seen=new Map();let decks=0;
 ((j.container&&j.container.json_dict&&j.container.json_dict.cardlists)||[]).forEach(L=>(L.cardviews||[]).forEach(v=>{if(!v.name||!v.potential_decks)return;decks=Math.max(decks,v.potential_decks);const inc=Math.min(1,v.num_decks/v.potential_decks),old=seen.get(v.name);if(!old||inc>old[1])seen.set(v.name,[v.name,+inc.toFixed(3),+(v.synergy||0).toFixed(3)]);}));
 ctx.__er=[...seen.values()];ctx.__ek=name;ctx.__ed=decks;run(`EDH={key:find(__ek).n,map:new Map(__er.map(r=>[norm(r[0]),{inc:r[1],syn:r[2]}])),decks:__ed,state:'ok'}`);return seen.size;}
function deck(text,extra){ctx.__t=text;ctx.__x=extra||{};return run(`(()=>{const r=parseDeckText(__t),d=Object.assign({id:'t',name:'t',format:'commander',commander:'',tier:'budget',aims:[],tribe:'',colors:[],cards:r.cards,dismissed:[]},__x);setCommander(d,r.commander);if(r.partner)setPartner(d,r.partner);return d;})()`);}
module.exports={run,ctx,edh,deck,fs};
