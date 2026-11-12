// node p.mjs "clause" "clause" ...   (SELFNAME = Test Card)
import { compileEffectText } from '../../src/engine/effects.js';
for (const t of process.argv.slice(2)) {
  const r = compileEffectText(t, { sourceName: 'Test Card' });
  console.log((r.supported ? 'OK  ' : 'NO  ') + t + '\n     fx ' + JSON.stringify(r.effects) + '\n     rq ' + JSON.stringify(r.requirements).slice(0, 600) + (r.unsupported.length ? '\n     un ' + JSON.stringify(r.unsupported) : ''));
}
