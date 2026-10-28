// Proves two versions of a script are the same program (flattening, 19 Oct): both are parsed and their syntax trees compared,
// ignoring layout, comments, quote style and optional brackets. Prints SAME or the first difference.
// node samecode.js <old.js> <new.js> | node samecode.js <oldDir> <newDir> engine.js ui.js work.js
// With several new files (a split file), list them joined by '+': node samecode.js old/ui.js new/ui-a.js+new/ui-b.js
const fs = require('fs'), path = require('path');
const ts = require(process.env.TS || '/opt/node22/lib/node_modules/typescript');
function flat(code, name){ const sf = ts.createSourceFile(name, code, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS), out = [];
  const walk = n => { if (n.kind === ts.SyntaxKind.ParenthesizedExpression) return walk(n.expression); if (n.kind === ts.SyntaxKind.EndOfFileToken) return;   // split files: no end-of-file marks
    const k = ts.SyntaxKind[n.kind];
    if (ts.isIdentifier(n) || ts.isPrivateIdentifier(n)) out.push(k + ':' + n.text);
    else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push('Str:' + JSON.stringify(n.text));
    else if (ts.isNumericLiteral(n)) out.push('Num:' + Number(n.text));
    else if (ts.isRegularExpressionLiteral(n)) out.push('Re:' + n.text);
    else if (n.kind >= ts.SyntaxKind.TemplateHead && n.kind <= ts.SyntaxKind.TemplateTail) out.push(k + ':' + JSON.stringify(n.text));
    else if (ts.isBinaryExpression(n)) { out.push('Bin:' + ts.tokenToString(n.operatorToken.kind)); }
    else if (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) out.push(k + ':' + ts.tokenToString(n.operator));
    else out.push(k);
    ts.forEachChild(n, walk); out.push('/'); };
  ts.forEachChild(sf, walk); return out; }
function compare(a, b, label){ let i = 0; while (i < a.length && a[i] === b[i]) i++;
  if (i === a.length && i === b.length){ console.log('SAME ' + label + ' (' + a.length + ' nodes)'); return true; }
  console.log('DIFFERENT ' + label + ' at node ' + i + ': ' + a.slice(Math.max(0, i - 6), i + 4).join(' ') + '  |vs|  ' + b.slice(Math.max(0, i - 6), i + 4).join(' ')); return false; }
const [A, B, ...files] = process.argv.slice(2); let ok = true;
if (files.length) for (const f of files){ const nb = f.split('+'); ok = compare(flat(fs.readFileSync(path.join(A, f), 'utf8'), f), nb.flatMap(x => flat(fs.readFileSync(path.join(B, x), 'utf8'), x)), f) && ok; }
else ok = compare(flat(fs.readFileSync(A, 'utf8'), A), B.split('+').flatMap(x => flat(fs.readFileSync(x, 'utf8'), x)), A + ' vs ' + B);
process.exitCode = ok ? 0 : 1;
