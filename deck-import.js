function cleanText(raw){return String(raw||'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n')}
function cleanHeading(line){return String(line||'').trim().replace(/^\[|\]$/g,'').replace(/^\/{1,2}\s*/,'').replace(/:$/,'').replace(/\s*\(\s*\d+\s*\)\s*$/,'').trim().toLowerCase()}
function sectionFor(line){
  const h=cleanHeading(line);
  if(/^(commander|commanders|command zone)$/.test(h))return 'commander';
  if(/^(deck|mainboard|main board|main deck|maindeck|library)$/.test(h))return 'deck';
  if(/^(sideboard|side board|maybeboard|maybe board|considering|tokens?|token deck|attractions?|stickers?|contraptions?)$/.test(h))return 'ignore';
  return null;
}
function stripCardMetadata(value){
  let s=String(value||'').trim();
  // ManaBox/plain-text exports commonly append set + collector number and optional finish markers.
  s=s.replace(/\s+\([A-Za-z0-9]+\)\s+[A-Za-z0-9★*._-]+(?:\s+\*[^*]+\*)?\s*$/,'');
  s=s.replace(/\s+\[[A-Za-z0-9]+(?::|\s)[A-Za-z0-9★*._-]+\]\s*$/,'');
  s=s.replace(/\s+\{(?:foil|etched|normal)\}\s*$/i,'');
  return s.trim();
}
function parseCardLine(line){
  const s=String(line||'').trim();
  let m=s.match(/^(\d+)\s*(?:[xX]\s*)?(.+?)$/);
  if(!m)m=s.match(/^(.+?)\s+[xX](\d+)$/);
  if(!m)return null;
  const qty=Math.max(1,Number(/^\d/.test(s)?m[1]:m[2])||1);
  const rawName=/^\d/.test(s)?m[2]:m[1];
  const name=stripCardMetadata(rawName);
  if(!name)return null;
  return {qty,name};
}
function createAccumulator(){return {rows:new Map(),order:[],commanders:[],ignored:0}}
function addCard(acc,name,qty,{commander=false}={}){
  const key=String(name).trim().toLowerCase();if(!key)return;
  if(!acc.rows.has(key)){acc.rows.set(key,{name:String(name).trim(),qty:0});acc.order.push(key)}
  acc.rows.get(key).qty+=Math.max(1,Number(qty)||1);
  if(commander&&!acc.commanders.some(x=>x.toLowerCase()===key))acc.commanders.push(String(name).trim());
}
function finish(acc,format){
  const rows=acc.order.map(k=>acc.rows.get(k)).filter(Boolean),totalCards=rows.reduce((n,r)=>n+r.qty,0);
  return {deckList:rows.map(r=>`${r.qty} ${r.name}`).join('\n'),commanders:acc.commanders.slice(0,2),totalCards,uniqueCards:rows.length,commanderCount:acc.commanders.slice(0,2).length,ignoredLines:acc.ignored,format};
}
export function parseManaBoxText(raw){
  const lines=cleanText(raw).split('\n'),acc=createAccumulator();let section='deck';
  for(const original of lines){
    const line=original.trim();if(!line)continue;
    const nextSection=sectionFor(line);if(nextSection){section=nextSection;continue}
    if(section==='ignore'){acc.ignored++;continue}
    const parsed=parseCardLine(line);if(!parsed){acc.ignored++;continue}
    addCard(acc,parsed.name,parsed.qty,{commander:section==='commander'});
  }
  return finish(acc,'text');
}
function parseCsvRows(raw){
  const text=cleanText(raw),rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(ch===','&&!quoted){row.push(cell);cell=''}
    else if(ch==='\n'&&!quoted){row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);row=[];cell=''}
    else cell+=ch;
  }
  row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);return rows;
}
function headerKey(x){return String(x||'').trim().toLowerCase().replace(/[ _-]+/g,' ')}
function truthyFlag(x){return /^(1|true|yes|y|commander)$/i.test(String(x||'').trim())}
export function parseManaBoxCsv(raw){
  const rows=parseCsvRows(raw);if(!rows.length)return finish(createAccumulator(),'csv');
  const headers=rows.shift().map(headerKey),find=(...names)=>headers.findIndex(h=>names.map(headerKey).includes(h));
  const ni=find('name','card name','card'),qi=find('quantity','qty','count'),bi=find('board','section','type','deck','category','zone'),ci=find('commander','is commander','iscommander');
  if(ni<0)return parseManaBoxText(raw);
  const acc=createAccumulator();
  for(const r of rows){
    const name=stripCardMetadata(r[ni]);if(!name)continue;
    const qty=Math.max(1,Number(qi>=0?r[qi]:1)||1),board=String(bi>=0?r[bi]:'').trim().toLowerCase();
    if(/side|maybe|consider|token|attraction|sticker|contraption/.test(board)){acc.ignored++;continue}
    const commander=/commander|command zone/.test(board)||(ci>=0&&truthyFlag(r[ci]));
    addCard(acc,name,qty,{commander});
  }
  return finish(acc,'csv');
}
export function parseManaBoxFileContents(name,raw){
  const text=String(raw||'');
  const looksCsv=/\.csv$/i.test(String(name||''))||/^\s*(?:"?(?:name|quantity|qty|count|card name)"?\s*,)/i.test(text);
  return looksCsv?parseManaBoxCsv(text):parseManaBoxText(text);
}
