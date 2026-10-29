"""Online games (play over time): two devices, the Worker run locally by cloud/dev-server.mjs.
Needs the static server on port 4180; this test starts and stops the Worker on port 8787 itself."""
import asyncio, os, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT
from game_ui import new_page, fill_seat, check, results

PORT = 8787
Q = f'?online=http://127.0.0.1:{PORT}'
WORKER = f'http://127.0.0.1:{PORT}/**'
ROOT = os.path.join(os.path.dirname(__file__), '..', '..')


def start_worker():
    proc = subprocess.Popen(['node', 'cloud/dev-server.mjs', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL)
    for _ in range(50):
        try: urllib.request.urlopen(f'http://127.0.0.1:{PORT}/'); return proc
        except Exception: time.sleep(0.1)
    raise RuntimeError('test Worker did not start')


async def session_eval(page, body):
    return await page.evaluate(f"async () => {{ const {{ getSession }} = await import('./src/app/session.js'); const s = getSession(); {body} }}")


async def open_online(page):
    await page.click('[data-act="start"]')
    await page.click('[data-mode="fully-tracked"]')
    await page.click('[data-play="online"]')
    await page.wait_for_selector('text=Your online games')


async def main():
    worker = start_worker()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            a = await new_page(browser, IPAD, Q)     # separate contexts = separate devices
            b = await new_page(browser, PHONE, Q)

            # Aaron creates the game.
            await open_online(a)
            check('new device has no online games yet', await a.locator('text=No online games yet').count() == 1)
            await a.click('[data-act="new"]')
            await a.wait_for_selector('.setup')
            check('setup asks for players joining online', await a.locator('text=Players joining online').count() == 1)
            await fill_seat(a, 'Aaron', 'white')
            await a.click('[data-act="start"]')
            await a.wait_for_selector('text=Setup check', timeout=15000)
            await a.click('.modal .btn--confirm')
            await a.wait_for_selector('.rules-editor')
            await a.click('[data-first-pick="0"]')
            await a.click('.modal .btn--confirm')
            await a.wait_for_selector('[data-online-code]', timeout=15000)
            code = (await a.locator('[data-online-code]').text_content()).strip()
            check('game code is 6 letters', len(code) == 6 and code.isalpha(), code)
            check('waiting room shows one open seat', await a.locator('text=Open seat').count() == 1)
            await a.screenshot(path=f'{OUT}online-wait.png')

            # Lex joins with the code on another device.
            await open_online(b)
            await b.fill('[data-code]', code)
            await b.click('[data-act="join-code"]')
            await b.wait_for_selector('text=invited you')
            check('joiner sees who invited them and the rules', await b.locator('text=Aaron').count() >= 1)
            await fill_seat(b, 'Lex', 'simic')
            await b.click('[data-act="take-seat"]')
            await b.wait_for_selector('.game', timeout=20000)
            await a.wait_for_selector('.game', timeout=20000)
            check('both devices enter the game once every seat is filled', True)
            for pg in (a, b):
                await pg.wait_for_selector('text=opening hand', timeout=15000)
            check('each player sees their own 7 cards', await a.locator('.modal .card').count() == 7 and await b.locator('.modal .card').count() == 7)
            same = await asyncio.gather(*(session_eval(pg, "return JSON.stringify(s.game.players.map(p => p.deck.remainingLibrary.map(c => c.instanceId)))") for pg in (a, b)))
            check('both devices start from the same shuffled table', same[0] == same[1])
            hidden = await session_eval(b, "const v = s.view(); return { opp: v.players.find(p => p.playerId !== v.you).hand, lib: JSON.stringify(v).includes('remainingLibrary') };")
            check('Lex cannot see Aaron\'s hand', hidden['opp'] is None and not hidden['lib'], str(hidden))

            await a.click('#keepHand')
            await b.wait_for_function("(async () => { const { getSession } = await import('./src/app/session.js'); const g = getSession().game; return g.flow.opening[g.players[0].playerId].kept; })()", timeout=15000)
            check('Aaron keeping reaches Lex', True)
            await b.click('#keepHand')
            await a.wait_for_function("document.querySelectorAll('.zone--hand .card').length === 8", timeout=15000)
            check('Aaron sees Lex keep and draws for turn (8 cards)', True)
            check('Lex is waiting on Aaron', 'Aaron' in await b.locator('.tip').text_content())

            # Refused: acting for the other player, host powers.
            r = await session_eval(b, "return [await s.send({ type: 'pass', as: s.game.players[0].playerId }), await s.send({ type: 'edit', edit: { kind: 'life', playerId: s.view().you, delta: 50 } })];")
            check('an online device cannot act for another player or edit the game', all(not x['ok'] for x in r), str(r))

            # Aaron plays a land; Lex sees it.
            land = a.locator('.zone--hand .card.is-playable').first
            if await land.count():
                await land.click(); await a.click('.modal .btn--confirm')
                ok = await b.wait_for_function("""async () => { const { getSession } = await import('./src/app/session.js'); const g = getSession().game; return g.players[0].deck.battlefield.length === 1; }""", timeout=15000)
                check('Aaron\'s land reaches Lex\'s device', bool(ok))

            # Both chat at the same moment: the second save is refused, catches up and repeats its message.
            await asyncio.gather(session_eval(a, "return s.send({ type: 'chat', text: 'from Aaron' });"), session_eval(b, "return s.send({ type: 'chat', text: 'from Lex' });"))
            for pg in (a, b):
                await pg.wait_for_function("""async () => { const { getSession } = await import('./src/app/session.js'); const t = getSession().game.chat.map(c => c.text); return t.includes('from Aaron') && t.includes('from Lex'); }""", timeout=20000)
            check('two moves at the same time both survive', True)

            # Offline: Lex's chat waits on the device, then saves when the connection is back.
            await b.route(WORKER, lambda r: r.abort())
            await session_eval(b, "return s.send({ type: 'chat', text: 'offline hello' });")
            await b.wait_for_timeout(600)
            check('offline device says so', (await session_eval(b, "return s.status();")) == 'offline')
            await b.unroute(WORKER)
            await a.wait_for_function("""async () => { const { getSession } = await import('./src/app/session.js'); return getSession().game.chat.some(c => c.text === 'offline hello'); }""", timeout=30000)
            check('the move saves when the connection is back', True)

            # Aaron closes the app and opens the game again later.
            await a.reload(); await a.wait_for_function('window.__ccReady === true')
            await open_online(a)
            await a.wait_for_selector(f'[data-act="open"][data-code="{code}"]')
            await a.wait_for_function(f"document.querySelector('[data-code=\"{code}\"]').textContent.includes('Your move')", timeout=10000)
            check('the list shows "Your move"', True)
            await a.screenshot(path=f'{OUT}online-list.png')
            await a.click(f'[data-act="open"][data-code="{code}"]')
            await a.wait_for_selector('.game', timeout=15000)
            check('reopened game has the same table', await a.locator('.zone--hand .card').count() >= 7)

            # A third device that never played here picks a seat.
            c = await new_page(browser, PHONE, Q)
            await open_online(c)
            await c.fill('[data-code]', code); await c.click('[data-act="join-code"]')
            await c.wait_for_selector('text=Which player are you?')
            await c.click('[data-act="pick-seat"] >> text=Lex')
            await c.wait_for_selector('.game', timeout=15000)
            check('a new device can carry on as Lex', (await session_eval(c, "return s.view().you;")) == (await session_eval(b, "return s.view().you;")))

            await a.screenshot(path=f'{OUT}online-game.png')

            # Online profile: save on one device, load it on a new one, quiet save after a change.
            d = await new_page(browser, IPAD, Q)
            await d.click('[data-act="profile"]'); await d.fill('#profileName', 'Max'); await d.press('#profileName', 'Tab')
            await d.click('[data-act="online"]'); await d.click('[data-online="save"]')
            await d.wait_for_selector('[data-profile-key]')
            key = (await d.locator('[data-profile-key]').text_content()).strip()
            check('saving online gives a 12-letter key', len(key.replace('-', '')) == 12, key)
            await d.screenshot(path=f'{OUT}online-profile.png')
            await d.click('.modal button:has-text("Close")')
            e = await new_page(browser, PHONE, Q)
            await e.click('[data-act="profile"]'); await e.click('[data-act="online"]')
            await e.fill('[data-key]', key.lower()); await e.click('[data-online="load-key"]')
            await e.click('.modal .btn--danger:text-is("Load Profile")')
            await e.wait_for_function("document.querySelector('#profileName')?.value === 'Max'", timeout=10000)
            check('another device loads the profile with the key', True)
            await d.fill('#profileName', 'Max H'); await d.press('#profileName', 'Tab')
            await d.click('[data-act="back"]'); await d.wait_for_timeout(1500)
            rev = await d.evaluate("JSON.parse(localStorage.getItem('cc-online-profile')).rev")
            check('a linked device saves again by itself after a change', rev == 2, str(rev))
            await e.click('[data-act="back"]'); await e.click('[data-act="profile"]'); await e.click('[data-act="online"]')
            await e.click('[data-online="save"]')
            await e.wait_for_selector('text=Saved from another device')
            check('saving over a newer copy from another device asks first', True)
            await e.click('.modal .btn--cancel:text-is("Cancel")')
            for name, pg in (('a', a), ('b', b), ('c', c), ('d', d), ('e', e)):
                errors = [e for e in pg.errors if '409 (Conflict)' not in e and 'ERR_FAILED' not in e]   # 409 = someone saved first, handled
                check(f'no page errors on {name}', not errors, '; '.join(errors[:3]))
            await browser.close()
    finally:
        worker.terminate()
    bad = [r for r in results if not r]
    print(f'\n{len(results) - len(bad)} of {len(results)} checks passed')
    sys.exit(1 if bad else 0)

os.makedirs(OUT, exist_ok=True)
asyncio.run(main())
