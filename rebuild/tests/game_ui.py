"""Playwright checks for Guided Play on one device. Needs the static server on port 4180."""
import asyncio, json, os, subprocess, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT, URL

FIX = json.loads(subprocess.check_output(['node', '-e', "import('./tests/fixtures/cards.mjs').then(m=>console.log(JSON.stringify({cards:m.CARDS,decks:m.DECKS})))"], cwd=os.path.join(os.path.dirname(__file__), '..')))
BY_NAME = {}
for c in FIX['cards']:
    BY_NAME[c['name'].lower()] = c
    for f in c.get('card_faces', []) or []:
        BY_NAME.setdefault(f['name'].lower(), c)


async def jewel_go(page):
    """Press the jewel; if it lays out options, take the one matching its label."""
    label = (await page.locator('.jewel span').text_content()).strip()
    await page.click('.jewel')
    await page.wait_for_timeout(150)
    act = {'PASS': 'pass', 'ATTACK': 'attack'}.get(label)
    if act and await page.locator('.jewel-options').count():
        await page.click(f'.jewel-options [data-opt-act="{act}"]')


async def mock_scryfall(page):
    async def collection(route):
        body = json.loads(route.request.post_data or '{}')
        found, missing = [], []
        for ident in body.get('identifiers', []):
            c = BY_NAME.get(str(ident.get('name', '')).lower())
            (found if c else missing).append(c or ident)
        await route.fulfill(json={'data': found, 'not_found': missing})

    async def named(route):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(route.request.url).query)
        name = (q.get('exact') or q.get('fuzzy') or [''])[0].lower()
        c = BY_NAME.get(name)
        await (route.fulfill(json=c) if c else route.fulfill(status=404, json={'object': 'error'}))

    async def search(route):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(route.request.url).query).get('q', [''])[0].lower().replace('name:', '').strip('"')
        rows = [c for c in FIX['cards'] if q in c['name'].lower()]
        await (route.fulfill(json={'data': rows}) if rows else route.fulfill(status=404, json={'object': 'error'}))

    await page.route('https://api.scryfall.com/cards/collection', collection)
    await page.route('https://api.scryfall.com/cards/named**', named)
    await page.route('https://api.scryfall.com/cards/search**', search)
    await page.route('https://mtgjson.com/**', lambda r: r.abort())
    await page.route('https://unpkg.com/**', lambda r: r.abort())


async def new_page(browser, device, query=''):
    ctx = await browser.new_context(**device)
    page = await ctx.new_page()
    page.errors = []
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text and 'fixture://' not in m.text and 'ERR_UNKNOWN_URL_SCHEME' not in m.text else None)
    page.on('pageerror', lambda e: page.errors.append('PAGEERROR ' + str(e)))
    await mock_scryfall(page)
    await page.goto(URL + query)
    await page.wait_for_function('window.__ccReady === true', timeout=15000)
    return page


async def fill_seat(page, name, deck_key):
    deck = FIX['decks'][deck_key]
    await page.fill('[data-field="name"]', name)
    await page.click('[data-seat-act="paste"]')
    await page.fill('[data-list]', deck['list'])
    await page.fill('[data-name]', deck_key.title() + ' deck')
    await page.click('.modal .btn--confirm')
    await page.fill('[data-field="commander1"]', deck['commander'])


async def start_guided(page, decks=('white', 'simic'), mode='fully-tracked', names=('Aaron', 'Lex', 'Charlie', 'Diana')):
    await page.click('[data-act="start"]')
    await page.click(f'[data-mode="{mode}"]')
    await page.click('[data-play="local"]')
    await page.wait_for_selector('.setup')
    for i, d in enumerate(decks):
        if i >= 2:
            await page.click('[data-act="add"]')
        await page.click(f'.setup__tab[data-seat="{i}"]')
        await fill_seat(page, names[i], d)
    return page


async def continue_to_game(page, first=0):
    await page.click('[data-act="start"]')
    await page.wait_for_selector('text=Setup check', timeout=15000)
    await page.click('.modal .btn--confirm')
    await page.wait_for_selector('.rules-editor')
    await page.click(f'[data-first-pick="{first}"]')
    await page.click('.modal .btn--confirm')
    await page.wait_for_selector('.game')


async def tap_curtain(page):
    if await page.locator('.curtain').count():
        await page.click('.curtain')


async def pass_all(page, limit=8):
    """Tap through hand-off screens and pass priority until the game waits for something else."""
    for _ in range(limit):
        await page.wait_for_timeout(250)
        await tap_curtain(page)
        if await page.locator('.modal').count():
            return
        jewel = page.locator('.jewel:not([disabled]) span')
        if await jewel.count() and (await jewel.text_content()).strip() == 'PASS':
            await jewel_go(page)
        else:
            return


results = []
def check(label, cond, detail=''):
    results.append(bool(cond))
    print(('  ok  ' if cond else 'FAIL  ') + label + ('' if cond else f' {detail}'))


async def flow(browser, device, tag):
    page = await new_page(browser, device)
    await start_guided(page)
    await page.screenshot(path=f'{OUT}{tag}-setup.png')
    await continue_to_game(page)
    await page.wait_for_selector('text=opening hand')
    await page.screenshot(path=f'{OUT}{tag}-opening.png')
    check('opening hand shows 7 cards', await page.locator('.modal .card').count() == 7)
    await page.click('#keepHand')
    await page.wait_for_selector('.curtain')
    await page.screenshot(path=f'{OUT}{tag}-curtain.png')
    await tap_curtain(page)
    await page.wait_for_selector('text=opening hand')
    await page.click('#keepHand')
    await page.wait_for_selector('.curtain')
    await tap_curtain(page)
    await page.wait_for_selector('.zone--hand .card')
    check('hand has 8 cards after draw', await page.locator('.zone--hand .card').count() == 8, str(await page.locator('.zone--hand .card').count()))
    check('phase is Main 1', 'Main 1' in await page.locator('.phase-box').text_content())
    await page.screenshot(path=f'{OUT}{tag}-game-start.png')

    # Build a board through the host tools API to get a rich screenshot.
    await page.evaluate("""async () => {
      const { getSession } = await import('./src/app/session.js');
      const s = getSession(), g = s.game;
      const find = (p, name) => [...p.deck.remainingLibrary, ...p.deck.hand].find(c => g.cardDefinitions[c.definitionId].name === name);
      const put = (i, name, to = 'battlefield') => { const c = find(g.players[i], name); if (c) s.controller.dispatch({ type: 'edit', edit: { kind: 'move', instanceId: c.instanceId, to } }, { playerId: null, isHost: true }); };
      for (const n of ['Plains', 'Plains', 'Plains', 'Plains', 'Sol Ring', 'Serra Angel', 'White Knight', 'Soul Warden', 'Glorious Anthem']) put(0, n);
      for (const n of ['Forest', 'Island', 'Forest', 'Grizzly Bears', 'Colossal Dreadmaw', 'Llanowar Elves']) put(1, n);
      for (const n of ['Swords to Plowshares', "Healer's Hawk", 'Day of Judgment']) put(0, n, 'hand');
      put(1, 'Giant Growth', 'hand');
      // Treat the test board as if it had been there since earlier turns (no summoning sickness).
      for (const p of g.players) for (const c of p.deck.battlefield) { c.enteredTurn = 0; c.controlSinceTurn = 0; }
      s.controller.dispatch({ type: 'edit', edit: { kind: 'note', text: 'Test board ready' } }, { playerId: null, isHost: true });
    }""")
    await page.wait_for_timeout(300)
    await page.screenshot(path=f'{OUT}{tag}-game-board.png')
    check('battlefield shows permanents', await page.locator('.zone--battle .card').count() >= 5)
    check('lands row shows 4', await page.locator('.zone--lands .card').count() == 4)
    check('playable cards glow', await page.locator('.zone--hand .card.is-playable').count() >= 1)

    # Cast Healer's Hawk from hand.
    await page.click(".zone--hand .card[aria-label=\"Healer's Hawk\"]")
    await page.wait_for_selector('.card-detail')
    await page.screenshot(path=f'{OUT}{tag}-card-detail.png')
    await page.click('.modal .btn--confirm')
    await page.wait_for_timeout(300)
    await tap_curtain(page)
    await page.wait_for_timeout(200)
    # Lex holds Giant Growth and could respond → priority prompt on Lex's view
    jewel = (await page.locator('.jewel span').text_content()).strip()
    check('opponent gets a PASS prompt (has an instant)', jewel == 'PASS', jewel)
    await page.screenshot(path=f'{OUT}{tag}-priority.png')
    await pass_all(page)
    check("Healer's Hawk resolved", await page.locator(".zone--battle .card[aria-label=\"Healer's Hawk\"]").count() == 1)

    # Swords to Plowshares → target decision
    await page.click('.zone--hand .card[aria-label="Swords to Plowshares"]')
    await page.click('.modal .btn--confirm')
    await page.wait_for_selector('.pick-list')
    await page.screenshot(path=f'{OUT}{tag}-target.png')
    await page.click('.pick:has-text("Colossal Dreadmaw")')
    await pass_all(page)
    log = await page.locator('.glog__list').text_content()
    check('swords exiled the dreadmaw and gave life', 'exiled' in log and 'gains 6 life' in log, log[:300])

    # Combat
    await page.click('[data-act="next-phase"]')
    await page.wait_for_timeout(300)
    check('jewel says ATTACK', (await page.locator('.jewel span').text_content()).strip() == 'ATTACK')
    await jewel_go(page)
    await page.wait_for_selector('.combat-list')
    await page.click('[data-all]:has-text("Lex")')
    await page.screenshot(path=f'{OUT}{tag}-attack.png')
    await page.click('#attackConfirm')
    await page.wait_for_timeout(400)
    await tap_curtain(page)
    await page.wait_for_timeout(300)
    # Lex: priority (giant growth) then blocks
    for _ in range(4):
        await tap_curtain(page)
        if await page.locator('.block-row').count():
            break
        if (await page.locator('.jewel span').text_content()).strip() == 'PASS':
            await jewel_go(page); await page.wait_for_timeout(300)
    await page.wait_for_selector('.block-row')
    await page.screenshot(path=f'{OUT}{tag}-blocks.png')
    await page.click('#blockConfirm')
    for _ in range(6):
        await page.wait_for_timeout(250)
        await tap_curtain(page)
        if await page.locator('.jewel:not([disabled])').count() and (await page.locator('.jewel span').text_content()).strip() == 'PASS':
            await jewel_go(page)
    life = await page.locator('.opp__life').first.text_content()
    check('Lex took combat damage', int(life) < 46, life)
    await page.screenshot(path=f'{OUT}{tag}-after-combat.png')

    # Host tools + table + log + settings popups
    await page.click('[data-act="tools"]'); await page.wait_for_selector('.host-players'); await page.screenshot(path=f'{OUT}{tag}-host-tools.png'); await page.click('.modal [data-modal-back]')
    await page.click('[data-act="table"]'); await page.wait_for_selector('.table-view'); await page.screenshot(path=f'{OUT}{tag}-table.png'); await page.click('.modal [data-modal-back]')
    await page.click('[data-act="opponent"]'); await page.wait_for_selector('.board'); await page.screenshot(path=f'{OUT}{tag}-opponent.png'); await page.click('.modal [data-modal-back]')
    await page.click('[data-act="settings"]'); await page.wait_for_selector('text=Guidance on this device'); await page.screenshot(path=f'{OUT}{tag}-settings.png'); await page.click('.modal [data-modal-back]')

    # Reload → Continue Game
    await page.wait_for_timeout(900)
    await page.reload()
    await page.wait_for_function('window.__ccReady === true')
    await page.wait_for_function("!document.querySelector('[data-act=\"continue\"]').disabled", timeout=5000)
    await page.click('[data-act="continue"]')
    await page.wait_for_selector('.game .zone--battle .card')
    check('game restored after reload', await page.locator('.zone--battle .card').count() >= 4)
    print(tag, 'errors:', page.errors[:6])
    check('no console errors', not page.errors, str(page.errors[:3]))
    await page.context.close()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device, tag in ((PHONE, 'phone'), (IPAD, 'ipad')):
            if len(sys.argv) > 1 and sys.argv[1] != tag:
                continue
            await flow(browser, device, tag)
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)

if __name__ == '__main__':
    asyncio.run(main())
