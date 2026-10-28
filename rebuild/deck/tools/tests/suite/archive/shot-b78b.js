const OUT = '/tmp/claude-0/-home-user-Deck-Companion/74e967d5-8ea8-52f2-8f51-de9d671167f5/scratchpad/proto/out/' + (process.env.PHONE ? 'p78-' : 'i78-');
await page.evaluate(async () => { S.syncRecs = true; await loadPreconLive('doom-prevails', 'Doom Prevails'); }); await page.waitForTimeout(2500); await page.screenshot({path:OUT + 'ask.png'});
await page.evaluate(async () => { document.querySelector('[data-act="ua-done"]').click(); const d = cur(); S.profile.decks.unshift(d); S.draft = null; S.deckId = d.id; await loadThemes(d.commander, d.aims); for (let i = 0; i < 80 && !apexFor(d); i++) await new Promise(r => setTimeout(r, 100)); S.tab = 'up'; render(); });
const kb = await page.$('.typebar'); if (kb) await kb.scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({path:OUT + 'up.png'});
const pth = await page.$('.paths .path'); if (pth){ await pth.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await pth.screenshot({path:OUT + 'path.png'}); }
await page.evaluate(async () => { const b = [...document.querySelectorAll('.paths [data-act="alts"]')]; for (const x of b.slice(0, 8)){ x.click(); for (let i = 0; i < 50 && /Finding/.test(document.querySelector('#modal').textContent); i++) await new Promise(r => setTimeout(r, 100)); if (document.querySelector('#modal .opt.alt')) break; } });
await page.waitForTimeout(1500); await page.screenshot({path:OUT + 'alts.png'});
await page.evaluate(() => { $('#modal').hidden = true; openMechList(); }); await page.waitForTimeout(300); await page.screenshot({path:OUT + 'mech.png'});
return {sw:await page.evaluate(() => document.documentElement.scrollWidth)};
