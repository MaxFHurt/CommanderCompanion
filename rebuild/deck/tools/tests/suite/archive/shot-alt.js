const OUT = '/tmp/claude-0/-home-user-Deck-Companion/74e967d5-8ea8-52f2-8f51-de9d671167f5/scratchpad/proto/out/';
await page.evaluate(async () => { const g = startPlan('Doctor Doom, King of Latveria', []); S.profile.decks.unshift(g); S.draft = null; S.deckId = g.id; S.view = 'decks'; S.open = true; S.tab = 'up'; render(); });
await page.waitForTimeout(500);
const el = await page.$('.paths.plan .path:nth-child(3)'); if (el){ await el.scrollIntoViewIfNeeded(); await el.screenshot({path:OUT + 'alt-plan-card.png'}); }
await page.evaluate(() => { const b = [...document.querySelectorAll('.paths.plan [data-act="alts"]')][3]; b.click(); });
for (let i = 0; i < 50 && await page.evaluate(() => /Finding cards/.test(document.querySelector('#modal').textContent)); i++) await page.waitForTimeout(100);
await page.screenshot({path:OUT + 'alt-modal.png'});
return await page.evaluate(() => ({w:document.documentElement.scrollWidth, vw:innerWidth, txt:document.querySelector('#modal').innerText.slice(0, 600)}));
