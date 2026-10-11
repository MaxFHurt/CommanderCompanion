import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT
from game_ui import new_page, start_guided, continue_to_game, tap_curtain

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device, tag in ((PHONE, 'phone'), (IPAD, 'ipad')):
            page = await new_page(browser, device)
            await page.click('[data-act="profile"]'); await page.wait_for_selector('.profile__main'); await page.screenshot(path=f'{OUT}{tag}-profile2.png')
            await page.click('[data-act="back"]')
            await start_guided(page, ('white', 'simic', 'rakdos', 'red'))
            await continue_to_game(page)
            for _ in range(4):
                await page.wait_for_selector('text=opening hand'); await page.click('#keepHand'); await page.wait_for_selector('.curtain'); await tap_curtain(page)
            await page.wait_for_selector('.zone--hand .card')
            await page.evaluate("""async () => {
              const { getSession } = await import('./src/app/session.js');
              const s = getSession(), g = s.game, host = { playerId: null, isHost: true }, deviceMode = g.deviceMode;
              g.deviceMode = 'multi-device'; // test setup only: edit as a room host
              const put = (i, name, to = 'battlefield') => { const p = g.players[i]; const c = [...p.deck.remainingLibrary, ...p.deck.hand].find(c => g.cardDefinitions[c.definitionId].name === name); if (c) s.controller.dispatch({ type: 'edit', edit: { kind: 'move', instanceId: c.instanceId, to } }, host); };
              ['Plains','Plains','Plains','Sol Ring','Serra Angel','White Knight','Bonesplitter','Glorious Anthem','Soul Warden','Wall of Omens'].forEach(n => put(0, n));
              ['Forest','Island','Command Tower','Grizzly Bears','Air Elemental'].forEach(n => put(1, n));
              ['Swamp','Mountain','Badlands','Vampire Nighthawk','Raging Goblin'].forEach(n => put(2, n));
              ['Mountain','Mountain','Raging Goblin'].forEach(n => put(3, n));
              const tap = name => { const c = g.players[0].deck.battlefield.find(c => g.cardDefinitions[c.definitionId].name === name); s.controller.dispatch({ type: 'edit', edit: { kind: 'tap', instanceId: c.instanceId } }, host); };
              tap('Plains'); tap('Serra Angel');
              const k = g.players[0].deck.battlefield.find(c => g.cardDefinitions[c.definitionId].name === 'White Knight');
              s.controller.dispatch({ type: 'edit', edit: { kind: 'card-counter', instanceId: k.instanceId, counter: '+1/+1', delta: 2 } }, host);
              s.controller.dispatch({ type: 'edit', edit: { kind: 'poison', playerId: g.players[2].playerId, delta: 3 } }, host);
              g.deviceMode = deviceMode; s.actAs(s.actingAs());
            }""")
            await page.wait_for_timeout(300)
            await page.screenshot(path=f'{OUT}{tag}-game4.png')
            print(tag, page.errors[:4])
            await page.context.close()
        await browser.close()
asyncio.run(main())
