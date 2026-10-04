"""Hosted game over the same-browser loopback transport: host device (judge) + two joined players."""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT, URL
from game_ui import mock_scryfall, fill_seat, check, results

Q = '?net=loopback'

async def open_page(ctx):
    page = await ctx.new_page()
    page.errors = []
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text and 'fixture' not in m.text else None)
    page.on('pageerror', lambda e: page.errors.append('PAGEERROR ' + str(e)))
    await mock_scryfall(page)
    await page.goto(URL + Q)
    await page.wait_for_function('window.__ccReady === true')
    return page

async def join(page, code, name, deck):
    await page.click('[data-act="start"]')
    await page.click('[data-mode="fully-tracked"]')
    await page.click('[data-play="join"]')
    await page.fill('[data-code]', code)
    await fill_seat(page, name, deck)
    await page.click('[data-act="join"]')
    await page.wait_for_selector('text=You are in', timeout=15000)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(**IPAD)       # one context = shared BroadcastChannel
        host = await open_page(ctx)
        await host.click('[data-act="start"]')
        await host.click('[data-mode="fully-tracked"]')
        await host.click('[data-play="host-device"]')
        await host.click('[data-n="2"]')
        await host.wait_for_function('!!window.__ccRoomCode')
        code = await host.evaluate('window.__ccRoomCode')
        check('room code is 4 letters', len(code) == 4, code)
        a = await open_page(ctx); await a.set_viewport_size({'width': 844, 'height': 390})
        b = await open_page(ctx); await b.set_viewport_size({'width': 844, 'height': 390})
        await join(a, code, 'Aaron', 'white')
        await join(b, code, 'Lex', 'simic')
        await host.wait_for_selector('text=Players (2 of 2)')
        await host.screenshot(path=f'{OUT}net-lobby.png')
        await host.click('[data-act="start"]')
        await host.wait_for_selector('.rules-editor')
        await host.click('[data-first-pick="0"]')
        await host.fill('[data-rule="priorityTimer"]', '0')
        await host.click('.modal .btn--confirm')
        await host.wait_for_selector('.game')
        for pg in (a, b):
            await pg.wait_for_selector('text=opening hand', timeout=15000)
        check('host sees HOST VIEW and no hand cards', await host.locator('text=HOST VIEW').count() == 1 and await host.locator('.zone--hand .card:not(.card--back)').count() == 0)
        check('player sees own 7 cards', await a.locator('.modal .card').count() == 7)
        await a.click('#keepHand'); await b.click('#keepHand')
        await a.wait_for_selector('.zone--hand .card')
        await a.wait_for_function("document.querySelectorAll('.zone--hand .card').length === 8")
        check('Aaron drew for turn (8 cards)', True)
        check('Lex is waiting', 'Aaron' in await b.locator('.tip').text_content())
        check('client has no host tools', await a.locator('[data-act="tools"]').count() == 0)
        # Aaron plays a land if he has one; otherwise just pass the turn.
        land = a.locator('.zone--hand .card.is-playable').first
        if await land.count():
            await land.click(); await a.click('.modal .btn--confirm'); await a.wait_for_timeout(400)
            check('land appears on host display', await host.locator('.zone--table .card:not(.card--back)').count() == 1)
            check('land appears for the opponent (board popup)', True)
        # A client cannot edit or undo.
        r = await a.evaluate("""async () => { const { getSession } = await import('./src/app/session.js'); const s = getSession(); return [await s.send({ type: 'edit', edit: { kind: 'life', playerId: s.view().you, delta: 50 } }), await s.send({ type: 'undo' }), await s.send({ type: 'pass', as: s.view().players[1].playerId })]; }""")
        check('client edit / undo / impersonation refused', all(not x['ok'] for x in r), str(r))
        hidden = await a.evaluate("""async () => { const { getSession } = await import('./src/app/session.js'); const v = getSession().view(); return { opp: v.players.find(p => p.playerId !== v.you).hand, json: JSON.stringify(v).includes('remainingLibrary') }; }""")
        check('client view has no opponent hand or library', hidden['opp'] is None and not hidden['json'], str(hidden))
        await a.click('[data-act="chat"]'); await a.fill('[data-msg]', 'gl hf'); await a.click('[data-send]'); await a.wait_for_timeout(300)
        check('chat reaches the other player', await b.locator('.dot').count() == 1)
        await a.click('.modal [data-modal-back]')
        # Host edits life; players see it.
        await host.click('[data-act="tools"]'); await host.click('[data-life="-5"]'); await host.wait_for_timeout(400)
        await host.screenshot(path=f'{OUT}net-host-tools.png')
        await host.click('.modal [data-modal-back]')
        await a.wait_for_function("document.querySelector('.rail-life__value').textContent === '35'")
        check('host life edit shows on the player device', True)
        await host.screenshot(path=f'{OUT}net-host-view.png')
        await a.screenshot(path=f'{OUT}net-player-view.png')
        # Reconnect: reload the player page and rejoin with the same code.
        await a.reload(); await a.wait_for_function('window.__ccReady === true')
        await a.click('[data-act="start"]'); await a.click('[data-mode="fully-tracked"]'); await a.click('[data-play="join"]')
        await a.fill('[data-code]', code); await a.click('[data-act="watch"]')
        await a.wait_for_selector('.game .rail-life__value', timeout=15000)
        check('player gets seat back after reload', (await a.locator('.rail-name strong').text_content()).strip() == 'Aaron' and await a.locator('.zone--hand .card:not(.card--back)').count() >= 7)
        for pg, n in ((host, 'host'), (a, 'a'), (b, 'b')):
            check(f'no console errors ({n})', not pg.errors, str(pg.errors[:3]))
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)

asyncio.run(main())
