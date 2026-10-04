// Reformat JS with the TypeScript printer (keeps comments, one statement per line).
const ts=require('/opt/npm-tools/node_modules/typescript');const fs=require('fs');
for(const f of process.argv.slice(2)){
  const src=fs.readFileSync(f,'utf8');
  const sf=ts.createSourceFile(f,src,ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);
  const out=ts.createPrinter({newLine:ts.NewLineKind.LineFeed,removeComments:false}).printFile(sf);
  fs.writeFileSync(f,out.replace(/^( {4})+/gm,m=>'  '.repeat(m.length/4)));
}
