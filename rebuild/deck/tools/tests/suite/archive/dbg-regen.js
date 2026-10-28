await page.evaluate(() => { S.noAsk = true; });
const r = await page.evaluate(async () => { await loadPreconLive('doom-prevails', 'Doom Prevails'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); await loadThemes(d.commander, d.aims); render();
  for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); render(); await new Promise(r => setTimeout(r, 300)); render();
  const snap = () => recsFor(d).paths.map(L => L.cut + ':' + Object.entries(L.opts).map(([t, p]) => t[0] + (p.held ? '*' : '') + '=' + p.add.slice(0, 14) + '(' + p.dScore + ')').join(','));
  const A = snap(), heldA = Object.keys(d.recP || {}).length, sc = recsFor(d).scored; await doRegen(); $('#modal').hidden = true; await new Promise(r => setTimeout(r, 500)); render(); const B = snap();
  return {nA:A.length, nB:B.length, heldA, heldB:Object.keys(d.recP || {}).length, scA:sc, scB:recsFor(d).scored, onlyA:A.filter(x => !B.some(y => y.split(':')[0] === x.split(':')[0])), onlyB:B.filter(x => !A.some(y => y.split(':')[0] === x.split(':')[0]))}; });
return r;
