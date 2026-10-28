await page.evaluate(async () => { await loadPreconLive('doom-prevails', 'Doom Prevails'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; await loadEdh(d.commander); await loadThemes(d.commander, d.aims); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); S.tab = 'up'; render(); });
const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', {rate:4});
const t = await page.evaluate(() => { const t0 = performance.now(); recsFor.k = null; render(); return Math.round(performance.now() - t0); });
const t2 = await page.evaluate(() => { const b = document.querySelector('.paths [data-act="swap"]'); const t0 = performance.now(); b.click(); return Math.round(performance.now() - t0); });
return {renderUpgradesMs4x:t, swapMs4x:t2};
