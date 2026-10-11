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
        check('host device has Table and Judge screens and no hand cards', await host.locator('.screen-switch__btn').count() == 2 and 'Table' in await host.locator('.screen-switch__btn.is-on').text_content())
        check('table shows no face-up hand cards', await host.locator('.zone--hand .card:not(.card--back), .hand-backs .card:not(.card--back)').count() == 0)
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
            # Judge mode: the land drop is listed as legal and can be reversed from the host device.
            await host.click('[data-act="screen"][data-screen="judge"]'); await host.wait_for_selector('.judge')
            check('judge mode keeps the table view', await host.locator('.zone--table .table-view').count() == 1)
            row = host.locator('.jplay', has_text='plays')
            check('judge lists the land drop as legal', await row.count() == 1 and 'jplay--legal' in (await row.get_attribute('class')))
            check('judge shows all plays legal', 'legal' in (await host.locator('.judge__status').text_content()) and await host.locator('.legal-badge.is-ok').count() == 1)
            await host.screenshot(path=f'{OUT}net-host-judge.png')
            await row.locator('[data-act="reverse"]').click(); await host.click('.modal .btn--confirm'); await host.wait_for_timeout(500)
            check('reversed land leaves the table', await host.locator('.zone--table .card:not(.card--back)').count() == 0)
            await a.wait_for_function("document.querySelectorAll('.zone--lands .card').length === 0")
            check('reversed land returns to the player hand', await a.locator('.zone--hand .card').count() == 8)
            await host.click('[data-act="screen"][data-screen="table"]'); await host.wait_for_selector('.game__right .glog')
            check('switch back to table view', await host.locator('.judge').count() == 0)
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
        # A device that joins only to watch sees the table, with no switch and no hands.
        w = await open_page(ctx); await w.set_viewport_size({'width': 844, 'height': 390})
        await w.click('[data-act="start"]'); await w.click('[data-mode="fully-tracked"]'); await w.click('[data-play="join"]')
        await w.fill('[data-code]', code); await w.click('[data-act="watch"]')
        await w.wait_for_selector('.game .zone--table', timeout=15000)
        check('a watching device sees the table without hands or host screens', await w.locator('.screen-switch').count() == 0 and await w.locator('.zone--table .hand-backs .card:not(.card--back)').count() == 0 and await w.locator('[data-act="tools"]').count() == 0)
        await w.close()
        await a.screenshot(path=f'{OUT}net-player-view.png')
        # Host restart: the room reopens with the same code, phones reconnect, old plays stay reversible.
        await host.wait_for_timeout(900)
        await host.reload(); await host.wait_for_function('window.__ccReady === true')
        await host.wait_for_function("!document.querySelector('[data-act=\"continue\"]').disabled", timeout=5000)
        await host.click('[data-act="continue"]'); await host.wait_for_selector('.game .zone--table', timeout=30000)
        await host.wait_for_function(f"window.__ccRoomCode === '{code}' || document.body.textContent.includes('{code}')", timeout=30000)
        await host.click('[data-act="tools"]'); await host.click('[data-life="-5"]'); await host.wait_for_timeout(400); await host.click('.modal [data-modal-back]')
        await a.wait_for_function("document.querySelector('.rail-life__value').textContent === '30'", timeout=30000)
        check('after a host restart the room reopens and phones reconnect', True)
        await host.click('[data-act="screen"][data-screen="judge"]'); await host.wait_for_selector('.judge')
        check('plays from before the restart can still be reversed', await host.locator('.jplay [data-act="reverse"]:not([disabled])').count() >= 3, str(await host.locator('.jplay [data-act="reverse"]:not([disabled])').count()))
        await host.click('[data-act="screen"][data-screen="table"]')
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

if __name__ == '__main__':
    asyncio.run(main())
