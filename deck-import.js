export function parseManaBoxText(raw){
  const lines=String(raw||'').replace(/^\uFEFF/,'').split(/\r?\n/),out=[],commanders=[];let section='deck';
  for(const original of lines){
    const line=original.trim();if(!line)continue;
    const heading=line.toLowerCase().replace(/:$/,'');
    if(['commander','commanders'].includes(heading)){section='commander';continue}
    if(['deck','mainboard','main deck','maindeck'].includes(heading)){section='deck';continue}
    if(['sideboard','maybeboard','considering','tokens'].includes(heading)){section='ignore';continue}
    if(section==='ignore')continue;
    const m=line.match(/^(\d+)\s*[xX]?\s+(.+?)(?:\s+\([A-Z0-9]+\)\s+[A-Za-z0-9★]+)?(?:\s+\*[^*]+\*)?$/);
    if(!m)continue;
    const qty=Math.max(1,Number(m[1])||1),name=m[2].trim();out.push(`${qty} ${name}`);
    if(section==='commander')for(let i=0;i<qty;i++)commanders.push(name);
  }
  return {deckList:out.join('\n'),commanders:[...new Set(commanders)].slice(0,2)};
}

export function parseManaBoxCsv(raw){
  const text=String(raw||'').replace(/^\uFEFF/,'');const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}
    else if(ch===','&&!quoted){row.push(cell);cell=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);row=[];cell=''}
    else cell+=ch;
  }
  row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);
  if(!rows.length)return {deckList:'',commanders:[]};
  const headers=rows.shift().map(x=>x.trim().toLowerCase());const col=(...names)=>headers.findIndex(h=>names.includes(h));
  const ni=col('name','card name','card'),qi=col('quantity','qty','count'),bi=col('board','section','type','deck');
  if(ni<0)return parseManaBoxText(text);
  const deck=[],commanders=[];
  for(const r of rows){
    const name=String(r[ni]||'').trim();if(!name)continue;
    const qty=Math.max(1,Number(r[qi]||1)||1),board=String(r[bi]||'').trim().toLowerCase();
    if(/side|maybe|consider|token/.test(board))continue;
    deck.push(`${qty} ${name}`);if(/commander/.test(board))for(let i=0;i<qty;i++)commanders.push(name);
  }
  return {deckList:deck.join('\n'),commanders:[...new Set(commanders)].slice(0,2)};
}

export function parseManaBoxFileContents(name,raw){
  return /\.csv$/i.test(String(name||''))||/^\s*(name|quantity|qty|count)\s*,/i.test(String(raw||''))?parseManaBoxCsv(raw):parseManaBoxText(raw);
}
