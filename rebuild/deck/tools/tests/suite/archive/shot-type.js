const OUT = '/tmp/claude-0/-home-user-Deck-Companion/74e967d5-8ea8-52f2-8f51-de9d671167f5/scratchpad/proto/out/';
await page.evaluate(async () => { await loadPreconLive('doom-prevails', 'Doom Prevails'); const d = S.draft; S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; S.view = 'decks'; S.open = true; S.tab = 'up'; await loadEdh(d.commander); render(); });
await page.waitForTimeout(800); await page.evaluate(() => document.querySelector('.typebar [data-v="Creature"]').click()); await page.waitForTimeout(300);
const el = await page.$('.typebar'); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await page.screenshot({path:OUT + 'typebar.png', clip:{x:0, y:Math.max(0, bx.y - 10), width:390, height:520}});
return await page.evaluate(() => ({sw:document.documentElement.scrollWidth}));
