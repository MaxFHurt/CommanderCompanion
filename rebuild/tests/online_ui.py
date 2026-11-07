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


def fake_camera(png):
    """A one-frame Y4M video of the picture, for Chromium's fake camera."""
    from PIL import Image
    img = Image.open(png).convert('RGB')
    canvas = Image.new('RGB', (640, 480), 'white')
    img.thumbnail((440, 440))
    canvas.paste(img, ((640 - img.width) // 2, (480 - img.height) // 2))
    y, cb, cr = canvas.convert('YCbCr').split()
    out = png.replace('.png', '.y4m')
    with open(out, 'wb') as f:
        f.write(b'YUV4MPEG2 W640 H480 F10:1 Ip A1:1 C420jpeg\n')
        for _ in range(10):
            f.write(b'FRAME\n' + y.tobytes() + cb.resize((320, 240)).tobytes() + cr.resize((320, 240)).tobytes())
    return out


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
            await a.set_viewport_size({'width': 844, 'height': 390}); await a.wait_for_timeout(300)
            await a.screenshot(path=f'{OUT}online-wait-phone.png')
            await a.set_viewport_size({'width': 1180, 'height': 820})

            # Copy code, and a QR code another phone can scan with the app's camera.
            await a.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://127.0.0.1:4180')
            await a.click('[data-share-act="copy"]')
            check('Copy code puts the code on the clipboard', (await a.evaluate('navigator.clipboard.readText()')) == code)
            link = await a.locator('[data-share-link]').get_attribute('data-share-link')
            check('the invite link carries the code', f'join={code}' in link, link)
            qr_png = f'{OUT}online-qr.png'
            await a.locator('.share-code__qr').screenshot(path=qr_png)
            cam = await p.chromium.launch(args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={fake_camera(qr_png)}'])
            s1 = await new_page(cam, PHONE, Q)
            await s1.context.grant_permissions(['camera'], origin='http://127.0.0.1:4180')
            await open_online(s1)
            await s1.click('[data-act="scan"]')
            await s1.wait_for_selector('text=invited you', timeout=20000)
            check('scanning the QR code with the app opens that game\'s join screen', code in await s1.locator('h1').text_content())
            await cam.close()

            # Lex opens the invite link (what the phone camera or a text message opens).
            await b.goto(link)
            await b.wait_for_function('window.__ccReady === true')
            await b.wait_for_selector('text=invited you', timeout=15000)
            check('the invite link opens straight on the join screen', 'join=' not in b.url, b.url)
            check('joiner sees who invited them and the rules', await b.locator('text=Aaron').count() >= 1)
            await fill_seat(b, 'Lex', 'simic')
            await b.click('[data-act="take-seat"]')
            await b.wait_for_selector('.game', timeout=20000)
            await a.wait_for_selector('.game', timeout=20000)
            check('both devices enter the game once every seat is filled', True)
            for pg in (a, b):
                await pg.wait_for_selector('text=opening hand', timeout=15000)
            check('each player sees their own 7 cards', await a.locator('.modal .card').count() == 7 and await b.locator('.modal .card').count() == 7)
            held = await asyncio.gather(*(session_eval(pg, "return [s.server === true, s.game === undefined, JSON.stringify(s.view()).includes('remainingLibrary')]") for pg in (a, b)))
            check('the game is dealt and run on the server: no device holds the whole game', all(h == [True, True, False] for h in held), str(held))
            hidden = await session_eval(b, "const v = s.view(); return { opp: v.players.find(p => p.playerId !== v.you).hand, lib: JSON.stringify(v).includes('remainingLibrary') };")
            check('Lex cannot see Aaron\'s hand', hidden['opp'] is None and not hidden['lib'], str(hidden))

            await a.click('#keepHand')
            await b.wait_for_function("(async () => { const { getSession } = await import('./src/app/session.js'); return getSession().view().log.some(e => /Aaron keeps/.test(e.text)); })()", timeout=15000)
            check('Aaron keeping reaches Lex', True)
            await b.click('#keepHand')
            await a.wait_for_function("document.querySelectorAll('.zone--hand .card').length === 8", timeout=15000)
            check('Aaron sees Lex keep and draws for turn (8 cards)', True)
            check('Lex is waiting on Aaron', 'Aaron' in await b.locator('.tip').text_content())

            # Refused: acting for the other player, host powers.
            r = await session_eval(b, "return [await s.send({ type: 'pass', as: s.view().players.find(p => p.playerId !== s.view().you).playerId }), await s.send({ type: 'edit', edit: { kind: 'life', playerId: s.view().you, delta: 50 } })];")
            check('an online device cannot act for another player or edit the game', all(not x['ok'] for x in r), str(r))

            # Aaron plays a land; Lex sees it.
            land = a.locator('.zone--hand .card.is-playable').first
            if await land.count():
                await land.click(); await a.click('.modal .btn--confirm')
                ok = await b.wait_for_function("""async () => { const { getSession } = await import('./src/app/session.js'); const v = getSession().view(); return v.players.find(p => p.playerId !== v.you).battlefield.length === 1; }""", timeout=15000)
                check('Aaron\'s land reaches Lex\'s device', bool(ok))

            # Both chat at the same moment: the server plays the second one again on the newer game.
            await asyncio.gather(session_eval(a, "return s.send({ type: 'chat', text: 'from Aaron' });"), session_eval(b, "return s.send({ type: 'chat', text: 'from Lex' });"))
            for pg in (a, b):
                await pg.wait_for_function("""async () => { const { getSession } = await import('./src/app/session.js'); const t = getSession().view().chat.map(c => c.text); return t.includes('from Aaron') && t.includes('from Lex'); }""", timeout=20000)
            check('two moves at the same time both survive', True)

            # Offline: the move is not made (the server checks every move) and the device says so; it works again once back.
            await b.route(WORKER, lambda r: r.abort())
            off = await session_eval(b, "return s.send({ type: 'chat', text: 'offline hello' });")
            check('offline: the move is refused and the device says so', not off['ok'] and (await session_eval(b, "return s.status();")) == 'offline', str(off))
            await b.unroute(WORKER)
            back = await session_eval(b, "return s.send({ type: 'chat', text: 'back hello' });")
            await a.wait_for_function("""async () => { const { getSession } = await import('./src/app/session.js'); return getSession().view().chat.some(c => c.text === 'back hello'); }""", timeout=30000)
            check('moves go through again when the connection is back', back['ok'] and (await session_eval(b, "return s.status();")) == 'saved')

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

            # A third device with only the code gets no seat (and no view); with Lex's games list (the online profile) it is Lex.
            c = await new_page(browser, PHONE, Q)
            await open_online(c)
            await c.fill('[data-code]', code); await c.click('[data-act="join-code"]')
            await c.wait_for_selector('text=no seat in this game')
            check('a device with only the code cannot open a seat', await c.locator('.game').count() == 0)
            rows = await b.evaluate("localStorage.getItem('cc-online-games')")
            await c.evaluate(f"localStorage.setItem('cc-online-games', {repr(rows)})")
            await c.reload(); await c.wait_for_function('window.__ccReady === true')
            await open_online(c)
            await c.click(f'[data-act="open"][data-code="{code}"]')
            await c.wait_for_selector('.game', timeout=15000)
            check('a new device can carry on as Lex', (await session_eval(c, "return s.view().you;")) == (await session_eval(b, "return s.view().you;")))

            await a.screenshot(path=f'{OUT}online-game.png')

            # Online profile: save on one device, load it on a new one, quiet save after a change.
            d = await new_page(browser, IPAD, Q)
            await d.evaluate("localStorage.setItem('cc-online-games', JSON.stringify([{code:'QWERTY', clientId:'x', name:'Max', at:1}]))")
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
            games = await e.evaluate("JSON.parse(localStorage.getItem('cc-online-games') || '[]').map(r => r.code)")
            check('the online games list comes with the profile', 'QWERTY' in games, str(games))
            await e.click('[data-act="back"]'); await e.wait_for_timeout(1000)
            await d.fill('#profileName', 'Max H'); await d.press('#profileName', 'Tab')
            await d.click('[data-act="back"]'); await d.wait_for_timeout(1500)
            rev = await d.evaluate("JSON.parse(localStorage.getItem('cc-online-profile')).rev")
            check('a linked device saves again by itself after a change', rev == 2, str(rev))
            await e.reload(); await e.wait_for_selector('.landing'); await e.wait_for_timeout(1500); await e.click('[data-act="profile"]')
            name = await e.input_value('#profileName')
            check('a linked device takes the newer profile when the app opens', name == 'Max H', name)
            # a game played on one device is offered on the other
            await d.evaluate("""() => { const at = new Date().toISOString();
              localStorage.setItem('cc-game-v1', JSON.stringify({ savedAt: Date.now(), value: { savedAt: at, status: 'active', role: 'host-device', seatId: null, roomCode: null, game: { probe: 'carried' } } })); }""")
            await d.click('[data-act="profile"]'); await d.click('[data-act="back"]'); await d.wait_for_timeout(1500)
            rev = await d.evaluate("JSON.parse(localStorage.getItem('cc-online-profile')).rev")
            check('the game in progress is saved with the profile', rev == 3, str(rev))
            await e.click('[data-act="back"]'); await e.wait_for_timeout(500); await e.reload()
            await e.wait_for_selector('text=Continue your game?', timeout=10000)
            await e.click('.modal button:has-text("Continue here")'); await e.wait_for_timeout(800)
            probe = await e.evaluate("(JSON.parse(localStorage.getItem('cc-game-v1') || 'null')?.value?.game || {}).probe")
            check('the other device offers the game and carries it over when asked', probe == 'carried', str(probe))
            check('Continue is ready for the carried game', await e.is_enabled('[data-act="continue"]'))
            # both devices change: nothing is overwritten, the player chooses
            await d.click('[data-act="profile"]'); await d.fill('#profileName', 'Max D'); await d.press('#profileName', 'Tab'); await d.click('[data-act="back"]'); await d.wait_for_timeout(1500)
            await e.click('[data-act="profile"]'); await e.fill('#profileName', 'Max E'); await e.press('#profileName', 'Tab')
            await e.click('[data-act="online"]')
            await e.click('[data-online="save"]')
            await e.wait_for_selector('text=Saved from another device')
            check('saving over a newer copy from another device asks first', True)
            await e.click('.modal .btn--cancel:text-is("Cancel")')
            # closing a deck in the Deck Builder sends the edits to the online copy straight away
            before = await d.evaluate("JSON.parse(localStorage.getItem('cc-online-profile')).rev")
            await d.goto(d.url.split('/index.html')[0].split('?')[0].rstrip('/') + '/deck/index.html' + Q); await d.wait_for_timeout(1500)
            await d.evaluate("() => { const x = S.profile.decks[0]; S.deckId = x.id; S.view = 'decks'; S.open = true; render(); x.name = 'Synced Deck'; PROF.dirty = true; S.open = false; render(); }")
            await d.wait_for_function(f"JSON.parse(localStorage.getItem('cc-online-profile')).rev > {before}", timeout=10000)
            online = await d.evaluate(f"fetch('http://127.0.0.1:{PORT}/profiles/' + JSON.parse(localStorage.getItem('cc-online-profile')).key).then(r => r.json()).then(j => (j.backup.deckBuilder?.decks || []).map(x => x.name))")
            check('closing a deck in the Deck Builder sends it to the online profile', 'Synced Deck' in online, str(online))
            before = await d.evaluate("JSON.parse(localStorage.getItem('cc-online-profile')).rev")
            await d.evaluate("() => { const x = S.profile.decks[0]; S.deckId = x.id; S.view = 'decks'; S.open = true; render(); x.name = 'Hidden Deck'; touch(); Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange')); }")
            await d.wait_for_function(f"JSON.parse(localStorage.getItem('cc-online-profile')).rev > {before}", timeout=10000)
            online = await d.evaluate(f"fetch('http://127.0.0.1:{PORT}/profiles/' + JSON.parse(localStorage.getItem('cc-online-profile')).key).then(r => r.json()).then(j => (j.backup.deckBuilder?.decks || []).map(x => x.name))")
            check('putting the app away with a deck open sends the edits too', 'Hidden Deck' in online, str(online))
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
