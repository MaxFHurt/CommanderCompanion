"""Hosted Table Tracker over the same-browser loopback: host device (Table / Judge) + two phones that pick seats."""
import asyncio, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
from shots import PHONE, IPAD, OUT, URL, NAMES
from game_ui import check, results

Q = '?net=loopback'

async def open_page(ctx, size=None):
    page = await ctx.new_page()
    if size: await page.set_viewport_size(size)
    page.errors = []
    page.on('console', lambda m: page.errors.append(m.text) if m.type == 'error' and 'ERR_' not in m.text else None)
    page.on('pageerror', lambda e: page.errors.append('PAGEERROR ' + str(e)))
    await page.route('https://api.scryfall.com/**', lambda r: r.abort())
    await page.goto(URL + Q)
    await page.wait_for_function('window.__ccReady === true')
    return page

async def host_table(page, players=3, play='host-device'):
    await page.click('[data-act="start"]'); await page.click('[data-mode="table-tracker"]'); await page.click(f'[data-track="{play}"]')
    await page.wait_for_selector('.setup-players')
    for _ in range(players - 2): await page.click('[data-act="add"]')
    for i in range(players): await page.fill(f'.setup-player[data-seat="{i}"] [data-field="name"]', NAMES[i])
    await page.click('[data-act="start"]'); await page.wait_for_selector('.tracker .tp')
    await page.wait_for_function('!!window.__ccRoomCode')
    return await page.evaluate('window.__ccRoomCode')

async def join(page, code, name, seat_name):
    await page.click('[data-act="start"]'); await page.click('[data-mode="table-tracker"]'); await page.click('[data-track="join"]')
    await page.fill('[data-code]', code); await page.fill('[data-name]', name); await page.click('[data-act="join"]')
    await page.wait_for_selector('.tjoin [data-seat]', timeout=15000)
    if seat_name: await page.locator('.tjoin [data-seat]', has_text=seat_name).click()
    else: await page.click('.tjoin [data-seat=""]')
    await page.wait_for_selector('.tracker .tp')

def life(page, i): return page.locator('.tp').nth(i).locator('[data-life]')

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device, tag in ((IPAD, 'ipad'), (PHONE, 'phone')):
            ctx = await browser.new_context(**device)
            host = await open_page(ctx)
            code = await host_table(host)
            check(f'{tag}: host table shows the room code and a Table / Judge switch', code in await host.text_content('#trackerTurn') and await host.locator('#trackerScreens .screen-switch__btn').count() == 2)
            a = await open_page(ctx, {'width': 844, 'height': 390}); b = await open_page(ctx, {'width': 844, 'height': 390}); w = await open_page(ctx, {'width': 844, 'height': 390})
            await join(a, code, 'Aaron', 'Aaron'); await join(b, code, 'Lex', 'Lex'); await join(w, code, 'Pat', None)
            check(f'{tag}: phone shows which seat it tracks', 'You: Aaron' in await a.text_content('#trackerTurn') and 'is-you' in await a.locator('.tp').nth(0).get_attribute('class'))
            check(f'{tag}: phone has no host-only tools', await a.locator('[data-tool="reset"], [data-tool="players"], [data-act="clear-log"]').count() == 0)
            taken = await open_page(ctx, {'width': 844, 'height': 390})
            await taken.click('[data-act="start"]'); await taken.click('[data-mode="table-tracker"]'); await taken.click('[data-track="join"]')
            await taken.fill('[data-code]', code); await taken.fill('[data-name]', 'Late'); await taken.click('[data-act="join"]'); await taken.wait_for_selector('.tjoin [data-seat]')
            check(f'{tag}: seats already claimed cannot be picked', await taken.locator('.tjoin [data-seat][disabled]').count() == 2)
            await taken.close()

            # Aaron loses 3 on his phone; the host and Lex see it.
            for _ in range(3): await a.locator('.tp').nth(0).locator('[data-act="life"][data-delta="-1"]').click()
            await host.wait_for_function("document.querySelectorAll('.tp [data-life]')[0].textContent === '37'")
            await b.wait_for_function("document.querySelectorAll('.tp [data-life]')[0].textContent === '37'")
            check(f'{tag}: a phone change reaches the host and the other phones', True)
            # Lex changes Aaron's life: allowed, but flagged in the judge record.
            await b.locator('.tp').nth(0).locator('[data-act="life"][data-delta="-1"]').click()
            await host.wait_for_function("document.querySelectorAll('.tp [data-life]')[0].textContent === '36'")
            # The watcher cannot change anything.
            await w.locator('.tp').nth(1).locator('[data-act="life"][data-delta="-1"]').click(); await w.wait_for_timeout(300)
            check(f'{tag}: a watching phone cannot change the table', (await life(host, 1).text_content()) == '40')
            # Host gives Charlie 10 poison: the Judge badge turns red.
            await host.locator('.tp').nth(2).locator('[data-life]').click(); await host.wait_for_selector('.life-editor')
            for _ in range(10): await host.click('.modal [data-pop="poison"][data-delta="1"]')
            await host.click('.modal .btn--confirm')
            check(f'{tag}: Judge badge shows a rules problem', await host.locator('#trackerScreens .legal-badge.is-bad').count() == 1)
            await host.screenshot(path=f'{OUT}{tag}-tracker-host-table.png')
            await host.click('[data-act="screen"][data-screen="judge"]'); await host.wait_for_selector('#trackerJudge:not([hidden]) .jplay')
            rows = host.locator('.jplay')
            texts = [await rows.nth(i).text_content() for i in range(await rows.count())]
            check(f'{tag}: judge record lists every change with who made it', await rows.count() == 3 and 'by Aaron' in texts[2] and '3 taps' in texts[2] and 'by Lex' in texts[1], str(texts))
            check(f'{tag}: changing another seat is flagged', 'jplay--other' in await rows.nth(1).get_attribute('class'))
            check(f'{tag}: judge names the rules problem', 'Charlie: 10 poison' in await host.text_content('.judge__status'))
            check(f'{tag}: judge mode keeps the table on screen', await host.locator('.tp').count() == 3 and await host.locator('.tlog').is_hidden())
            await host.screenshot(path=f'{OUT}{tag}-tracker-host-judge.png')
            await a.screenshot(path=f'{OUT}{tag}-tracker-phone.png')
            # Reverse Lex's change (and the poison after it).
            await rows.nth(1).locator('[data-act="reverse"]').click(); await host.click('.modal .btn--confirm')
            await a.wait_for_function("document.querySelectorAll('.tp [data-life]')[0].textContent === '37'")
            check(f'{tag}: reversing restores the table on every device', (await life(host, 0).text_content()) == '37' and await host.locator('#trackerScreens .legal-badge.is-ok').count() == 1)
            # Aaron undoes his own newest change from the phone.
            await a.click('[data-act="undo"]')
            await host.wait_for_function("document.querySelectorAll('.tp [data-life]')[0].textContent === '38'")
            check(f'{tag}: a phone can undo its own newest change (one tap at a time)', True)
            await host.click('[data-act="screen"][data-screen="table"]')
            check(f'{tag}: switch back to the table and its log', await host.locator('.tlog').is_visible() and 'Judge reversed' in await host.inner_text('#trackerLog'))
            for pg, n in ((host, 'host'), (a, 'a'), (b, 'b'), (w, 'w')):
                check(f'{tag}: no console errors ({n})', not pg.errors, str(pg.errors[:3]))
            await ctx.close()
        # A host who plays too: their own seat is marked and cannot be claimed by a phone.
        ctx = await browser.new_context(**IPAD)
        host = await open_page(ctx)
        code = await host_table(host, 2, 'host-player')
        check('playing host: own seat is marked', 'is-you' in await host.locator('.tp').nth(0).get_attribute('class'))
        b = await open_page(ctx, {'width': 844, 'height': 390})
        await b.click('[data-act="start"]'); await b.click('[data-mode="table-tracker"]'); await b.click('[data-track="join"]')
        await b.fill('[data-code]', code); await b.fill('[data-name]', 'Lex'); await b.click('[data-act="join"]'); await b.wait_for_selector('.tjoin [data-seat]')
        check('playing host: their seat shows as taken by the host', 'Taken by the host' in await b.text_content('.tjoin'))
        await b.locator('.tjoin [data-seat]', has_text='Lex').click(); await b.wait_for_selector('.tracker .tp')
        await host.locator('.tp').nth(1).locator('[data-act="life"][data-delta="-1"]').click()
        await host.click('[data-act="screen"][data-screen="judge"]'); await host.wait_for_selector('.jplay')
        check('playing host: changing another seat is a host change', 'jplay--host' in await host.locator('.jplay').first.get_attribute('class'))
        await b.wait_for_function("document.querySelectorAll('.tp [data-life]')[1].textContent === '39'")
        check('playing host: phones see host changes', True)
        await ctx.close()
        await browser.close()
    print(f'{sum(results)}/{len(results)} passed')
    sys.exit(0 if all(results) else 1)

if __name__ == '__main__':
    asyncio.run(main())
