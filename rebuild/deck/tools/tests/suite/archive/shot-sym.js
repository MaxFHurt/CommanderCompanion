const OUT = '/tmp/claude-0/-home-user-Deck-Companion/74e967d5-8ea8-52f2-8f51-de9d671167f5/scratchpad/proto/out/';
await page.evaluate(() => { S.view = 'search'; render(); openCard('Don & Leo, Problem Solvers'); });
await page.waitForTimeout(2500);
const dl = await page.$('#modal dl') || await page.$('#modal'); await dl.screenshot({path:OUT + 'sym.png'});
return await page.evaluate(() => ({cost:find('Don & Leo, Problem Solvers').m, imgs:[...document.querySelectorAll('#modal img.ms')].map(i => i.alt + ':' + (i.complete && i.naturalWidth > 0)), fallback:document.querySelectorAll('#modal .pip').length}));
